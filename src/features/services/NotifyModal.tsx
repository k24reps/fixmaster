import { useState } from 'react';
import { Modal, Button, Icon } from '@/components/ui';
import {
  waLink,
  interpolate,
  serviceVars,
  trackingUrl,
  resolveWaTemplates,
  WA_TEMPLATE_LABELS,
  type WaTemplateKey,
} from '@/lib/business/notify';
import { printServiceReceipt } from './printReceipt';
import { getWaTemplateOverrides } from '@/config/orgConfig';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import type { Service } from '@/data/types';
import styles from './NotifyModal.module.css';
import { useT } from '@/i18n';

interface NotifyModalProps {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  /** Template yang dipilih saat dibuka (panel tiket baru / serah unit). */
  initialTemplate?: TemplateKey;
}

type TemplateKey = WaTemplateKey;

export function NotifyModal({ open, onClose, service, initialTemplate }: NotifyModalProps) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const [templateKey, setTemplateKey] = useState<TemplateKey>(initialTemplate ?? 'selesai');
  // Dibuka dari panel tiket baru / serah unit: mulai di template momen itu.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && initialTemplate) setTemplateKey(initialTemplate);
  }
  const [message, setMessage] = useState('');

  const templates = resolveWaTemplates(getWaTemplateOverrides());

  // Include finalCost + updatedAt in the memo key so the message regenerates
  // when the cost (or any field) changes after the modal was first opened.
  // Without this, the WA text kept a stale "Rp 0" until a full page refresh.
  const memoKey = service ? `${service.id}|${templateKey}|${service.finalCost}|${service.updatedAt}` : null;
  useResetOnOpen(open, memoKey, () => {
    // Penyempitan tipe tidak menembus batas callback, jadi diulang di sini.
    // `memoKey` sudah null saat service belum ada, jadi ini praktis tak
    // pernah terpicu — tetapi tetap ditulis agar tipenya jujur.
    if (!service || !org) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const vars = {
      ...serviceVars(service, org),
      tautan: trackingUrl(origin, org.id, service.serviceNo),
    };
    setMessage(interpolate(templates[templateKey], vars));
  });

  if (!service || !org) return null;

  const sendWa = () => {
    if (demoGuard('Kirim WhatsApp aktif di FixMaster versi penuh — daftar gratis.')) return;
    window.open(waLink(service.customerPhone, message), '_blank');
    toast.success(t('notify.waOpening'));
  };

  const copyTracking = async () => {
    const origin = window.location.origin;
    const url = trackingUrl(origin, org.id, service.serviceNo);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('notify.linkCopied'));
    } catch {
      toast.error(t('notify.linkFailed'));
    }
  };

  const printReceipt = () => printServiceReceipt(service, org);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={interpolate(t('notify.title'), { no: service.serviceNo })}
      footer={
        <>
          <Button variant="secondary" onClick={printReceipt} iconLeft={<Icon name="print" aria-hidden />}>
            {t('notify.print')}
          </Button>
          <Button onClick={sendWa} iconLeft={<Icon name="whatsapp" aria-hidden />}>
            {t('notify.sendWa')}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.templateTabs}>
          {(Object.keys(templates) as TemplateKey[]).map((k) => (
            <button
              key={k}
              className={[styles.tab, templateKey === k ? styles.tabActive : ''].join(' ')}
              onClick={() => setTemplateKey(k)}
            >
              {WA_TEMPLATE_LABELS[k]}
            </button>
          ))}
        </div>

        <label className={styles.label}>{t('notify.message')}</label>
        <textarea
          className={styles.textarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={12}
        />

        <button className={styles.copyLink} onClick={copyTracking}>
          <Icon name="link" aria-hidden /> {t('notify.copyLink')}
        </button>
      </div>
    </Modal>
  );
}
