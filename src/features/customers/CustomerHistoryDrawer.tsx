import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Badge, Icon, EmptyState, LoadState, loadPending } from '@/components/ui';
import type { LoadQuery } from '@/components/ui/loadPending';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/business/services';
import { fmtRp } from '@/lib/format';
import { useFormat } from '@/lib/useFormat';
import type { Customer, Service } from '@/data/types';
import styles from './CustomerHistoryDrawer.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  services: Service[];
  servicesLoad: LoadQuery;
}

/**
 * Slide-in panel listing a customer's full service history (newest first).
 * Data already lives on the Customers page; this just surfaces the tickets
 * behind the per-customer count. Each row links to the ticket detail.
 */
export function CustomerHistoryDrawer({ open, onClose, customer, services, servicesLoad }: Props) {
  const { fmtDate } = useFormat();
  // Servis belum termuat / gagal: "Belum ada servis · Rp 0" di sini bohong.
  const pending = loadPending(servicesLoad);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Tickets for this customer, newest first (createdAt desc, fallback serviceNo).
  const tickets = useMemo(() => {
    if (!customer) return [];
    return services
      .filter((s) => s.customerId === customer.id)
      .sort(
        (a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? '') ||
          b.serviceNo.localeCompare(a.serviceNo),
      );
  }, [customer, services]);

  // Sama dengan kartu pelanggan: nilai tiket yang sudah Lunas saja.
  const total = useMemo(
    () => tickets.reduce((sum, s) => sum + (s.status === 'lunas' ? s.finalCost : 0), 0),
    [tickets],
  );

  if (!open || !customer) return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose} role="presentation">
      <aside
        className={styles.panel}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Riwayat servis ${customer.name}`}
      >
        <header className={styles.header}>
          <div className={styles.headInfo}>
            <span className={styles.headLabel}>RIWAYAT SERVIS</span>
            <h3 className={styles.headName}>{customer.name}</h3>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Tutup">
            <Icon name="times" aria-hidden />
          </button>
        </header>

        <div className={styles.statStrip}>
          <span>
            <strong>{pending ? '—' : tickets.length}</strong> servis
          </span>
          <span>
            Lunas <strong>{pending ? '—' : fmtRp(total)}</strong>
          </span>
        </div>

        <div className={styles.body}>
          {pending ? (
            <LoadState queries={[servicesLoad]} />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<Icon name="screwdriver-wrench" aria-hidden />}
              title="Belum ada servis"
              description="Tiket servis pelanggan ini akan muncul di sini."
            />
          ) : (
            <ul className={styles.trace}>
              {tickets.map((s) => (
                <li key={s.id} className={styles.ticket}>
                  <Link to={`/services/${s.id}`} className={styles.ticketLink} onClick={onClose}>
                    <span
                      className={styles.led}
                      data-tone={STATUS_TONE[s.status]}
                      aria-hidden
                    />
                    <div className={styles.ticketMain}>
                      <div className={styles.ticketTop}>
                        <span className={styles.ticketNo}>{s.serviceNo}</span>
                        <Badge tone={STATUS_TONE[s.status] as 'brand'}>
                          {STATUS_LABELS[s.status]}
                        </Badge>
                      </div>
                      <div className={styles.ticketDevice}>
                        <Icon name="microchip" aria-hidden />
                        {s.category}
                        {s.device ? ` · ${s.device}` : ''}
                      </div>
                      <div className={styles.ticketMeta}>
                        <span className={styles.ticketDate}>
                          <Icon name="calendar" aria-hidden /> {fmtDate(s.createdAt)}
                        </span>
                        <span className={styles.ticketCost}>{fmtRp(s.finalCost)}</span>
                      </div>
                    </div>
                    <Icon name="arrow-right" className={styles.ticketArrow} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
