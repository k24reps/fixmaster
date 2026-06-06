import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { useFormat } from '@/lib/useFormat';
import { useT } from '@/i18n';
import {
  STATUS_LABELS,
  outstandingBalance,
  serviceProfit,
  sparepartCost,
  isTerminal,
  canClaimWarranty,
} from '@/lib/business/services';
import { localDateStr } from '@/lib/time';
import { trackingUrl } from '@/lib/business/notify';
import { Button, Icon } from '@/components/ui';
import { ServiceModal } from './ServiceModal';
import { StatusModal } from './StatusModal';
import { NotifyModal } from './NotifyModal';
import { WarrantyClaimModal } from './WarrantyClaimModal';
import type { ServiceStatus } from '@/data/types';
import styles from './ServiceDetailPage.module.css';

/** Linear "job traveler" stages (cancel handled separately). */
const TRAVELER: ServiceStatus[] = [
  'diterima',
  'diagnosa',
  'konfirmasi',
  'tunggu',
  'pengerjaan',
  'selesai',
  'lunas',
];

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { fmtMoney, fmtDate, fmtDateTime } = useFormat();

  const { data: services } = useCollection('services');
  const { data: customers } = useCollection('customers');
  const sessionEmployees = useSessionStore((s) => s.employees);
  const me = useSessionStore((s) => s.currentEmployee);

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  const service = useMemo(() => services.find((s) => s.id === id) ?? null, [services, id]);

  if (!service) {
    return (
      <div className={styles.notFound}>
        <span className={styles.nfCode}>404</span>
        <p>Servis tidak ditemukan.</p>
        <Button variant="secondary" onClick={() => navigate('/services')}>
          <Icon name="arrow-left" aria-hidden /> Kembali ke daftar
        </Button>
      </div>
    );
  }

  const cancelled = service.status === 'batal';
  const currentIndex = TRAVELER.indexOf(service.status);
  const outstanding = outstandingBalance(service);
  const profit = serviceProfit(service);
  const partsCost = sparepartCost(service.spareparts);
  const claimable = canClaimWarranty(service, localDateStr());
  const originTicket = service.warrantyClaimOf
    ? services.find((s) => s.id === service.warrantyClaimOf) ?? null
    : null;

  /** Latest history timestamp for a given stage. */
  const stageAt = (stage: ServiceStatus): string | null => {
    const entry = [...service.history].reverse().find((h) => h.status === stage);
    return entry ? fmtDateTime(entry.at) : null;
  };

  const log = [...service.history].reverse();
  // Include the org param so the public /track page can scope the lookup
  // (mirrors the WhatsApp link). Without it, tracking returns "not found".
  const trackingLink = trackingUrl(window.location.origin, service.orgId, service.serviceNo);

  // Toggle physical collection of the device — independent of payment.
  const togglePickup = async () => {
    const now = new Date().toISOString();
    const nowPicked = !service.pickedUp;
    await repository.put('services', {
      ...service,
      pickedUp: nowPicked,
      pickedUpAt: nowPicked ? now : null,
      updatedAt: now,
      history: [
        ...service.history,
        {
          at: now,
          status: 'edit',
          by: me?.id ?? '',
          byName: me?.name ?? '',
          note: nowPicked ? 'Barang diambil pelanggan' : 'Tanda ambil dibatalkan',
          internal: false,
        },
      ],
    });
    toast.success(nowPicked ? 'Ditandai sudah diambil' : 'Tanda ambil dibatalkan');
  };

  return (
    <div className={styles.page}>
      {/* Back link */}
      <Link to="/services" className={styles.back}>
        <Icon name="arrow-left" aria-hidden /> {t('nav.services')}
      </Link>

      {service.warrantyClaimOf && (
        <div className={styles.claimBanner}>
          <Icon name="shield-halved" aria-hidden />
          <span>
            Tiket ini adalah <strong>klaim garansi</strong>
            {originTicket ? (
              <>
                {' '}dari{' '}
                <Link to={`/services/${originTicket.id}`}>{originTicket.serviceNo}</Link>
              </>
            ) : (
              ' (tiket asli tidak ditemukan)'
            )}
            .
          </span>
        </div>
      )}

      <div className={styles.sheet}>
        {/* ---------- Ticket Head ---------- */}
        <header className={styles.head}>
          <div className={styles.headMain}>
            <div className={styles.codeRow}>
              <span className={styles.code}>{service.serviceNo}</span>
              <span className={styles.codeMeta}>REPAIR TICKET</span>
            </div>
            <h1 className={styles.device}>{service.device}</h1>
            <p className={styles.deviceMeta}>
              <span className={styles.cat}>{service.category}</span>
              <span className={styles.dot} />
              {fmtDate(service.createdAt)}
              {service.technicianName && (
                <>
                  <span className={styles.dot} />
                  Teknisi <strong>{service.technicianName}</strong>
                </>
              )}
              {service.warrantyServiceUntil && (
                <>
                  <span className={styles.dot} />
                  Garansi jasa s/d {fmtDate(service.warrantyServiceUntil)}
                </>
              )}
              {service.warrantyPartsUntil && (
                <>
                  <span className={styles.dot} />
                  Garansi part s/d {fmtDate(service.warrantyPartsUntil)}
                </>
              )}
              <span className={styles.dot} />
              {service.pickedUp ? (
                <span className={styles.pickedUp}>
                  <Icon name="circle-check" aria-hidden /> Sudah diambil
                  {service.pickedUpAt ? ` · ${fmtDate(service.pickedUpAt)}` : ''}
                </span>
              ) : (
                <span className={styles.notPicked}>
                  <Icon name="box" aria-hidden /> Belum diambil
                </span>
              )}
            </p>
          </div>
          <div className={[styles.stamp, cancelled ? styles.stampCancel : ''].join(' ')}>
            <span className={styles.stampInner}>{STATUS_LABELS[service.status]}</span>
          </div>
        </header>

        {/* ---------- Traveler Strip ---------- */}
        {!cancelled && (
          <section className={styles.traveler}>
            {TRAVELER.map((stage, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              const at = stageAt(stage);
              return (
                <div
                  key={stage}
                  className={[
                    styles.stage,
                    done ? styles.stageDone : '',
                    current ? styles.stageCurrent : '',
                  ].join(' ')}
                >
                  <div className={styles.stageNode}>
                    {done ? <Icon name="check" aria-hidden /> : <span>{i + 1}</span>}
                  </div>
                  <div className={styles.stageInfo}>
                    <span className={styles.stageLabel}>{t(`status.${stage}`)}</span>
                    <span className={styles.stageAt}>{at ?? '—'}</span>
                  </div>
                  {i < TRAVELER.length - 1 && <span className={styles.connector} />}
                </div>
              );
            })}
          </section>
        )}

        {/* ---------- Customer stub + Intake ---------- */}
        <section className={styles.cols}>
          <div className={[styles.panel, styles.stub].join(' ')}>
            <div className={styles.panelLabel}>CUSTOMER STUB</div>
            <div className={styles.stubName}>{service.customerName}</div>
            <div className={styles.stubPhone}>{service.customerPhone || '—'}</div>
            <div className={styles.stubActions}>
              <button className={styles.waBtn} onClick={() => setNotifyOpen(true)}>
                <Icon name="whatsapp" aria-hidden /> WhatsApp
              </button>
              <button
                className={styles.ghostBtn}
                onClick={() => void navigator.clipboard?.writeText(trackingLink)}
              >
                <Icon name="link" aria-hidden /> Salin tracking
              </button>
            </div>
            <div className={styles.qrRow}>
              <div className={styles.qr}>
                <Icon name="qrcode" aria-hidden />
              </div>
              <span className={styles.qrText}>Bagikan link untuk lacak status servis</span>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelLabel}>INTAKE / KELUHAN</div>
            <p className={styles.complaint}>{service.complaint || '—'}</p>
            <dl className={styles.specList}>
              <div>
                <dt>Kelengkapan</dt>
                <dd>{service.accessories || '—'}</dd>
              </div>
              <div>
                <dt>Kategori</dt>
                <dd>{service.category}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ---------- Sparepart BOM ---------- */}
        <section className={styles.panel}>
          <div className={styles.panelLabel}>SPAREPART · BILL OF MATERIALS</div>
          {service.spareparts.length === 0 ? (
            <p className={styles.emptyParts}>Belum ada sparepart ditambahkan.</p>
          ) : (
            <div className={styles.bom}>
              {service.spareparts.map((p, i) => (
                <div key={`${p.itemId}-${i}`} className={styles.bomRow}>
                  <span className={styles.bomIcon}>
                    <Icon name="microchip" aria-hidden />
                  </span>
                  <span className={styles.bomName}>{p.name}</span>
                  <span className={styles.bomQty}>×{p.qty}</span>
                  <span className={styles.bomCost}>{fmtMoney(p.sellPrice * p.qty)}</span>
                  <span
                    className={[styles.bomState, p.deducted ? styles.stateOk : styles.stateWait].join(' ')}
                  >
                    {p.deducted ? 'Terpasang' : 'Menunggu'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Cost + Log ---------- */}
        <section className={styles.cols}>
          <div className={styles.panel}>
            <div className={styles.panelLabel}>BIAYA</div>
            <dl className={styles.costList}>
              <div>
                <dt>Estimasi</dt>
                <dd>{fmtMoney(service.estimateCost)}</dd>
              </div>
              <div>
                <dt>Biaya final</dt>
                <dd>{fmtMoney(service.finalCost)}</dd>
              </div>
              {service.downPayment > 0 && (
                <div>
                  <dt>DP diterima</dt>
                  <dd className={styles.dp}>− {fmtMoney(service.downPayment)}</dd>
                </div>
              )}
              <div className={styles.costTotal}>
                <dt>Sisa tagihan</dt>
                <dd>{fmtMoney(outstanding)}</dd>
              </div>
              <div className={styles.costProfit}>
                <dt>Est. profit (− part {fmtMoney(partsCost)})</dt>
                <dd>{fmtMoney(profit)}</dd>
              </div>
            </dl>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelLabel}>LOG TEKNISI</div>
            <ul className={styles.log}>
              {log.map((l, i) => (
                <li key={i} className={[styles.logItem, l.internal ? styles.logInternal : ''].join(' ')}>
                  <span className={styles.logDot} />
                  <div>
                    <div className={styles.logHead}>
                      <strong>{l.status === 'edit' ? 'Edit' : STATUS_LABELS[l.status as ServiceStatus]}</strong>
                      {l.internal && <span className={styles.internalTag}>internal</span>}
                    </div>
                    <span className={styles.logAt}>
                      {fmtDateTime(l.at)} · {l.byName}
                    </span>
                    {l.note && <p className={styles.logNote}>{l.note}</p>}
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
          <span className={styles.actionValue}>{fmtMoney(outstanding)}</span>
        </div>
        <div className={styles.actionBtns}>
          <button className={styles.secondaryBtn} onClick={() => setEditOpen(true)}>
            <Icon name="pen" aria-hidden /> Edit
          </button>
          <button
            className={[styles.secondaryBtn, service.pickedUp ? styles.pickedActive : ''].join(' ')}
            onClick={togglePickup}
          >
            <Icon name={service.pickedUp ? 'circle-check' : 'box'} aria-hidden />{' '}
            {service.pickedUp ? 'Diambil ✓' : 'Tandai Diambil'}
          </button>
          {claimable && (
            <button className={styles.primaryBtn} onClick={() => setClaimOpen(true)}>
              <Icon name="shield-halved" aria-hidden /> Klaim Garansi
            </button>
          )}
          {!isTerminal(service.status) && (
            <button className={styles.primaryBtn} onClick={() => setStatusOpen(true)}>
              Update Status <Icon name="arrow-right" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      <ServiceModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={service}
        services={services}
        customers={customers}
        employees={sessionEmployees}
        onSaved={() => {}}
      />
      <StatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        service={service}
        onSaved={() => {}}
      />
      <NotifyModal open={notifyOpen} onClose={() => setNotifyOpen(false)} service={service} />
      <WarrantyClaimModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        origin={service}
        services={services}
        onSaved={() => {}}
      />
    </div>
  );
}
