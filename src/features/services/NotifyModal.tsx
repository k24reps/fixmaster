import { useState } from 'react';
import { Modal, Button, Icon } from '@/components/ui';
import {
  waLink,
  interpolate,
  serviceVars,
  trackingUrl,
  resolveWaTemplates,
  WA_TEMPLATE_LABELS,
  serviceReceiptLines,
  type WaTemplateKey,
} from '@/lib/business/notify';
import { getWaTemplateOverrides } from '@/config/orgConfig';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { Service } from '@/data/types';
import styles from './NotifyModal.module.css';

interface NotifyModalProps {
  open: boolean;
  onClose: () => void;
  service: Service | null;
}

type TemplateKey = WaTemplateKey;

export function NotifyModal({ open, onClose, service }: NotifyModalProps) {
  const org = useSessionStore((s) => s.org);
  const [templateKey, setTemplateKey] = useState<TemplateKey>('selesai');
  const [message, setMessage] = useState('');

  const templates = resolveWaTemplates(getWaTemplateOverrides());

  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && service && org && lastKey !== service.id + templateKey) {
    setLastKey(service.id + templateKey);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const vars = {
      ...serviceVars(service, org),
      tautan: trackingUrl(origin, org.id, service.serviceNo),
    };
    setMessage(interpolate(templates[templateKey], vars));
  }

  if (!service || !org) return null;

  const sendWa = () => {
    window.open(waLink(service.customerPhone, message), '_blank');
    toast.success('Membuka WhatsApp…');
  };

  const copyTracking = async () => {
    const origin = window.location.origin;
    const url = trackingUrl(origin, org.id, service.serviceNo);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link tracking disalin');
    } catch {
      toast.error('Gagal menyalin link');
    }
  };

  const printReceipt = () => {
    const lines = serviceReceiptLines(service);
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) {
      toast.error('Popup diblokir browser');
      return;
    }
    const rows = lines
      .map((l) => `<tr><td>${escapeHtml(l.label)}</td><td style="text-align:right">${escapeHtml(l.value)}</td></tr>`)
      .join('');
    win.document.write(`
      <html><head><title>Nota ${escapeHtml(service.serviceNo)}</title>
      <style>
        * { font-family: 'Courier New', monospace; font-size: 12px; }
        body { padding: 12px; max-width: 280px; }
        h2 { text-align: center; margin: 0 0 4px; font-size: 14px; }
        .sub { text-align: center; color: #555; margin-bottom: 10px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 3px 0; }
        hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
        .foot { text-align: center; margin-top: 12px; font-size: 11px; }
      </style></head><body>
        <h2>${escapeHtml(org.name)}</h2>
        <div class="sub">${escapeHtml(org.address || '')}${org.phone ? ' · ' + escapeHtml(org.phone) : ''}</div>
        <hr/>
        <table>${rows}</table>
        <hr/>
        <div class="foot">Terima kasih atas kepercayaan Anda</div>
        <script>window.onload = function(){ window.print(); }</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Notifikasi — ${service.serviceNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={printReceipt} iconLeft={<Icon name="print" aria-hidden />}>
            Cetak Nota
          </Button>
          <Button onClick={sendWa} iconLeft={<Icon name="whatsapp" aria-hidden />}>
            Kirim WhatsApp
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

        <label className={styles.label}>Pesan</label>
        <textarea
          className={styles.textarea}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
        />

        <button className={styles.copyLink} onClick={copyTracking}>
          <Icon name="link" aria-hidden /> Salin link tracking publik
        </button>
      </div>
    </Modal>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
