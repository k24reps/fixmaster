import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui';
import { PLANS, OUTLET_ADDON_PRICE, PRO_INCLUDED_OUTLETS } from '@/config/plans';
import { fmtRp } from '@/lib/format';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  /** CTA handler — reveals the auth screen (signup/login). */
  onStart: () => void;
}

interface ModuleDef {
  slot: string;
  icon: IconName;
  title: string;
  desc: string;
  /** Marked when the module is a Pro-tier capability (locked on Solo). */
  pro?: boolean;
}

// The module rack, presented as slot-numbered rack-mounted units. Pro-only
// units carry a brand-LED "PRO" tag (same show-locked idiom as the sidebar).
const MODULES: ModuleDef[] = [
  { slot: 'M01', icon: 'screwdriver-wrench', title: 'Tiket Servis', desc: 'Lacak tiap perbaikan dari masuk sampai diambil, lengkap status & riwayat.' },
  { slot: 'M02', icon: 'cash-register', title: 'Kasir (POS)', desc: 'Jual sparepart & jasa, cetak struk, catat pembayaran dalam detik.' },
  { slot: 'M03', icon: 'users', title: 'Pelanggan', desc: 'Database pelanggan & perangkat, plus pelacakan servis publik.' },
  { slot: 'M04', icon: 'boxes-stacked', title: 'Inventori', desc: 'Pantau stok sparepart, harga modal, peringatan stok menipis.' },
  { slot: 'M05', icon: 'truck-field', title: 'Supplier & PO', desc: 'Kelola pemasok & pesanan pembelian agar restok tak pernah telat.', pro: true },
  { slot: 'M06', icon: 'wallet', title: 'Keuangan', desc: 'Kas masuk-keluar, laba per servis, ringkasan harian yang jelas.' },
  { slot: 'M07', icon: 'list-check', title: 'Tugas Internal', desc: 'SOP harian jadi checklist — buat banyak sekaligus, tugaskan per peran.', pro: true },
  { slot: 'M08', icon: 'calendar-check', title: 'Absensi', desc: 'Jam masuk-pulang karyawan dengan rekap kehadiran otomatis.', pro: true },
  { slot: 'M09', icon: 'chart-line', title: 'Laporan', desc: 'Tren omzet, servis, dan performa toko dalam grafik mudah dibaca.' },
  { slot: 'M10', icon: 'qrcode', title: 'Lacak Publik', desc: 'Pelanggan cek status servis sendiri lewat tautan — kurangi telepon.' },
  { slot: 'M11', icon: 'clock-rotate-left', title: 'Jejak Audit', desc: 'Setiap tindakan tercatat — tahu siapa mengubah apa dan kapan.' },
  { slot: 'M12', icon: 'shield-halved', title: 'Multi-Peran', desc: 'Owner, admin, dan karyawan punya akses sesuai perannya.' },
  { slot: 'M13', icon: 'download', title: 'Backup & Pulihkan', desc: 'Cadangkan seluruh data jadi satu berkas, pulihkan utuh kapan saja.' },
  { slot: 'M14', icon: 'moon', title: 'Mode Gelap', desc: 'Tema terang & gelap, nyaman dari pagi sampai tutup toko.' },
];

// Live diagnostic readout rows (mirrors the auth page rail + sidebar).
const READOUT: { k: string; v: string; led: 'ledOk' | 'ledLive' }[] = [
  { k: 'CAKUPAN', v: 'SEMUA ELEKTRONIK', led: 'ledOk' },
  { k: 'MODUL', v: '14 / 14 ONLINE', led: 'ledOk' },
  { k: 'SYNC', v: 'REALTIME', led: 'ledLive' },
  { k: 'DATA', v: 'TERISOLASI', led: 'ledOk' },
];

