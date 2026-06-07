import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/ui';
import { PLANS } from '@/config/plans';
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
}

// The 12 modules, presented as rack-mounted units (slot-numbered).
const MODULES: ModuleDef[] = [
  { slot: 'M01', icon: 'screwdriver-wrench', title: 'Tiket Servis', desc: 'Lacak tiap perbaikan dari masuk sampai diambil, lengkap status & riwayat.' },
  { slot: 'M02', icon: 'cash-register', title: 'Kasir (POS)', desc: 'Jual sparepart & jasa, cetak struk, catat pembayaran dalam detik.' },
  { slot: 'M03', icon: 'users', title: 'Pelanggan', desc: 'Database pelanggan & perangkat, plus pelacakan servis publik.' },
  { slot: 'M04', icon: 'boxes-stacked', title: 'Inventori', desc: 'Pantau stok sparepart, harga modal, peringatan stok menipis.' },
  { slot: 'M05', icon: 'truck-field', title: 'Supplier', desc: 'Kelola pembelian & pemasok agar restok tak pernah telat.' },
  { slot: 'M06', icon: 'wallet', title: 'Keuangan', desc: 'Kas masuk-keluar, laba per servis, ringkasan harian yang jelas.' },
  { slot: 'M07', icon: 'list-check', title: 'Tugas Internal', desc: 'SOP harian jadi checklist — buat banyak sekaligus, tugaskan per peran.' },
  { slot: 'M08', icon: 'calendar-check', title: 'Absensi', desc: 'Jam masuk-pulang karyawan dengan rekap kehadiran otomatis.' },
  { slot: 'M09', icon: 'chart-line', title: 'Laporan', desc: 'Tren omzet, servis, dan performa toko dalam grafik mudah dibaca.' },
  { slot: 'M10', icon: 'qrcode', title: 'Lacak Publik', desc: 'Pelanggan cek status servis sendiri lewat tautan — kurangi telepon.' },
  { slot: 'M11', icon: 'shield-halved', title: 'Multi-Peran', desc: 'Owner, admin, dan karyawan punya akses sesuai perannya.' },
  { slot: 'M12', icon: 'moon', title: 'Mode Gelap', desc: 'Tema terang & gelap, nyaman dari pagi sampai tutup toko.' },
];

// Live diagnostic readout rows (mirrors the auth page rail + sidebar).
const READOUT: { k: string; v: string; led: 'ledOk' | 'ledLive' }[] = [
  { k: 'MODUL', v: '12 / 12 ONLINE', led: 'ledOk' },
  { k: 'QRIS', v: 'TERHUBUNG', led: 'ledLive' },
  { k: 'SYNC', v: 'REALTIME', led: 'ledLive' },
  { k: 'DATA', v: 'TERISOLASI', led: 'ledOk' },
];

/**
 * Public marketing landing — the front door in cloud signed-out state.
 *
 * Signature treatment ("Precision Electronics Bench"): the page is built as a
 * piece of diagnostic bench equipment, NOT a generic SaaS page. Hero is an
 * instrument faceplate (engraved model plate, power LED, corner screws, live
 * readout); features are a slot-numbered module rack; pricing are stamped spec
 * plates; the footer is a compliance/serial plate. Same instrument family as
 * the "Terminal Akses Bench" auth screen. Token-only → dark/light auto.
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
  const bisnis = PLANS.enterprise;

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
          <a href="#rack" className={styles.topNavLink}>Modul</a>
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
              dalam satu instrumen. Berhenti mencatat di buku dan WhatsApp.
            </p>
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

      {/* ===== Module rack ===== */}
      <section id="rack" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>RAK MODUL · 12 UNIT</span>
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
              <span className={styles.rackStamp}>
                <span className={[styles.led, styles.ledOk].join(' ')} /> OK
              </span>
            </article>
          ))}
        </div>
      </section>

      {/* ===== Spec plates (pricing) ===== */}
      <section id="spec" className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNo}>LEMBAR SPESIFIKASI</span>
          <h2 className={styles.sectionTitle}>Mulai gratis, pasang paket saat siap</h2>
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
            <ul className={styles.specList}>
              <li><Icon name="check" aria-hidden /> Tiket servis &amp; kasir</li>
              <li><Icon name="check" aria-hidden /> Inventori &amp; keuangan</li>
              <li><Icon name="check" aria-hidden /> Tugas, absensi, laporan</li>
              <li><Icon name="check" aria-hidden /> Karyawan tak terbatas</li>
            </ul>
            <button className={styles.btnPlateFull} onClick={onStart}>Pasang {solo.name}</button>
          </article>

          {/* Bisnis */}
          <article className={[styles.specPlate, styles.specPrimary].join(' ')}>
            <span className={[styles.screw, styles.screwTL].join(' ')} aria-hidden />
            <span className={[styles.screw, styles.screwTR].join(' ')} aria-hidden />
            <span className={styles.specRating}>UNIT REKOMENDASI</span>
            <header className={styles.specTop}>
              <span className={styles.specName}>{bisnis.name}</span>
              <span className={styles.specClass}>MULTI-OUTLET</span>
            </header>
            <p className={styles.specPrice}>{bisnis.priceLabel}</p>
            <ul className={styles.specList}>
              <li><Icon name="check" aria-hidden /> Semua fitur paket {solo.name}</li>
              <li><Icon name="check" aria-hidden /> Multi-outlet (s/d {bisnis.maxOutlets} cabang)</li>
              <li><Icon name="check" aria-hidden /> Export &amp; import data</li>
              <li><Icon name="check" aria-hidden /> Template WhatsApp &amp; logo</li>
            </ul>
            <button className={styles.btnPowerFull} onClick={onStart}>Pasang {bisnis.name}</button>
          </article>
        </div>
        <p className={styles.specNote}>
          Harga dapat berubah · Spesifikasi final tampil di unit sebelum berlangganan
        </p>
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
