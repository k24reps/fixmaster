import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Icon } from '@/components/ui';
import { useSessionStore } from '@/stores/session';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { interpolate } from '@/lib/business/notify';
import { useT } from '@/i18n';
import type { Service } from '@/data/types';
import { NotifyModal } from './NotifyModal';
import { printServiceReceipt } from './printReceipt';
import styles from './TicketDoneModal.module.css';

interface TicketDoneModalProps {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  /** `intake` = tiket baru dibuat; `handover` = unit lunas & diserahkan. */
  variant: 'intake' | 'handover';
}

/**
 * Dua momen fisik di konter — unit dititipkan dan unit diserahkan — dulu hanya
 * ditutup toast, padahal pelanggan masih di depan meja menunggu kertas atau
 * pesan WA. Panel ini menahan momennya: stempel, ringkasan, cetak, kirim WA.
 * Polanya sama dengan panel LUNAS di Kasir.
 */
export function TicketDoneModal({ open, onClose, service, variant }: TicketDoneModalProps) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const navigate = useNavigate();
  const [notifyOpen, setNotifyOpen] = useState(false);
  if (!service) return null;
  const intake = variant === 'intake';

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t(intake ? 'ticketDone.intakeTitle' : 'ticketDone.handoverTitle')}
        size="sm"
        footer={
          <>
            {intake && (
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  navigate(`/services/${service.id}`);
                }}
              >
                {t('ticketDone.viewTicket')}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        <div className={styles.body}>
          <div className={styles.head}>
            <span className={styles.stamp} data-variant={variant}>
              {t(intake ? 'ticketDone.intakeStamp' : 'ticketDone.handoverStamp')}
            </span>
            <span className={styles.no}>{service.serviceNo}</span>
          </div>
          <dl className={styles.readout}>
            <div>
              <dt>{t('ticketDone.unit')}</dt>
              <dd>{service.device}</dd>
            </div>
            <div>
              <dt>{t('ticketDone.customer')}</dt>
              <dd>{service.customerName}</dd>
            </div>
            {intake ? (
              service.estimateCost > 0 && (
                <div>
                  <dt>{t('ticketDone.estimate')}</dt>
                  <dd>{fmtRp(service.estimateCost)}</dd>
                </div>
              )
            ) : (
              <>
                <div>
                  <dt>{t('ticketDone.paid')}</dt>
                  <dd>{fmtRp(service.finalCost)}</dd>
                </div>
                {service.warrantyServiceUntil && (
                  <div>
                    <dt>{t('ticketDone.warranty')}</dt>
                    <dd>
                      {interpolate(t('ticketDone.until'), { date: fmtDate(service.warrantyServiceUntil.slice(0, 10)) })}
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>
          <p className={styles.hint}>{t(intake ? 'ticketDone.intakeHint' : 'ticketDone.handoverHint')}</p>
          <div className={styles.actions}>
            {org && (
              <Button onClick={() => printServiceReceipt(service, org)} iconLeft={<Icon name="print" aria-hidden />}>
                {t(intake ? 'ticketDone.printIntake' : 'ticketDone.printNota')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setNotifyOpen(true)} iconLeft={<Icon name="whatsapp" aria-hidden />}>
              {t('ticketDone.sendWa')}
            </Button>
          </div>
        </div>
      </Modal>
      <NotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        service={service}
        initialTemplate={intake ? 'diterima' : 'diambil'}
      />
    </>
  );
}