// "Symptoms of a shop without a system" — pain points reframed as fault
// diagnostics. Each fault (amber/red) pairs with the module that clears it.
interface FaultDef {
  icon: IconName;
  fault: string;
  fix: string;
}
const FAULTS: FaultDef[] = [
  { icon: 'clipboard-list', fault: 'Catatan servis tercecer di buku & chat WhatsApp.', fix: 'Tiket servis digital — status & riwayat tiap unit di satu tempat.' },
  { icon: 'boxes-stacked', fault: 'Stok sparepart hilang tanpa jejak, tahu-tahu habis.', fix: 'Inventori dengan harga modal & peringatan stok menipis.' },
  { icon: 'coins', fault: 'Bingung laba tipis ke mana, utang-piutang tak terlacak.', fix: 'Keuangan multi-dompet + laba per servis yang jelas.' },
  { icon: 'phone', fault: 'Pelanggan bolak-balik telepon "sudah jadi belum?".', fix: 'Tautan lacak publik — mereka cek status sendiri.' },
  { icon: 'user-clock', fault: 'Karyawan baru susah diawasi, tak tahu siapa salah.', fix: 'Peran, absensi, dan jejak audit tiap tindakan.' },
  { icon: 'chart-pie', fault: 'Tutup buku akhir bulan selalu bikin pusing.', fix: 'Laporan omzet & performa toko terbentuk otomatis.' },
];

interface FaqDef {
  q: string;
  a: string;
}
const FAQS: FaqDef[] = [
  { q: 'Apakah data toko saya aman?', a: 'Tiap toko terisolasi penuh (baris-level di database). Kamu juga bisa cadangkan seluruh data jadi satu berkas kapan saja.' },
  { q: 'Bisa dipakai saat internet mati?', a: 'Bisa. FixMaster mengutamakan kerja lokal — tetap jalan tanpa internet, lalu menyinkron saat kembali online.' },
  { q: 'Servis apa saja yang didukung?', a: 'Semua gadget & elektronik konsumen: HP, laptop, tablet, printer, konsol, dan perangkat elektronik lain — bukan cuma satu jenis.' },
  { q: 'Ribet tidak pindah dari buku/Excel?', a: 'Mulai dari uji coba 14 hari tanpa kartu. Paket Pro mendukung impor data agar perpindahan mulus.' },
  { q: 'Berapa karyawan yang bisa masuk?', a: 'Solo untuk 1 pengguna. Pro membuka pengguna tak terbatas dengan peran owner/admin/karyawan.' },
  { q: 'Bagaimana cara bayarnya?', a: 'Lewat QRIS, diperpanjang tiap bulan. Tanpa kontrak — berhenti kapan saja.' },
];

// Comparison matrix. Strategy guardrails: only rows where FixMaster wins or
// ties are shown (competitor-only advantages like CRM are omitted). Cells are
// honest — unverified competitor capabilities render 'na' ("?") rather than a
// guessed yes/no. FixNova/FixMate data is dated and may change (see specNote).
type Cmp = 'yes' | 'no' | 'na';
interface CompareRow {
  label: string;
  fm: Cmp;
  nova: Cmp;
  mate: Cmp;
  /** FixMaster signature capability (only FixMaster has it). */
  sig?: boolean;
}
const COMPARE: CompareRow[] = [
  { label: 'Tiket servis + lacak status', fm: 'yes', nova: 'yes', mate: 'yes' },
  { label: 'Kasir (POS) & inventori', fm: 'yes', nova: 'yes', mate: 'yes' },
  { label: 'Semua jenis elektronik (bukan HP saja)', fm: 'yes', nova: 'yes', mate: 'no' },
  { label: 'Tautan lacak publik pelanggan', fm: 'yes', nova: 'yes', mate: 'no' },
  { label: 'Keuangan multi-dompet', fm: 'yes', nova: 'yes', mate: 'no' },
  { label: 'Absensi & multi-peran', fm: 'yes', nova: 'yes', mate: 'no' },
  { label: 'Multi-outlet / cabang', fm: 'yes', nova: 'yes', mate: 'no' },
  { label: 'Supplier & pesanan pembelian (PO)', fm: 'yes', nova: 'no', mate: 'no', sig: true },
  { label: 'Tugas internal (SOP tim)', fm: 'yes', nova: 'no', mate: 'no', sig: true },
  { label: 'Jejak audit tiap tindakan', fm: 'yes', nova: 'no', mate: 'no', sig: true },
  { label: 'Backup & pulihkan data sendiri', fm: 'yes', nova: 'na', mate: 'na' },
  { label: 'Jalan tanpa internet (lokal-first)', fm: 'yes', nova: 'na', mate: 'na' },
];

