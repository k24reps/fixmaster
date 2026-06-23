import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui';
import { PLANS, OUTLET_ADDON_PRICE, PRO_INCLUDED_OUTLETS } from '@/config/plans';
import { fmtRp } from '@/lib/format';
import { useThemeStore } from '@/stores/theme';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  /** CTA handler — reveals the auth screen (signup/login). */
  onStart: () => void;
}

// Operational comparison: running the shop the OLD way (manual pains) vs WITH
// FixMaster (the fix) vs the GROWTH it unlocks ("naik kelas"). The 5 lines map
// ALL 14 modules + assurance facts into honest, code-backed claims. Rendered as
// dual-readout bench panels (MODE MANUAL ↔ MODE FIXMASTER) + a brand-LED upgrade
// row. Replaces the old fault panel + module rack + screenshot gallery.
interface CompareGroup {
  no: string;
  icon: IconName;
  title: string;
  /** Pains of doing this area by hand (MODE MANUAL). */
  manual: string[];
  /** What FixMaster does instead (MODE FIXMASTER). */
  fixmaster: string[];
  /** The growth this unlocks beyond just "being tidy" (NAIK KELAS). */
  upgrade: string;
}
const COMPARISON: CompareGroup[] = [
  {
    no: 'B01',
    icon: 'screwdriver-wrench',
    title: 'Servis & Garansi',
    manual: [
      'Catatan servis tercecer di buku & chat WhatsApp.',
      'Garansi cuma janji lisan, gampang jadi sengketa.',
      'Pelanggan bolak-balik telepon "sudah jadi belum?".',
    ],
    fixmaster: [
      'Tiket digital — status & riwayat tiap unit di satu tempat.',
      'Garansi otomatis tercetak di nota, lengkap alur klaim.',
      'Tautan lacak publik — pelanggan cek status sendiri.',
    ],
    upgrade:
      'Tahu margin tiap servis & rata-rata waktu pengerjaan — fokuskan tenaga ke perbaikan paling menguntungkan.',
  },
  {
    no: 'B02',
    icon: 'users',
    title: 'Pelanggan & Loyalitas',
    manual: [
      'Pelanggan datang sekali lalu hilang tak berjejak.',
      'Data kontak & perangkat berserak di banyak tempat.',
    ],
    fixmaster: [
      'Database pelanggan + riwayat & total belanja.',
      'Saring per jenis perangkat, sapa langsung lewat WhatsApp.',
      'Pindah dari Excel mulus lewat impor data.',
    ],
    upgrade:
      'Ingatkan pelanggan rawat berkala & tawarkan promo terarah — ubah sekali servis jadi langganan.',
  },
  {
    no: 'B03',
    icon: 'cash-register',
    title: 'Penjualan & Stok',
    manual: [
      'Jual sparepart dicatat manual, struk & stok tak cocok.',
      'Stok hilang tanpa jejak, tahu-tahu habis saat dibutuhkan.',
      'Restok telat karena tak ada yang memantau.',
    ],
    fixmaster: [
      'Kasir (POS) + struk, stok berkurang otomatis.',
      'Inventori dengan harga modal & peringatan stok menipis.',
      'Supplier & pesanan pembelian — terima barang sebagian pun tercatat.',
    ],
    upgrade:
      'Lihat sparepart paling laris — belanja stok yang tepat, modal tak mengendap di rak.',
  },
  {
    no: 'B04',
    icon: 'chart-line',
    title: 'Keuangan & Laporan',
    manual: [
      'Laba cuma dikira-kira, bercampur uang pribadi.',
      'Utang-piutang tak terlacak, ada yang lupa ditagih.',
      'Tutup buku akhir bulan selalu bikin pusing.',
    ],
    fixmaster: [
      'Kas multi-dompet + laba per servis yang jelas.',
      'Laporan omzet & performa toko terbentuk otomatis.',
    ],
    upgrade:
      'Banding bulan ini vs lalu, antar-cabang, dan umur piutang — ambil keputusan seperti pengusaha, bukan tukang.',
  },
  {
    no: 'B05',
    icon: 'shield-halved',
    title: 'Tim, Kontrol & Data',
    manual: [
      'Tak ada jejak siapa mengubah apa dan kapan.',
      'Karyawan baru susah diawasi, SOP gampang terlewat.',
      'Data rawan hilang; internet mati berarti berhenti.',
    ],
    fixmaster: [
      'Multi-peran + jejak audit tiap tindakan.',
      'Tugas internal berulang & absensi otomatis.',
      'Backup/pulihkan utuh, jalan tanpa internet, mode gelap.',
    ],
    upgrade:
      'Delegasi tanpa cemas dan SOP tetap jalan walau kamu tak di tempat — siap buka cabang berikutnya.',
  },
];

// Live diagnostic readout rows (mirrors the auth page rail + sidebar).
const READOUT: { k: string; v: string; led: 'ledOk' | 'ledLive' }[] = [
  { k: 'CAKUPAN', v: 'SEMUA ELEKTRONIK', led: 'ledOk' },
  { k: 'MODUL', v: '14 / 14 ONLINE', led: 'ledOk' },
  { k: 'SYNC', v: 'REALTIME', led: 'ledLive' },
  { k: 'DATA', v: 'TERISOLASI', led: 'ledOk' },
];


