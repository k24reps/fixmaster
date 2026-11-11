import { beforeEach, describe, expect, it } from 'vitest';
import { serviceReceiptDoc } from './printReceipt';
import { useSettingsStore } from '@/stores/settings';
import type { Organization, Service } from '@/data/types';

const org = {
  id: 'org-1',
  name: 'TechFix',
  address: 'Jl. Merdeka 12',
  phone: '0812',
  logoDataUrl: '',
  settings: {},
} as unknown as Organization;

const svc = (over: Partial<Service>): Service =>
  ({
    id: 's1',
    orgId: 'org-1',
    serviceNo: 'FM-0123',
    createdAt: '2026-11-10T08:00:00.000Z',
    customerName: 'Andi',
    device: 'Samsung S23',
    deviceSerial: '352999112345678/352999112345686',
    deviceCondition: '',
    complaint: 'LCD retak',
    accessories: 'Charger',
    status: 'pengerjaan',
    estimateCost: 0,
    finalCost: 0,
    downPayment: 0,
    history: [],
    spareparts: [],
    ...over,
  }) as unknown as Service;

const html = (s: Service) => serviceReceiptDoc(s, org, 'https://app.test').body;
const text = (body: string) => {
  const el = document.createElement('div');
  el.innerHTML = body;
  return el.textContent ?? '';
};

beforeEach(() => useSettingsStore.setState({ language: 'id' }));

describe('serviceReceiptDoc: uang', () => {
  it('biaya akhir 0 + DP: "Sudah dibayar (DP)", tidak ada "Sisa Rp 0"', () => {
    const t = text(html(svc({ estimateCost: 1250000, downPayment: 150000 })));
    expect(t).toContain('Sudah dibayar (DP)');
    expect(t).not.toMatch(/Sisa\s*Rp\s*0/);
  });

  it('biaya akhir + DP: Sisa ditebalkan (kelas strong)', () => {
    const body = html(svc({ finalCost: 500000, downPayment: 200000 }));
    expect(body).toMatch(/<tr class="strong"><td>Sisa<\/td>/);
  });
});

describe('serviceReceiptDoc: tiket batal', () => {
  const cancelled = (over: Partial<Service>) =>
    svc({ status: 'batal', warrantyServiceUntil: '2026-12-10', ...over });

  it('tak mencetak garansi, QR pelacakan, maupun teks bukti pengambilan', () => {
    const body = html(cancelled({ downPayment: 100000, history: [{ status: 'batal', refund: 100000 } as never] }));
    expect(body).not.toContain('GARANSI');
    expect(body).not.toContain('LACAK STATUS');
    expect(body).not.toContain('<svg');
    expect(text(body)).not.toMatch(/bukti pengambilan/);
  });

  it('DP dikembalikan penuh: tercetak diterima dan dikembalikan', () => {
    const t = text(html(cancelled({ downPayment: 100000, history: [{ status: 'batal', refund: 100000 } as never] })));
    expect(t).toContain('DP diterima');
    expect(t).toContain('DP dikembalikan');
    expect(t).not.toContain('DP ditahan');
  });

  it('refund belum dicatat: hanya "DP diterima", tanpa menebak', () => {
    const t = text(html(cancelled({ downPayment: 100000, history: [] })));
    expect(t).toContain('DP diterima');
    expect(t).not.toMatch(/DP dikembalikan|DP ditahan/);
  });

  it('tiket berjalan tetap membawa QR, blok pelacakan, dan teks bukti', () => {
    const body = html(svc({}));
    expect(body).toContain('LACAK STATUS');
    expect(body).toContain('<svg');
    expect(text(body)).toMatch(/bukti pengambilan/);
  });
});

describe('serviceReceiptDoc: bahasa', () => {
  it('label dan teks tetap mengikuti bahasa aplikasi', () => {
    useSettingsStore.setState({ language: 'en' });
    const doc = serviceReceiptDoc(svc({ finalCost: 500000, downPayment: 200000 }), org, 'https://app.test');
    expect(doc.kind).toBe('SERVICE RECEIPT');
    expect(text(doc.body)).toContain('Balance');
    expect(text(doc.body)).not.toContain('Sisa');
  });
});
