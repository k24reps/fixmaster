/**
 * PROTOTYPE — Repair Ticket / Job Traveler page.
 * Self-contained (mock data, no auth/repository) so it can be viewed at
 * /prototype/ticket and screenshotted. This is a DESIGN PROBE for the
 * "precision electronics bench" identity — not yet wired into the app.
 */
import { useState } from 'react';
import { Icon } from '@/components/ui';
import styles from './RepairTicketPrototype.module.css';

const STAGES = [
  { key: 'diterima', label: 'Diterima', at: '02 Jun · 09:14' },
  { key: 'diagnosa', label: 'Diagnosa', at: '02 Jun · 11:40' },
  { key: 'konfirmasi', label: 'Konfirmasi', at: '02 Jun · 14:05' },
  { key: 'tunggu', label: 'Tunggu Part', at: '03 Jun · 08:20' },
  { key: 'pengerjaan', label: 'Pengerjaan', at: '03 Jun · 10:02' },
  { key: 'selesai', label: 'Selesai', at: null },
  { key: 'lunas', label: 'Lunas', at: null },
];
const CURRENT_STAGE_INDEX = 4; // pengerjaan

const SPAREPARTS = [
  { name: 'Keyboard Assembly A1989', qty: 1, cost: 'Rp 850.000', state: 'Terpasang', deducted: true },
  { name: 'Thermal Paste MX-4', qty: 1, cost: 'Rp 45.000', state: 'Terpasang', deducted: true },
  { name: 'Battery A1964 (58Wh)', qty: 1, cost: 'Rp 720.000', state: 'Menunggu', deducted: false },
];

const LOG = [
  { stage: 'Pengerjaan', at: '03 Jun 2026 · 10:02', by: 'Rizal (Teknisi)', note: 'Mulai penggantian keyboard & repaste.', internal: false },
  { stage: 'Tunggu Part', at: '03 Jun 2026 · 08:20', by: 'Rizal (Teknisi)', note: 'Menunggu kedatangan baterai dari supplier.', internal: false },
  { stage: 'Konfirmasi', at: '02 Jun 2026 · 14:05', by: 'Sari (Admin)', note: 'Pelanggan setuju estimasi Rp 1.950.000.', internal: false },
  { stage: 'Catatan internal', at: '02 Jun 2026 · 12:10', by: 'Rizal (Teknisi)', note: 'Trackpad juga agak longgar, tawarkan saat ambil.', internal: true },
  { stage: 'Diagnosa', at: '02 Jun 2026 · 11:40', by: 'Rizal (Teknisi)', note: 'Keyboard mati total, baterai health 71%.', internal: false },
  { stage: 'Diterima', at: '02 Jun 2026 · 09:14', by: 'Sari (Admin)', note: 'Unit diterima beserta charger.', internal: false },
];

