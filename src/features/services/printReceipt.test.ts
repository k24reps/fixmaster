import { beforeEach, describe, expect, it } from 'vitest';
import { receiptPreviewHtml, serviceReceiptDoc } from './printReceipt';
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

  it('ditandai kotak BATAL yang sama dengan struk, tepat di bawah tanggal', () => {
    const doc = serviceReceiptDoc(cancelled({ downPayment: 100000 }), org, 'https://app.test');
    expect(doc.voided).toBe(true);
    expect(doc.body.trimStart()).toMatch(/^<div class="void-mark">BATAL<\/div>/);
  });

  it('tanpa ucapan kaki, bawaan maupun buatan toko; atribusi tetap ada', () => {
    const own = { ...org, settings: { receipt: { footer: 'Sampai ketemu lagi' } } } as unknown as Organization;
    const gone = svc({ status: 'batal' });
    const page = receiptPreviewHtml(own, serviceReceiptDoc(gone, own, 'https://app.test'));
    expect(page).not.toContain('class="foot"');
    expect(text(page)).not.toContain('Sampai ketemu lagi');
    expect(receiptPreviewHtml(org, serviceReceiptDoc(gone, org, 'https://app.test'))).not.toMatch(
      /Terima kasih|sampai jumpa/i,
    );
    expect(page).toContain('class="by"');
  });

  it('tiket berjalan tidak bertanda BATAL dan tetap berucapan kaki', () => {
    const doc = serviceReceiptDoc(svc({}), org, 'https://app.test');
    expect(doc.voided).toBeFalsy();
    expect(doc.body).not.toContain('void-mark');
    expect(receiptPreviewHtml(org, doc)).toContain('class="foot"');
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

describe('serviceReceiptDoc: setelan toko', () => {
  const withReceipt = (receipt: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ ...org, settings: { receipt, ...extra } }) as unknown as Organization;
  const docWith = (receipt: Record<string, unknown>, s: Service = svc({ technicianName: 'Rudi' })) =>
    serviceReceiptDoc(s, withReceipt(receipt), 'https://app.test');

  it('tanpa setelan: kertas sama seperti sebelum fitur ada (QR, URL, IMEI; tanpa teknisi atau jam)', () => {
    const doc = serviceReceiptDoc(svc({ technicianName: 'Rudi' }), org, 'https://app.test');
    expect(doc.body).toContain('<svg');
    expect(text(doc.body)).toContain('https://app.test/');
    expect(text(doc.body)).toContain('IMEI/SN');
    expect(text(doc.body)).not.toContain('Teknisi');
    expect(doc.date).not.toMatch(/\d{2}:\d{2}/);
    const page = receiptPreviewHtml(org, doc);
    expect(page).not.toContain('class="tagline"');
    expect(text(page)).toContain('Terima kasih atas kepercayaan Anda.');
    expect(text(doc.body)).toMatch(/bukti pengambilan/);
  });

  it('QR dimatikan: tak ada <svg>, alamat lacak tetap tercetak', () => {
    const doc = docWith({ showQr: false });
    expect(doc.body).not.toContain('<svg');
    expect(text(doc.body)).toContain('LACAK STATUS');
    expect(text(doc.body)).toContain('https://app.test/');
  });

  it('alamat lacak dimatikan: QR tetap, tak ada teks tautan', () => {
    const doc = docWith({ showTrackUrl: false });
    expect(doc.body).toContain('<svg');
    expect(doc.body).not.toContain('class="track-url"');
  });

  it('QR dan alamat dimatikan: seluruh blok LACAK STATUS hilang', () => {
    const doc = docWith({ showQr: false, showTrackUrl: false });
    expect(doc.body).not.toContain('LACAK STATUS');
    expect(doc.body).not.toContain('<svg');
  });

  it('IMEI dimatikan: barisnya hilang, baris unit lain tetap', () => {
    const t = text(docWith({ showImei: false }).body);
    expect(t).not.toContain('IMEI/SN');
    expect(t).toContain('Perangkat');
  });

  it('teknisi dinyalakan: tercetak dengan namanya; tanpa nama tak ada baris kosong', () => {
    expect(text(docWith({ showTechnician: true }).body)).toMatch(/Teknisi\s*Rudi/);
    expect(text(docWith({ showTechnician: true }, svc({ technicianName: '' })).body)).not.toContain('Teknisi');
  });

  it('jam dinyalakan: tanggal diikuti HH:MM dari createdAt', () => {
    expect(docWith({ showTime: true }).date).toMatch(/^\d{1,2} \w{3} 2026 \d{2}:\d{2}$/);
  });

  it('header, ucapan kaki, dan syarat milik toko menggantikan bawaan, di-escape, baris dipisah <br/>', () => {
    const own = withReceipt({
      header: 'Servis HP <b>cepat</b>\nBuka 09-17',
      footer: 'Sampai ketemu lagi',
      serviceTerms: 'Garansi gugur bila segel rusak.',
    });
    const page = receiptPreviewHtml(own, serviceReceiptDoc(svc({}), own, 'https://app.test'));
    expect(page).toContain('<p class="tagline">Servis HP &lt;b&gt;cepat&lt;/b&gt;<br/>Buka 09-17</p>');
    const t = text(page);
    expect(t).toContain('Sampai ketemu lagi');
    expect(t).not.toContain('Terima kasih atas kepercayaan Anda.');
    expect(t).toContain('Garansi gugur bila segel rusak.');
    expect(t).not.toMatch(/bukti pengambilan/);
  });

  it('tiket batal tetap tanpa syarat pengambilan walau toko menulis syarat sendiri', () => {
    const doc = docWith(
      { serviceTerms: 'Syarat toko' },
      svc({ status: 'batal', downPayment: 100000, history: [{ status: 'batal', refund: 100000 } as never] }),
    );
    expect(text(doc.body)).not.toContain('Syarat toko');
  });

  it('alamat kepala: alamat cabang bila ada, selain itu alamat usaha', () => {
    const outlets = [
      { id: 'o-cimahi', address: ' Jl. Cimahi 5 ' },
      { id: 'o-kosong', address: '' },
    ];
    const at = (outletId: string | null) =>
      serviceReceiptDoc(svc({ outletId } as Partial<Service>), org, 'https://app.test', outlets).address;
    expect(at('o-cimahi')).toBe('Jl. Cimahi 5');
    expect(at('o-kosong')).toBe('Jl. Merdeka 12');
    expect(at(null)).toBe('Jl. Merdeka 12');
    expect(at('tak-dikenal')).toBe('Jl. Merdeka 12');
  });
});

describe('serviceReceiptDoc: baris label-nilai ditumpuk bila tak muat', () => {
  const orgOf = (paperWidth: number) =>
    ({ ...org, settings: { receipt: { paperWidth } } }) as unknown as Organization;
  interface Row {
    stacked: boolean;
    strong: boolean;
    label: string;
    value: string;
  }
  const rowsOf = (s: Service, paperWidth: number): Row[] => {
    const el = document.createElement('div');
    el.innerHTML = serviceReceiptDoc(s, orgOf(paperWidth), 'https://app.test').body;
    return [...el.querySelectorAll('tr')].map((tr) => ({
      stacked: tr.classList.contains('stack'),
      strong: tr.classList.contains('strong'),
      label: (tr.querySelector('.k') ?? tr.querySelector('td'))?.textContent ?? '',
      value: (tr.querySelector('.v') ?? tr.querySelector('td:last-child'))?.textContent ?? '',
    }));
  };
  const rowOf = (rows: Row[], label: string) => rows.find((r) => r.label === label);

  it('IMEI ganda (31 huruf) di 58 mm: ditumpuk, label dan nilai utuh', () => {
    const r = rowOf(rowsOf(svc({}), 58), 'IMEI/SN');
    expect(r?.stacked).toBe(true);
    expect(r?.value).toBe('352999112345678/352999112345686');
  });

  it('IMEI ganda di 80 mm: cukup lebar, tetap berdampingan', () => {
    expect(rowOf(rowsOf(svc({}), 80), 'IMEI/SN')?.stacked).toBe(false);
  });

  it('baris pendek tetap berdampingan di 58 mm', () => {
    const rows = rowsOf(svc({}), 58);
    expect(rowOf(rows, 'Pelanggan')?.stacked).toBe(false);
    expect(rowOf(rows, 'Perangkat')?.stacked).toBe(false);
    expect(rowOf(rows, 'Kelengkapan')?.stacked).toBe(false);
  });

  it('bawaan tanpa setelan kertas = 58 mm', () => {
    const el = document.createElement('div');
    el.innerHTML = serviceReceiptDoc(svc({}), org, 'https://app.test').body;
    expect(el.querySelector('tr.stack .k')?.textContent).toBe('IMEI/SN');
  });

  it('keluhan panjang ditumpuk dan tak pernah terpotong', () => {
    const complaint = 'Layar bergaris saat dilipat, kadang mati sendiri setelah dipakai lama';
    const r = rowOf(rowsOf(svc({ complaint }), 58), 'Keluhan');
    expect(r?.stacked).toBe(true);
    expect(r?.value).toBe(complaint);
  });

  it('baris TOTAL "Sudah dibayar (DP)" 200.000 ditumpuk di 58 mm, berdampingan di 80 mm', () => {
    const s = svc({ downPayment: 200000 });
    const at58 = rowOf(rowsOf(s, 58), 'Sudah dibayar (DP)');
    expect(at58?.strong).toBe(true);
    expect(at58?.stacked).toBe(true);
    expect(rowOf(rowsOf(s, 80), 'Sudah dibayar (DP)')?.stacked).toBe(false);
  });

  it('teks yang ditumpuk tetap di-escape', () => {
    const el = document.createElement('div');
    el.innerHTML = serviceReceiptDoc(
      svc({ complaint: `${'x'.repeat(40)}<img src=x onerror=alert(1)>` }),
      orgOf(58),
      'https://app.test',
    ).body;
    expect(el.querySelector('img')).toBeNull();
    const keluhan = [...el.querySelectorAll('tr.stack')].find(
      (tr) => tr.querySelector('.k')?.textContent === 'Keluhan',
    );
    expect(keluhan?.querySelector('.v')?.textContent).toContain('<img src=x');
  });
});
