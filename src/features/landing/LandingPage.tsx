import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui';
import { PLANS } from '@/config/plans';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  /** CTA handler — reveals the auth screen (signup/login). */
  onStart: () => void;
}

interface FeatureDef {
  icon: IconName;
  title: string;
  desc: string;
}

// The 12 modules, framed as benefits (not just nav labels).
const FEATURES: FeatureDef[] = [
  { icon: 'screwdriver-wrench', title: 'Tiket Servis', desc: 'Lacak setiap perbaikan dari masuk sampai diambil, lengkap dengan status & riwayat.' },
  { icon: 'cash-register', title: 'Kasir (POS)', desc: 'Jual sparepart & jasa, cetak struk, dan catat pembayaran dalam hitungan detik.' },
  { icon: 'users', title: 'Pelanggan', desc: 'Database pelanggan & perangkat, plus pelacakan servis publik tanpa login.' },
  { icon: 'boxes-stacked', title: 'Inventori', desc: 'Pantau stok sparepart, harga modal, dan peringatan stok menipis.' },
  { icon: 'truck-field', title: 'Supplier', desc: 'Kelola pembelian & pemasok agar restok tak pernah telat.' },
  { icon: 'wallet', title: 'Keuangan', desc: 'Kas masuk-keluar, laba per servis, dan ringkasan harian yang jelas.' },
  { icon: 'list-check', title: 'Tugas Internal', desc: 'SOP harian tim jadi checklist — buat banyak sekaligus, tugaskan per peran.' },
  { icon: 'calendar-check', title: 'Absensi', desc: 'Jam masuk-pulang karyawan dengan rekap kehadiran otomatis.' },
  { icon: 'chart-line', title: 'Laporan', desc: 'Tren omzet, servis, dan performa toko dalam grafik yang mudah dibaca.' },
  { icon: 'qrcode', title: 'Lacak Publik', desc: 'Pelanggan cek status servis sendiri lewat tautan — kurangi telepon masuk.' },
  { icon: 'shield-halved', title: 'Multi-Peran', desc: 'Owner, admin, dan karyawan punya akses sesuai perannya.' },
  { icon: 'moon', title: 'Mode Gelap', desc: 'Tema terang & gelap, nyaman dipakai dari pagi sampai tutup toko.' },
];

const HIGHLIGHTS = [
  { icon: 'qrcode' as IconName, label: 'Bayar QRIS' },
  { icon: 'pulse' as IconName, label: 'Realtime' },
  { icon: 'lightning' as IconName, label: 'Cepat & Ringan' },
  { icon: 'shield-halved' as IconName, label: 'Data Terisolasi' },
];

/**
 * Public marketing landing page — the front door in cloud signed-out state.
 * Sells the product (hero, features, pricing) before revealing the auth form.
 * Uses the "Precision Electronics Bench" visual language with design tokens.
 */
