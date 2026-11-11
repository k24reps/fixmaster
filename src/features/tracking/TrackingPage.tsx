import { useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { repository, isSupabaseConfigured } from '@/data';
import {
  trackService,
  trackServiceByCode,
  TrackRateLimitedError,
  type TrackServiceResult,
} from '@/data/supabase-client';
import { STATUS_LABELS, STATUS_TONE, historyKind, partWarranties } from '@/lib/business/services';
import type { ServiceStatus } from '@/data/types';
import { nextStepFor, normalizeTrackCode, relativeSince } from '@/lib/business/tracking';
import { waLink } from '@/lib/business/notify';
import { slidingWindowAllow } from '@/lib/rate-limit';
import { fmtDate, localDateOf, localTimeStr } from '@/lib/time';
import { Icon } from '@/components/ui';
import { useSessionStore } from '@/stores/session';
import styles from './TrackingPage.module.css';

/** Normalized tracking result shared by both the cloud-RPC and local paths. */
interface TrackResult {
  orgName: string;
  /** Store contact so the customer knows who/where to reach. No pricing. */
  orgPhone: string;
  orgAddress: string;
  /** Store logo — the customer's only proof this page belongs to THEIR shop. */
  orgLogoUrl: string | null;
  /** Catatan bebas milik toko (jam buka, syarat garansi, aturan pengambilan). */
  orgNote: string;
  service: {
    serviceNo: string;
    device: string;
    category: string;
    status: string;
    warrantyServiceUntil: string | null;
    warrantyPartsUntil: string | null;
    /** Garansi per sparepart; kosong untuk tiket lama → pakai warrantyPartsUntil. */
    partWarranties: { name: string; until: string | null }[];
    pickedUp: boolean;
  } | null;
  publicHistory: { status: string; at: string; note?: string }[];
}

/**
 * Tanggal + jam untuk satu langkah timeline. Tanggal saja membuat tiga langkah
 * yang terjadi di hari yang sama terbaca identik ("2 Sep 2026" tiga kali) dan
 * menghapus rasa "ini bergerak cepat" — padahal `at` sudah membawa jamnya.
 * Timestamp rusak jatuh kembali ke tanggal saja, bukan "Invalid Date".
 */
function stepStamp(at: string): string {
  const date = fmtDate(localDateOf(at));
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? date : date + ' · ' + localTimeStr(d);
}

/** Hasil RPC cloud (lewat nomor maupun kode) dalam bentuk halaman ini. */
function fromCloud(r: TrackServiceResult | null): TrackResult {
  return {
    orgName: r?.orgName ?? 'FixMaster',
    orgPhone: r?.orgPhone ?? '',
    orgAddress: r?.orgAddress ?? '',
    orgLogoUrl: r?.orgLogoUrl ?? null,
    orgNote: r?.orgNote ?? '',
    service: r
      ? {
          serviceNo: r.serviceNo,
          device: r.device,
          category: r.category,
          status: r.status,
          warrantyServiceUntil: r.warrantyServiceUntil,
          warrantyPartsUntil: r.warrantyPartsUntil,
          partWarranties: r.partWarranties ?? [],
          pickedUp: r.pickedUp,
        }
      : null,
    publicHistory: (r?.publicHistory ?? []).filter((h) => !h.internal),
  };
}

/**
 * Public, no-login service tracking page, in two modes:
 *
 * - `/t/<kode>` (QR nota sejak 0100): kode acak per tiket lewat RPC
 *   `track_service_by_code`. Kodenya sendiri yang menunjuk toko dan tiket, jadi
 *   nomor tiket berikutnya tak bisa ditebak dari nota yang sedang dipegang.
 * - `/track?org=&no=`: nota dan pesan WhatsApp lama tetap terbuka, lewat RPC
 *   `track_service`.
 *
 * Cloud reads go through security-definer RPCs granted to `anon` — a direct
 * `services` table read is blocked by RLS for anonymous visitors. Local/dev
 * mode (no Supabase) reads the IndexedDB repository, scoped by the org query
 * param, and has no codes at all (data/servicePrint).
 */
export function TrackingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { code: routeCode } = useParams<{ code?: string }>();
  const codeMode = routeCode !== undefined;
  const trackCode = codeMode ? normalizeTrackCode(routeCode) : null;
  // Tracking is inherently org-scoped (service numbers like FM-0001 repeat
  // across shops). Prefer the ?org= param from a shared link; if absent (e.g.
  // an owner opening /track directly while logged in), fall back to the
  // session org so the lookup still works.
  const sessionOrgId = useSessionStore((s) => s.org?.id ?? '');
  const orgId = params.get('org') || sessionOrgId;
  const initialNo = params.get('no') ?? '';

  const [query, setQuery] = useState(codeMode ? (trackCode ?? routeCode ?? '') : initialNo);
  const [searchNo, setSearchNo] = useState(initialNo);
  const [throttleMsg, setThrottleMsg] = useState('');
  // Pengunjung yang datang dari tautan WhatsApp sudah membawa nomornya dan
  // hasilnya langsung tampil; kotak pencarian penuh cuma mendorong jawabannya
  // ke bawah lipatan. Jadi begitu ada hasil, panel ini menciut jadi satu
  // tautan — dan terbuka lagi kalau pengunjung memang mau mencari nomor lain.
  const [searchOpen, setSearchOpen] = useState(false);
  // Client-side defense-in-depth: throttle repeated lookups (the cloud RPC is
  // also throttled server-side at 60/min per org).
  const searchTimes = useRef<number[]>([]);

  const runSearch = () => {
    const { allowed, timestamps, retryAfter } = slidingWindowAllow(
      searchTimes.current,
      10,
      60_000,
    );
    searchTimes.current = timestamps;
    if (!allowed) {
      setThrottleMsg('Terlalu banyak pencarian. Coba lagi dalam ' + retryAfter + ' detik.');
      return;
    }
    setThrottleMsg('');
    if (codeMode) {
      const next = normalizeTrackCode(query);
      if (!next) {
        setThrottleMsg('Kode lacak terdiri dari 10 huruf dan angka, seperti di akhir alamat pada nota.');
        return;
      }
      setSearchOpen(false);
      navigate('/t/' + next);
      return;
    }
    if (!orgId) {
      // No org from the link and no logged-in session → we can't know which
      // shop's service to look up. Tell the visitor instead of silently doing
      // nothing (the lookup query stays disabled without an org).
      setThrottleMsg('Tautan tidak lengkap. Gunakan tautan lacak yang dikirim toko.');
      return;
    }
    setSearchNo(query);
    setSearchOpen(false);
  };

  // Kode yang bentuknya salah, atau mode lokal yang tak punya server untuk
  // menerjemahkannya, tak perlu ditanyakan ke mana pun: jawabannya pasti kosong.
  const codeUnresolvable = codeMode && (!trackCode || !isSupabaseConfigured);

  const { data, error, isFetching, isFetched, isError, refetch } = useQuery<TrackResult>({
    queryKey: codeMode ? ['track-code', trackCode] : ['track', orgId, searchNo],
    enabled: codeMode ? !codeUnresolvable : !!orgId && !!searchNo.trim(),
    // Batas laju server dihitung per menit; mengulang otomatis cuma memperpanjangnya.
    retry: (count, err) => !(err instanceof TrackRateLimitedError) && count < 3,
    queryFn: async () => {
      if (codeMode) return fromCloud(await trackServiceByCode(trackCode ?? ''));
      // Cloud: public RPC bypasses RLS safely for anonymous visitors.
      if (isSupabaseConfigured) return fromCloud(await trackService(orgId, searchNo.trim()));
      // Local/dev: read the IndexedDB repository, scoped to the org param.
      repository.setScope(orgId, null);
      const [org, services] = await Promise.all([
        repository.getSingleton('organization'),
        repository.list('services'),
      ]);
      const svc =
        services.find((s) => s.serviceNo.toLowerCase() === searchNo.trim().toLowerCase()) ?? null;
      const orgRec = org as
        | {
            name?: string;
            phone?: string;
            address?: string;
            logoDataUrl?: string | null;
            settings?: { publicNote?: string };
          }
        | null;
      return {
        orgName: orgRec?.name ?? 'FixMaster',
        orgPhone: orgRec?.phone ?? '',
        orgAddress: orgRec?.address ?? '',
        orgLogoUrl: orgRec?.logoDataUrl ?? null,
        orgNote: (orgRec?.settings?.publicNote ?? '').trim(),
        service: svc
          ? {
              serviceNo: svc.serviceNo,
              device: svc.device,
              category: svc.category,
              status: svc.status,
              warrantyServiceUntil: svc.warrantyServiceUntil,
              warrantyPartsUntil: svc.warrantyPartsUntil,
              partWarranties: partWarranties(svc.spareparts ?? []),
              pickedUp: svc.pickedUp,
            }
          : null,
        publicHistory: (svc?.history ?? []).filter((h) => !h.internal),
      };
    },
  });

  const orgName = data?.orgName ?? 'FixMaster';
  const orgPhone = data?.orgPhone ?? '';
  const orgAddress = data?.orgAddress ?? '';
  const orgLogoUrl = data?.orgLogoUrl ?? null;
  const orgNote = data?.orgNote ?? '';
  const service = data?.service ?? null;
  // Setelah Selesai, garansi kosong berarti "tanpa garansi" yang disengaja.
  const warrantyDecided = service?.status === 'selesai' || service?.status === 'lunas';
  const publicHistory = data?.publicHistory ?? [];
  // Gagal memuat (sinyal putus, server sibuk) BUKAN berarti nomornya salah.
  // Dulu keduanya jatuh ke pesan "tidak ditemukan", sehingga pelanggan mengira
  // salah ketik lalu menelepon toko, padahal cukup mencoba lagi.
  const loadFailed = isError && !isFetching;
  // Server menolak karena terlalu banyak permintaan dari jaringan ini: bukan
  // sinyal lemah (mencoba lagi sekarang tak menolong) dan bukan kode salah.
  const rateLimited = loadFailed && error instanceof TrackRateLimitedError;
  const notFound = codeUnresolvable || (isFetched && !isFetching && !isError && !service);
  const searched = codeMode ? (trackCode ?? routeCode ?? '') : searchNo.trim();

  // History datang urut lama → baru, jadi entri terakhir adalah yang terbaru.
  const lastUpdate = publicHistory.length
    ? relativeSince(publicHistory[publicHistory.length - 1].at)
    : null;
  const nextStep = service ? nextStepFor(service.status, service.pickedUp) : null;
  const statusTone = service
    ? (STATUS_TONE[service.status as keyof typeof STATUS_TONE] ?? 'neutral')
    : 'neutral';
  const statusLabel = service?.pickedUp
    ? 'Sudah Diambil'
    : service
      ? (STATUS_LABELS[service.status as keyof typeof STATUS_LABELS] ?? service.status)
      : '';
  // Chat kosong memaksa pelanggan menjelaskan ulang siapa dia dan unit mana,
  // padahal halaman ini sudah tahu keduanya.
  const contactMessage = service
    ? 'Halo ' + orgName + ', saya ingin menanyakan servis ' + service.serviceNo + ' (' + service.device + ').'
    : 'Halo ' + orgName + ', saya ingin menanyakan servis saya.';
  const contactLink = orgPhone ? waLink(orgPhone, contactMessage) : '';

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.logoMark}>
            {orgLogoUrl ? (
              <img src={orgLogoUrl} alt="" className={styles.logoImg} />
            ) : (
              <Icon name="screwdriver-wrench" aria-hidden />
            )}
          </span>
          <div className={styles.headerText}>
            <h1 className={styles.title}>{orgName}</h1>
            <p className={styles.subtitle}>Pantau progres perbaikan perangkat Anda secara langsung.</p>
          </div>
        </header>

        {service && !searchOpen ? (
          <button className={styles.searchToggle} onClick={() => setSearchOpen(true)}>
            <Icon name="magnifying-glass" aria-hidden />{' '}
            {codeMode ? 'Lacak kode lain' : 'Lacak nomor servis lain'}
          </button>
        ) : (
          <section className={styles.searchPanel}>
            <label className={styles.searchLabel} htmlFor="tracking-number">
              {codeMode ? 'Kode lacak' : 'Nomor servis'}
            </label>
            <div className={styles.searchBox}>
              <input
                id="tracking-number"
                className={styles.input}
                placeholder={codeMode ? 'Contoh: 7K3M9QXR2D' : 'Contoh: FM-0001'}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              />
              <button className={styles.searchBtn} onClick={runSearch} disabled={isFetching}>
                {isFetching ? <Icon name="circle-notch" className="spin" aria-hidden /> : <><Icon name="magnifying-glass" aria-hidden /> Lacak</>}
              </button>
            </div>
            <p className={styles.searchHint}>
              {codeMode
                ? 'Kodenya 10 huruf dan angka di akhir alamat lacak, tepat di bawah QR pada nota. '
                : 'Nomornya tercetak pada nota penerimaan dan ada di pesan WhatsApp dari toko. '}
              Halaman ini menampilkan status pengerjaan dan masa garansi, tanpa perlu masuk akun.
            </p>
          </section>
        )}

        {throttleMsg && (
          <div className={[styles.notFound, styles.fault].join(' ')}>
            <Icon name="triangle-exclamation" aria-hidden />
            <p>{throttleMsg}</p>
          </div>
        )}

        {rateLimited && (
          <div className={[styles.notFound, styles.fault].join(' ')} role="alert">
            <Icon name="clock" aria-hidden />
            <p>Terlalu banyak permintaan lacak dari jaringan ini.</p>
            <p className={styles.notFoundHint}>
              Tunggu sekitar satu menit, lalu coba lagi. Kode yang Anda buka tidak salah.
            </p>
            <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
              <Icon name="arrows-rotate" aria-hidden /> Coba lagi
            </button>
          </div>
        )}

        {loadFailed && !rateLimited && (
          <div className={[styles.notFound, styles.fault].join(' ')} role="alert">
            <Icon name="triangle-exclamation" aria-hidden />
            <p>Status servis belum bisa dimuat.</p>
            <p className={styles.notFoundHint}>
              Biasanya karena koneksi internet sedang lemah. Nomor yang Anda masukkan tidak
              berubah, cukup coba lagi.
            </p>
            <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
              <Icon name="arrows-rotate" aria-hidden /> Coba lagi
            </button>
          </div>
        )}

        {/* RPC mengembalikan nol baris baik untuk nomor salah ketik maupun kode
            toko yang keliru, jadi halaman ini tidak bisa menebak yang mana.
            Yang bisa dilakukan: mengulang nomor yang dicari (menangkap salah
            ketik) dan menyebut kedua kemungkinan itu apa adanya. Kode lacak
            sudah menunjuk tokonya sendiri, jadi yang tersisa hanya salah salin. */}
        {notFound && (
          <div className={[styles.notFound, styles.fault].join(' ')}>
            <Icon name="circle-question" aria-hidden />
            <p>
              {codeMode ? 'Kode' : 'Nomor'}{' '}
              <strong className={styles.notFoundNo}>{searched}</strong> tidak ditemukan.
            </p>
            <p className={styles.notFoundHint}>
              {codeMode
                ? 'Cocokkan dengan kode di akhir alamat lacak pada nota. Huruf O dan angka 0, juga I atau L dan angka 1, dianggap sama.'
                : 'Pastikan nomor diketik persis seperti pada nota, dan tautan yang Anda buka berasal dari toko tempat unit diservis.'}
            </p>
          </div>
        )}

        {service && (
          <div className={styles.result}>
            <div className={styles.resultHead}>
              <span className={styles.resultNo}>{service.serviceNo}</span>
              <h2>{service.device}</h2>
              <p className={styles.deviceMeta}>{service.category}</p>
            </div>

            {/* Instrument well — satu-satunya di halaman ini. Yang dibaca sekilas
                oleh pelanggan memang inilah: status, kebaruannya, dan apa yang
                harus dia lakukan. Kotak pencarian tidak pernah jadi pembacaan
                instrumen, jadi ia turun ke perlakuan input biasa. */}
            <div className={styles.statusWell}>
              <p className={styles.wellLabel}>Status pengerjaan</p>
              <p className={styles.statusReadout}>
                <span className={styles.led} data-tone={statusTone} aria-hidden />
                {statusLabel}
              </p>
              {lastUpdate && <p className={styles.lastUpdate}>Diperbarui {lastUpdate}</p>}
              {nextStep && (
                <p className={styles.nextStep} data-tone={nextStep.tone}>
                  <Icon
                    name={
                      nextStep.tone === 'wait'
                        ? 'clock'
                        : nextStep.tone === 'done'
                          ? 'circle-check'
                          : 'circle-info'
                    }
                    aria-hidden
                  />
                  <span>{nextStep.text}</span>
                </p>
              )}
            </div>

            <ul className={styles.timeline}>
              {[...publicHistory].reverse().map((h, i) => (
                <li key={i} className={[styles.timelineItem, i === 0 ? styles.current : ''].join(' ')}>
                  <span className={styles.dot} data-tone={STATUS_TONE[h.status as keyof typeof STATUS_TONE]} />
                  <div>
                    <strong>
                      {(() => {
                        const k = historyKind(h as { status: ServiceStatus | 'edit'; note: string });
                        return k === 'pickup'
                          ? 'Diambil'
                          : k === 'unpickup'
                            ? 'Tanda ambil dibatalkan'
                            : k === 'edit'
                              ? 'Diperbarui'
                              : (STATUS_LABELS[k] ?? h.status);
                      })()}
                    </strong>
                    <small>
                      <span className={styles.stamp}>{stepStamp(h.at)}</span>
                      {h.note ? ' · ' + h.note : ''}
                    </small>
                  </div>
                </li>
              ))}
            </ul>

            {(warrantyDecided || service.warrantyServiceUntil || service.warrantyPartsUntil) && (
              <div className={styles.warranty}>
                <span className={styles.blockLabel}>
                  <Icon name="shield-halved" aria-hidden /> Garansi
                </span>
                <div className={styles.warrantyRows}>
                  {(service.warrantyServiceUntil || warrantyDecided) && (
                    <div className={styles.warrantyRow}>
                      <span>Jasa</span>
                      <strong>
                        {service.warrantyServiceUntil
                          ? `s/d ${fmtDate(service.warrantyServiceUntil.slice(0, 10))}`
                          : 'Tanpa garansi'}
                      </strong>
                    </div>
                  )}
                  {service.partWarranties.length > 0
                    ? service.partWarranties.map((p, i) => (
                        <div key={`${p.name}-${i}`} className={styles.warrantyRow}>
                          <span>{p.name}</span>
                          <strong>{p.until ? `s/d ${fmtDate(p.until.slice(0, 10))}` : 'Tanpa garansi'}</strong>
                        </div>
                      ))
                    : service.warrantyPartsUntil && (
                        <div className={styles.warrantyRow}>
                          <span>Sparepart</span>
                          <strong>s/d {fmtDate(service.warrantyPartsUntil.slice(0, 10))}</strong>
                        </div>
                      )}
                </div>
              </div>
            )}

            {(orgPhone || orgAddress) && (
              <div className={styles.contact}>
                <span className={styles.blockLabel}>
                  <Icon name="store" aria-hidden /> Kontak Toko
                </span>
                {orgPhone && (
                  <a
                    className={styles.contactRow}
                    href={contactLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="whatsapp" aria-hidden /> {orgPhone}
                  </a>
                )}
                {orgAddress && (
                  <p className={styles.contactRow}>
                    <Icon name="map-pin" aria-hidden /> {orgAddress}
                  </p>
                )}
              </div>
            )}

            {/* Ditulis pemilik toko sendiri — jam buka, syarat garansi, aturan
                pengambilan. Inilah yang membuat halaman ini terbaca sebagai
                dokumen toko itu, bukan cetakan seragam. */}
            {orgNote && (
              <div className={styles.shopNote}>
                <span className={styles.blockLabel}>
                  <Icon name="note" aria-hidden /> Catatan Toko
                </span>
                <p className={styles.shopNoteBody}>{orgNote}</p>
              </div>
            )}
          </div>
        )}

        <footer className={styles.footer}>Didukung oleh FixMaster</footer>
      </div>
    </div>
  );
}