// Honest assurance strip — verifiable product facts, NOT fabricated
// testimonials/customer counts. Keeps the page truthful (see matrix "?" idiom).
interface AssureDef {
  icon: IconName;
  title: string;
  sub: string;
}
const ASSURE: AssureDef[] = [
  { icon: 'shield-halved', title: 'Data terisolasi', sub: 'Tiap toko terpisah penuh di level baris database.' },
  { icon: 'lightning', title: 'Jalan tanpa internet', sub: 'Lokal-first — tetap bekerja, sinkron saat online.' },
  { icon: 'download', title: 'Cadangkan kapan saja', sub: 'Ekspor seluruh data jadi satu berkas, pulihkan utuh.' },
  { icon: 'circle-check', title: 'Tanpa kontrak', sub: 'Uji coba 14 hari tanpa kartu · berhenti kapan saja.' },
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
 * readout); a three-mode comparison (MANUAL → FIXMASTER → NAIK KELAS) turns
 * "shop without a system" pains into upgrades; a viewport previews the live
 * demo; pricing are stamped spec plates; a manual plate answers FAQs; the
 * footer is a compliance/serial plate. Same instrument family as the auth screen.
 * Token-only → dark/light auto.
 */
export function LandingPage({ onStart }: LandingPageProps) {
  const [uptime, setUptime] = useState(0);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

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
          <a href="#banding" className={[styles.topNavLink, styles.navLink].join(' ')}>Perbandingan</a>
          <a href="#demo" className={[styles.topNavLink, styles.navLink].join(' ')}>Demo</a>
          <a href="#spec" className={[styles.topNavLink, styles.navLink].join(' ')}>Paket</a>
          <button
            className={styles.themeBtn}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
          </button>
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
                <Icon name="lightning" aria-hidden /> Mulai Gratis 14 Hari
              </button>
              <a href="#banding" className={styles.btnPlate}>Lihat Perbandingan</a>
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

      {/* ===== Assurance strip (honest facts, not testimonials) ===== */}
      <section className={styles.assureStrip} aria-label="Jaminan">
        {ASSURE.map((a) => (
          <div key={a.title} className={styles.assureItem}>
            <span className={styles.assureIcon}>
              <Icon name={a.icon} aria-hidden />
            </span>
            <div className={styles.assureBody}>
              <span className={styles.assureTitle}>{a.title}</span>
              <span className={styles.assureSub}>{a.sub}</span>
            </div>
          </div>
        ))}
      </section>

      {/* ===== Comparison: manual vs FixMaster vs naik kelas ===== */}
      <section id="banding" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>CARA LAMA vs FIXMASTER · {COMPARISON.length} LINI</span>
          <h2 className={styles.sectionTitle}>Dari kerja manual yang melelahkan jadi usaha yang naik kelas</h2>
        </div>
        <div className={styles.compare}>
          {COMPARISON.map((g) => (
            <article key={g.no} className={styles.compareGroup}>
              <header className={styles.compareHead}>
                <span className={styles.compareIcon}>
                  <Icon name={g.icon} aria-hidden />
                </span>
                <h3 className={styles.compareTitle}>{g.title}</h3>
                <span className={styles.compareNo}>{g.no}</span>
              </header>
              <div className={styles.compareCols}>
                {/* MODE MANUAL — the pain */}
                <div className={[styles.compareCol, styles.colManual].join(' ')}>
                  <span className={styles.modeTag}>
                    <span className={[styles.led, styles.ledCrit].join(' ')} aria-hidden /> MODE MANUAL
                  </span>
                  <ul className={styles.compareList}>
                    {g.manual.map((m) => (
                      <li key={m} className={styles.manualItem}>
                        <Icon name="times" aria-hidden />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* MODE FIXMASTER — the fix */}
                <div className={[styles.compareCol, styles.colFix].join(' ')}>
                  <span className={styles.modeTag}>
                    <span className={[styles.led, styles.ledOk].join(' ')} aria-hidden /> MODE FIXMASTER
                  </span>
                  <ul className={styles.compareList}>
                    {g.fixmaster.map((f) => (
                      <li key={f} className={styles.fixItem}>
                        <Icon name="check" aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {/* NAIK KELAS — the growth it unlocks */}
              <div className={styles.upgrade}>
                <span className={styles.upgradeTag}>
                  <span className={[styles.led, styles.ledLive].join(' ')} aria-hidden /> NAIK KELAS
                </span>
                <p className={styles.upgradeText}>{g.upgrade}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ===== Live demo ===== */}
      <section id="demo" className={[styles.section, styles.sectionAlt].join(' ')}>
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
              <img
                src="/screenshots/demo-dashboard-dark.png"
                alt="Pratinjau dashboard FixMaster"
                className={styles.posterShotDark}
                loading="lazy"
              />
              <img
                src="/screenshots/demo-dashboard-light.png"
                alt=""
                aria-hidden
                className={styles.posterShotLight}
                loading="lazy"
              />
              <span className={styles.posterScrim} aria-hidden />
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
      <section id="manual" className={[styles.section, styles.sectionAlt].join(' ')}>
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
            <Icon name="lightning" aria-hidden /> Mulai Gratis 14 Hari
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