/** Render a comparison cell: check (yes), dim dash (no), or amber "?" (unverified). */
function compareCell(state: Cmp) {
  if (state === 'yes') return <span className={styles.cmpYes}><Icon name="check" aria-hidden /></span>;
  if (state === 'na') return <span className={styles.cmpNa} title="Belum terkonfirmasi">?</span>;
  return <span className={styles.cmpNo} aria-hidden>—</span>;
}

/** Approx daily price ("± Rp x/hari") from a monthly plan, rounded to Rp 100. */
function perDayLabel(plan: { priceLabel: string }): string {
  const monthly = Number(plan.priceLabel.replace(/\D/g, ''));
  if (!monthly) return '';
  const perDay = Math.round(monthly / 30 / 100) * 100;
  return `± ${fmtRp(perDay)}/hari`;
}

/**
 * Public marketing landing — the front door in cloud signed-out state.
 *
 * Signature treatment ("Precision Electronics Bench"): the page is built as a
 * piece of diagnostic bench equipment, NOT a generic SaaS page. Hero is an
 * instrument faceplate (engraved model plate, power LED, corner screws, live
 * readout); a fault panel diagnoses "shop without a system" pains; a viewport
 * previews real workflows; features are a slot-numbered module rack; pricing
 * are stamped spec plates; a manual plate answers FAQs; the footer is a
 * compliance/serial plate. Same instrument family as the auth screen.
 * Token-only → dark/light auto.
 */