export function LandingPage({ onStart }: LandingPageProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = 'FixMaster — Aplikasi Manajemen Usaha Servis Reparasi';
    return () => {
      document.title = prev;
    };
  }, []);

  const solo = PLANS.standard;
  const bisnis = PLANS.enterprise;

  return (
    <div className={styles.page}>
      {/* ---------- Nav ---------- */}
      <header className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <span className={styles.brandWord}>FixMaster</span>
        </div>
        <nav className={styles.navLinks}>
          <a href="#fitur" className={styles.navLink}>Fitur</a>
          <a href="#harga" className={styles.navLink}>Harga</a>
          <button className={styles.navCta} onClick={onStart}>Masuk</button>
        </nav>
      </header>

      {/* ---------- Hero ---------- */}
      <section className={styles.hero}>
        <span className={styles.grid} aria-hidden />
        <div className={styles.heroInner}>
          <span className={styles.badge}>
            <span className={styles.badgeDot} /> Untuk konter HP &amp; jasa servis elektronik
          </span>
          <h1 className={styles.heroTitle}>
            Kelola seluruh usaha reparasimu dari <span className={styles.accent}>satu meja kerja</span>.
          </h1>
          <p className={styles.heroSub}>
            Tiket servis, kasir, stok sparepart, pelanggan, keuangan, dan tim — semuanya rapi
            dalam satu aplikasi yang cepat dan modern. Berhenti mencatat di buku dan WhatsApp.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.btnPrimary} onClick={onStart}>
              <Icon name="lightning" aria-hidden /> Mulai Uji Coba 14 Hari
            </button>
            <a href="#fitur" className={styles.btnGhost}>Lihat Fitur</a>
          </div>
          <p className={styles.heroNote}>Gratis 14 hari · Tanpa kartu kredit · Bisa berhenti kapan saja</p>

          <ul className={styles.highlights}>
            {HIGHLIGHTS.map((h) => (
              <li key={h.label} className={styles.highlight}>
                <Icon name={h.icon} aria-hidden /> {h.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="fitur" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.kicker}>Fitur Lengkap</span>
          <h2 className={styles.sectionTitle}>Semua yang dibutuhkan toko servis</h2>
          <p className={styles.sectionSub}>Dua belas modul yang bekerja bersama, bukan tempelan.</p>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <article key={f.title} className={styles.featureCard}>
              <span className={styles.featureIcon}>
                <Icon name={f.icon} aria-hidden />
              </span>
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="harga" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.kicker}>Harga</span>
          <h2 className={styles.sectionTitle}>Mulai gratis, bayar saat siap</h2>
          <p className={styles.sectionSub}>Coba semua fitur 14 hari. Setelah itu pilih paket yang pas.</p>
        </div>
        <div className={styles.pricingGrid}>
          {/* Solo */}
          <article className={styles.priceCard}>
            <h3 className={styles.priceName}>{solo.name}</h3>
            <p className={styles.priceTag}>{solo.priceLabel}</p>
            <p className={styles.priceFor}>Untuk satu toko / konter.</p>
            <ul className={styles.priceList}>
              <li><Icon name="check" aria-hidden /> Tiket servis & kasir</li>
              <li><Icon name="check" aria-hidden /> Inventori & keuangan</li>
              <li><Icon name="check" aria-hidden /> Tugas, absensi, laporan</li>
              <li><Icon name="check" aria-hidden /> Karyawan tak terbatas</li>
            </ul>
            <button className={styles.btnGhostFull} onClick={onStart}>Pilih {solo.name}</button>
          </article>

          {/* Bisnis (recommended) */}
          <article className={[styles.priceCard, styles.priceFeatured].join(' ')}>
            <span className={styles.priceBadge}>PALING LENGKAP</span>
            <h3 className={styles.priceName}>{bisnis.name}</h3>
            <p className={styles.priceTag}>{bisnis.priceLabel}</p>
            <p className={styles.priceFor}>Untuk usaha dengan beberapa cabang.</p>
            <ul className={styles.priceList}>
              <li><Icon name="check" aria-hidden /> Semua fitur paket {solo.name}</li>
              <li><Icon name="check" aria-hidden /> Multi-outlet (s/d {bisnis.maxOutlets} cabang)</li>
              <li><Icon name="check" aria-hidden /> Export & import data</li>
              <li><Icon name="check" aria-hidden /> Template WhatsApp & logo</li>
            </ul>
            <button className={styles.btnPrimaryFull} onClick={onStart}>Pilih {bisnis.name}</button>
          </article>
        </div>
        <p className={styles.priceFootnote}>Harga dapat berubah. Detail final tampil di aplikasi sebelum berlangganan.</p>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className={styles.ctaBand}>
        <span className={styles.grid} aria-hidden />
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Siap merapikan tokomu?</h2>
          <p className={styles.ctaSub}>Mulai dalam beberapa menit. Tanpa kartu kredit.</p>
          <button className={styles.btnPrimary} onClick={onStart}>
            <Icon name="lightning" aria-hidden /> Mulai Sekarang
          </button>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className={styles.footer}>
        <div className={styles.footBrand}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <span className={styles.brandWord}>FixMaster</span>
        </div>
        <nav className={styles.footLinks}>
          <Link to="/privacy" className={styles.footLink}>Kebijakan Privasi</Link>
          <Link to="/terms" className={styles.footLink}>Syarat &amp; Ketentuan</Link>
          <button className={styles.footLink} onClick={onStart}>Masuk</button>
        </nav>
        <span className={styles.copy}>© {new Date().getFullYear()} FixMaster · Manajemen usaha reparasi gadget &amp; elektronik</span>
      </footer>
    </div>
  );
}