export function RepairTicketPrototype() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  return (
    <div className={styles.root} data-proto-theme={theme}>
      {/* Probe toolbar (not part of the design) */}
      <div className={styles.probeBar}>
        <span className={styles.probeTag}>PROTOTYPE · Repair Ticket</span>
        <button className={styles.probeToggle} onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </div>

      <div className={styles.canvas}>
        <div className={styles.sheet}>
          {/* ---------- Ticket Head ---------- */}
          <header className={styles.head}>
            <div className={styles.headMain}>
              <div className={styles.codeRow}>
                <span className={styles.code}>FM-0231</span>
                <span className={styles.codeMeta}>REPAIR TICKET</span>
              </div>
              <h1 className={styles.device}>MacBook Pro 13&quot; 2019</h1>
              <p className={styles.deviceMeta}>
                <span className={styles.cat}>Laptop</span>
                <span className={styles.dot} />
                Masuk 02 Jun 2026
                <span className={styles.dot} />
                Teknisi <strong>Rizal</strong>
                <span className={styles.dot} />
                Garansi s/d 03 Jul 2026
              </p>
            </div>
            <div className={styles.stamp} data-stage="pengerjaan">
              <span className={styles.stampInner}>PENGERJAAN</span>
            </div>
          </header>

          {/* ---------- Traveler Strip ---------- */}
          <section className={styles.traveler}>
            {STAGES.map((s, i) => {
              const done = i < CURRENT_STAGE_INDEX;
              const current = i === CURRENT_STAGE_INDEX;
              return (
                <div
                  key={s.key}
                  className={[styles.stage, done ? styles.stageDone : '', current ? styles.stageCurrent : ''].join(' ')}
                >
                  <div className={styles.stageNode}>
                    {done ? <Icon name="check" aria-hidden /> : <span className={styles.nodeIndex}>{i + 1}</span>}
                  </div>
                  <div className={styles.stageInfo}>
                    <span className={styles.stageLabel}>{s.label}</span>
                    <span className={styles.stageAt}>{s.at ?? '—'}</span>
                  </div>
                  {i < STAGES.length - 1 && <span className={styles.connector} />}
                </div>
              );
            })}
          </section>

          {/* ---------- Two columns: Customer stub + Intake ---------- */}
          <section className={styles.cols}>
            <div className={[styles.panel, styles.stub].join(' ')}>
              <div className={styles.panelLabel}>CUSTOMER STUB</div>
              <div className={styles.stubName}>Andi Pratama</div>
              <div className={styles.stubPhone}>0812-3456-7890</div>
              <div className={styles.stubActions}>
                <button className={styles.waBtn}><Icon name="whatsapp" aria-hidden /> WhatsApp</button>
                <button className={styles.ghostBtn}><Icon name="link" aria-hidden /> Salin tracking</button>
              </div>
              <div className={styles.qrRow}>
                <div className={styles.qr}><Icon name="qrcode" aria-hidden /></div>
                <span className={styles.qrText}>Scan untuk lacak status servis secara publik</span>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelLabel}>INTAKE / KELUHAN</div>
              <p className={styles.complaint}>
                Keyboard mati total sebagian tombol, baterai cepat habis &amp; sempat tidak mengisi.
              </p>
              <dl className={styles.specList}>
                <div><dt>Kelengkapan</dt><dd>Charger original, tas</dd></div>
                <div><dt>Kondisi masuk</dt><dd>Bodi mulus, layar normal</dd></div>
                <div><dt>Baterai (health)</dt><dd><span className={styles.gauge}><span className={styles.gaugeFill} style={{ width: '71%' }} /></span> 71%</dd></div>
              </dl>
            </div>
          </section>

          {/* ---------- Spareparts (teardown BOM) ---------- */}
          <section className={styles.panel}>
            <div className={styles.panelLabel}>SPAREPART · BILL OF MATERIALS</div>
            <div className={styles.bom}>
              {SPAREPARTS.map((p) => (
                <div key={p.name} className={styles.bomRow}>
                  <span className={styles.bomIcon}><Icon name="microchip" aria-hidden /></span>
                  <span className={styles.bomName}>{p.name}</span>
                  <span className={styles.bomQty}>×{p.qty}</span>
                  <span className={styles.bomCost}>{p.cost}</span>
                  <span className={[styles.bomState, p.deducted ? styles.stateOk : styles.stateWait].join(' ')}>
                    {p.state}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- Cost panel + Log ---------- */}
          <section className={styles.cols}>
            <div className={styles.panel}>
              <div className={styles.panelLabel}>BIAYA</div>
              <dl className={styles.costList}>
                <div><dt>Estimasi</dt><dd>Rp 1.950.000</dd></div>
                <div><dt>Biaya final</dt><dd>Rp 1.950.000</dd></div>
                <div><dt>DP diterima</dt><dd className={styles.dp}>− Rp 500.000</dd></div>
                <div className={styles.costTotal}><dt>Sisa tagihan</dt><dd>Rp 1.450.000</dd></div>
                <div className={styles.costProfit}><dt>Est. profit</dt><dd>Rp 335.000</dd></div>
              </dl>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelLabel}>LOG TEKNISI</div>
              <ul className={styles.log}>
                {LOG.map((l, i) => (
                  <li key={i} className={[styles.logItem, l.internal ? styles.logInternal : ''].join(' ')}>
                    <span className={styles.logDot} />
                    <div>
                      <div className={styles.logHead}>
                        <strong>{l.stage}</strong>
                        {l.internal && <span className={styles.internalTag}>internal</span>}
                      </div>
                      <span className={styles.logAt}>{l.at} · {l.by}</span>
                      <p className={styles.logNote}>{l.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* ---------- Sticky action bar ---------- */}
        <div className={styles.actionBar}>
          <div className={styles.actionInfo}>
            <span className={styles.actionLabel}>Sisa tagihan</span>
            <span className={styles.actionValue}>Rp 1.450.000</span>
          </div>
          <div className={styles.actionBtns}>
            <button className={styles.secondaryBtn}><Icon name="print" aria-hidden /> Cetak Tiket</button>
            <button className={styles.primaryBtn}>Lanjut ke Selesai <Icon name="arrow-right" aria-hidden /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