export function LandingPage({ onStart }: LandingPageProps) {
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const prev = document.title;
    document.title = 'FixMaster — Aplikasi Manajemen Usaha Servis Reparasi';
    return () => {
      document.title = prev;
    };
  }, []);

  // Ticking uptime counter — makes the readout feel alive (like real gear).
  useEffect(() => {
    const id = setInterval(() => setUptime((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const hhmmss = new Date(uptime * 1000).toISOString().slice(11, 19);
  const solo = PLANS.standard;
  const pro = PLANS.enterprise;

  return (
    <div className={styles.bench}>
      {/* ===== Top rail: model plate ===== */}
      <header className={styles.topRail}>
        <div className={styles.modelPlate}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <span className={styles.modelText}>
            <span className={styles.brandWord}>FixMaster</span>
            <span className={styles.modelNo}>FX · BENCH OS</span>
          </span>
        </div>
        <nav className={styles.topNav}>
          <a href="#fault" className={styles.topNavLink}>Masalah</a>
          <a href="#rack" className={styles.topNavLink}>Modul</a>
          <a href="#banding" className={styles.topNavLink}>Banding</a>
          <a href="#spec" className={styles.topNavLink}>Paket</a>
          <button className={styles.powerBtn} onClick={onStart}>
            <span className={[styles.led, styles.ledLive].join(' ')} /> MASUK
          </button>
        </nav>
      </header>

      {/* ===== Hero faceplate ===== */}
      <section className={styles.faceplate}>
        <span className={styles.grid} aria-hidden />
        <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
        <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
        <span className={[styles.screw, styles.screwBL].join(' ')} aria-hidden />
        <span className={[styles.screw, styles.screwBR].join(' ')} aria-hidden />

        <div className={styles.faceInner}>
          <div className={styles.faceLeft}>
            <span className={styles.unitTag}>
              <span className={[styles.led, styles.ledOk].join(' ')} /> UNIT AKTIF · v1.0
            </span>
            <h1 className={styles.headline}>
              Satu meja kerja untuk <span className={styles.engrave}>seluruh usaha reparasimu</span>.
            </h1>
            <p className={styles.subhead}>
              Tiket servis, kasir, stok sparepart, pelanggan, keuangan, dan tim — terpasang rapi
              dalam satu instrumen. Untuk semua gadget &amp; elektronik, bukan cuma satu jenis.
              Berhenti mencatat di buku dan WhatsApp.
            </p>
            <ul className={styles.coverage} aria-label="Cakupan perangkat">
              {['HP', 'Laptop', 'Tablet', 'Printer', 'Konsol', 'Elektronik'].map((d) => (
                <li key={d} className={styles.coverChip}>{d}</li>
              ))}
            </ul>
            <div className={styles.faceActions}>
              <button className={styles.btnPower} onClick={onStart}>
                <Icon name="lightning" aria-hidden /> Nyalakan Uji Coba 14 Hari
              </button>
              <a href="#rack" className={styles.btnPlate}>Lihat Modul</a>
            </div>
            <p className={styles.fineprint}>GRATIS 14 HARI · TANPA KARTU KREDIT · BERHENTI KAPAN SAJA</p>
          </div>

          {/* Live diagnostic readout panel */}
          <div className={styles.readout} aria-hidden>
            <div className={styles.readoutHead}>
              <span className={styles.readoutTitle}>DIAGNOSTIK</span>
              <span className={styles.readoutDot} />
            </div>
            <ul className={styles.readoutList}>
              {READOUT.map((r) => (
                <li key={r.k} className={styles.readoutRow}>
                  <span className={[styles.led, styles[r.led]].join(' ')} />
                  <span className={styles.readoutKey}>{r.k}</span>
                  <span className={styles.readoutDots} />
                  <span className={styles.readoutVal}>{r.v}</span>
                </li>
              ))}
            </ul>
            <div className={styles.uptime}>
              <span className={styles.uptimeKey}>UPTIME SESI</span>
              <span className={styles.uptimeVal}>{hhmmss}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Fault panel (pain points) ===== */}
      <section id="fault" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>DIAGNOSTIK AWAL · 6 GEJALA</span>
          <h2 className={styles.sectionTitle}>Gejala toko yang belum punya sistem</h2>
        </div>
        <div className={styles.faultGrid}>
          {FAULTS.map((f) => (
            <article key={f.fault} className={styles.faultCard}>
              <span className={styles.faultSpine} aria-hidden />
              <div className={styles.faultTop}>
                <span className={styles.faultIcon}>
                  <Icon name={f.icon} aria-hidden />
                </span>
                <span className={styles.faultBadge}>
                  <span className={[styles.led, styles.ledCrit].join(' ')} /> FAULT
                </span>
              </div>
              <p className={styles.faultText}>{f.fault}</p>
              <p className={styles.faultFix}>
                <span className={[styles.led, styles.ledOk].join(' ')} /> {f.fix}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ===== Live demo ===== */}
      <section id="demo" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>DEMO LANGSUNG · UNIT HIDUP</span>
          <h2 className={styles.sectionTitle}>Coba sendiri, tanpa daftar</h2>
        </div>
        <div className={styles.viewport}>
          <div className={styles.viewportBar}>
            <span className={[styles.viewportDot, styles.dotCrit].join(' ')} aria-hidden />
            <span className={[styles.viewportDot, styles.dotWarn].join(' ')} aria-hidden />
            <span className={[styles.viewportDot, styles.dotOk].join(' ')} aria-hidden />
            <span className={styles.viewportAddr}>fixmaster · /demo</span>
          </div>

          {/* Poster membuka rute demo layar penuh (/demo) — tanpa iframe embed.
              Plain <a> (bukan <Link>): /demo di-intercept di level App di luar
              router, jadi butuh navigasi browser asli. */}
          <div className={styles.demoStageWrap}>
            <a href="/demo" className={styles.demoPoster}>
              <span className={styles.grid} aria-hidden />
              <span className={styles.demoPlay}>
                <Icon name="right-to-bracket" aria-hidden />
              </span>
              <span className={styles.demoPosterTitle}>Coba Langsung</span>
              <span className={styles.demoPosterSub}>
                Jalankan FixMaster asli — data contoh, aman dicoba.
              </span>
            </a>
          </div>
        </div>

        {/* Mobile / shareable: open the full-screen demo route. */}
        <div className={styles.demoFullRow}>
          {/* Plain <a>, not <Link>: /demo is intercepted at the App level
              (outside the router), so it needs a real browser navigation to
              re-run that check — an SPA Link would render nothing until refresh. */}
          <a href="/demo" className={styles.demoFullBtn}>
            <span className={[styles.led, styles.ledLive].join(' ')} aria-hidden />
            Buka Demo Layar Penuh
          </a>
          <span className={styles.specNote}>Berperan sebagai pemilik · semua menu terbuka</span>
        </div>
      </section>


      {/* ===== Module rack ===== */}
      <section id="rack" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>RAK MODUL · {MODULES.length} UNIT</span>
          <h2 className={styles.sectionTitle}>Terpasang lengkap, bekerja sebagai satu</h2>
        </div>
        <div className={styles.rack}>
          {MODULES.map((m) => (
            <article key={m.slot} className={styles.rackUnit}>
              <span className={styles.rackSlot}>{m.slot}</span>
              <span className={styles.rackIcon}>
                <Icon name={m.icon} aria-hidden />
              </span>
              <div className={styles.rackBody}>
                <h3 className={styles.rackTitle}>{m.title}</h3>
                <p className={styles.rackDesc}>{m.desc}</p>
              </div>
              {m.pro ? (
                <span className={styles.rackPro}>
                  <span className={[styles.led, styles.ledLive].join(' ')} /> PRO
                </span>
              ) : (
                <span className={styles.rackStamp}>
                  <span className={[styles.led, styles.ledOk].join(' ')} /> OK
                </span>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ===== Comparison matrix ===== */}
      <section id="banding" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>MATRIKS BANDING · 3 UNIT</span>
          <h2 className={styles.sectionTitle}>Bandingkan sebelum memilih</h2>
        </div>
        <div className={styles.matrixWrap}>
          <div className={styles.matrix}>
            <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
            <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
            <div className={styles.matrixHead}>
              <span className={styles.matrixCorner}>SPESIFIKASI</span>
              <span className={[styles.matrixCol, styles.matrixColFm].join(' ')}>
                <span className={styles.matrixUnit}>FixMaster</span>
                <span className={styles.matrixTag}>
                  <span className={[styles.led, styles.ledLive].join(' ')} /> UNIT INI
                </span>
              </span>
              <span className={styles.matrixCol}>FixNova</span>
              <span className={styles.matrixCol}>FixMate</span>
            </div>
            {COMPARE.map((r) => (
              <div key={r.label} className={styles.matrixRow}>
                <span className={styles.matrixLabel}>
                  {r.label}
                  {r.sig && <span className={styles.sigTag}>KHAS</span>}
                </span>
                <span className={[styles.matrixCell, styles.matrixCellFm].join(' ')}>{compareCell(r.fm)}</span>
                <span className={styles.matrixCell}>{compareCell(r.nova)}</span>
                <span className={styles.matrixCell}>{compareCell(r.mate)}</span>
              </div>
            ))}
          </div>
        </div>
        <p className={styles.specNote}>
          Perbandingan per Jun 2026 · fitur kompetitor dapat berubah · &quot;?&quot; = belum terkonfirmasi
        </p>
      </section>

      {/* ===== Spec plates (pricing) ===== */}
      <section id="spec" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>LEMBAR SPESIFIKASI</span>
          <h2 className={styles.sectionTitle}>Coba gratis, pasang paket saat siap</h2>
        </div>
        <div className={styles.specGrid}>
          {/* Solo */}
          <article className={styles.specPlate}>
            <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
            <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
            <header className={styles.specTop}>
              <span className={styles.specName}>{solo.name}</span>
              <span className={styles.specClass}>UNIT TUNGGAL</span>
            </header>
            <p className={styles.specPrice}>{solo.priceLabel}</p>
            <p className={styles.specPerDay}>{perDayLabel(solo)} · setara sebungkus kopi</p>
            <ul className={styles.specList}>
              <li><Icon name="check" aria-hidden /> Tiket servis &amp; kasir (POS)</li>
              <li><Icon name="check" aria-hidden /> Inventori &amp; keuangan ({solo.maxWallets} dompet)</li>
              <li><Icon name="check" aria-hidden /> Laporan toko</li>
              <li><Icon name="check" aria-hidden /> 1 pengguna · 1 outlet</li>
            </ul>
            <p className={styles.specHint}>Tim &amp; cabang? Naik ke {pro.name} kapan saja.</p>
            <button className={styles.btnPlateFull} onClick={onStart}>Pasang {solo.name}</button>
          </article>

          {/* Pro */}
          <article className={[styles.specPlate, styles.specPrimary].join(' ')}>
            <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
            <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
            <span className={styles.specRating}>UNIT REKOMENDASI</span>
            <header className={styles.specTop}>
              <span className={styles.specName}>{pro.name}</span>
              <span className={styles.specClass}>MULTI-OUTLET</span>
            </header>
            <p className={styles.specPrice}>{pro.priceLabel}</p>
            <p className={styles.specPerDay}>{perDayLabel(pro)} · {PRO_INCLUDED_OUTLETS} outlet termasuk</p>
            <ul className={styles.specList}>
              <li><Icon name="check" aria-hidden /> Semua fitur paket {solo.name}</li>
              <li><Icon name="check" aria-hidden /> Pengguna tak terbatas</li>
              <li><Icon name="check" aria-hidden /> Supplier+PO, Tugas, Absensi</li>
              <li><Icon name="check" aria-hidden /> Template WhatsApp, logo, Export</li>
              <li><Icon name="check" aria-hidden /> Outlet tak terbatas (+{fmtRp(OUTLET_ADDON_PRICE)}/outlet)</li>
            </ul>
            <button className={styles.btnPowerFull} onClick={onStart}>Pasang {pro.name}</button>
          </article>
        </div>
        <p className={styles.specNote}>
          Harga dapat berubah · Spesifikasi final tampil di unit sebelum berlangganan
        </p>
      </section>

      {/* ===== Manual plate (FAQ) ===== */}
      <section id="manual" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>LEMBAR MANUAL · Q&amp;A</span>
          <h2 className={styles.sectionTitle}>Pertanyaan yang sering muncul</h2>
        </div>
        <div className={styles.faqList}>
          {FAQS.map((item) => (
            <details key={item.q} className={styles.faqItem}>
              <summary className={styles.faqQ}>
                <Icon name="circle-question" aria-hidden />
                <span>{item.q}</span>
                <Icon name="chevron-down" aria-hidden className={styles.faqChevron} />
              </summary>
              <p className={styles.faqA}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== Final CTA bar ===== */}
      <section className={styles.ctaBar}>
        <span className={styles.grid} aria-hidden />
        <div className={styles.ctaInner}>
          <span className={[styles.led, styles.ledLive].join(' ')} />
          <div>
            <h2 className={styles.ctaTitle}>Siap merapikan tokomu?</h2>
            <p className={styles.ctaSub}>Pasang dalam beberapa menit. Tanpa kartu kredit.</p>
          </div>
          <button className={styles.btnPower} onClick={onStart}>
            <Icon name="lightning" aria-hidden /> Mulai Sekarang
          </button>
        </div>
      </section>

      {/* ===== Compliance / serial plate (footer) ===== */}
      <footer className={styles.serialPlate}>
        <div className={styles.serialMain}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <div className={styles.serialText}>
            <span className={styles.brandWord}>FixMaster</span>
            <span className={styles.serialDesc}>Manajemen usaha reparasi gadget &amp; elektronik</span>
          </div>
        </div>
        <dl className={styles.serialMeta}>
          <div className={styles.serialRow}>
            <dt>DOK</dt>
            <dd>
              <Link to="/privacy" className={styles.serialLink}>Kebijakan Privasi</Link>
              <span className={styles.serialSep}>·</span>
              <Link to="/terms" className={styles.serialLink}>Syarat &amp; Ketentuan</Link>
            </dd>
          </div>
          <div className={styles.serialRow}>
            <dt>SN</dt>
            <dd>FX-{new Date().getFullYear()} · © {new Date().getFullYear()} FixMaster</dd>
          </div>
        </dl>
      </footer>
    </div>
  );
}
