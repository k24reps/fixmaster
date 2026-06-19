import { serviceReceiptLines } from '@/lib/business/notify';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import type { Service, Organization } from '@/data/types';

/** Escape user/org text before injecting into the print window markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Open a thermal-style receipt for a service ticket in a new window and trigger
 * the browser print dialog. Shared by NotifyModal and the ticket detail action
 * bar so both produce an identical nota. Guarded in demo mode.
 */
export function printServiceReceipt(service: Service, org: Organization): void {
  if (demoGuard('Cetak nota aktif di FixMaster versi penuh — daftar gratis.')) return;
  const lines = serviceReceiptLines(service);
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) {
    toast.error('Popup diblokir browser');
    return;
  }
  const rows = lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.label)}</td><td style="text-align:right">${escapeHtml(l.value)}</td></tr>`,
    )
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
}
