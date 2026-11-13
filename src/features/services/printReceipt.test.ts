import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openReceiptWindow, receiptPreviewHtml, serviceReceiptDoc } from './printReceipt';
import {
  BASE_FONT_DOTS,
  MONO_ADVANCE_EM,
  QR_QUIET_MODULES,
  ROW_GAP_DOTS,
  STRONG_FONT_DOTS,
  STRONG_TRACKING_EM,
  dotsToPx,
  paperSpec,
} from '@/lib/business/receiptPaper';
import { qrMatrix } from '@/lib/qr';
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

describe('bilah "Cetak lagi / Tutup"', () => {
  it('pratinjau Pengaturan (roll: null) tak pernah memuat bilah maupun skrip', () => {
    const page = receiptPreviewHtml(org, serviceReceiptDoc(svc({}), org, 'https://app.test'));
    expect(page).not.toContain('fm-printbar');
    expect(page).not.toContain('<script>');
    expect(page).not.toContain('viewport');
  });

  it('jendela cetak nota memuat bilah, dan gulungan tetap diukur dari <body>', () => {
    const write = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ document: { write, close: vi.fn() } } as unknown as Window);
    openReceiptWindow(org, serviceReceiptDoc(svc({}), org, 'https://app.test'));
    const page = write.mock.calls[0][0] as string;
    expect(page).toContain('class="fm-printbar"');
    expect(page).toContain('document.body.getBoundingClientRect()');
    // Bilah ada di luar `.brand` dan isi nota: bukan bagian kertas.
    expect(page.indexOf('class="fm-printbar"')).toBeGreaterThan(page.indexOf('DICETAK DENGAN FIXMASTER'));
    vi.restoreAllMocks();
  });
});

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
    expect(body).not.toContain('class="track"');
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
    expect(body).toContain('class="track"');
    expect(body).toContain('<svg');
    expect(text(body)).toMatch(/bukti pengambilan/);
  });
});

describe('serviceReceiptDoc: bahasa', () => {
  it('label dan teks tetap mengikuti bahasa aplikasi', () => {
    useSettingsStore.setState({ language: 'en' });
    const doc = serviceReceiptDoc(
      svc({ status: 'selesai', finalCost: 500000, downPayment: 200000 }),
      org,
      'https://app.test',
    );
    expect(doc.kind).toBe('SERVICE RECEIPT');
    expect(text(doc.body)).toContain('Balance');
    expect(text(doc.body)).not.toContain('Sisa');
  });
});

describe('serviceReceiptDoc: tahap siklus hidup', () => {
  const docOf = (over: Partial<Service>, o: Organization = org) =>
    serviceReceiptDoc(svc(over), o, 'https://app.test');
  const PICKED = { pickedUp: true, pickedUpAt: '2026-11-12T09:00:00.000Z' };

  it('unit masih di toko: judul TANDA TERIMA', () => {
    const received = docOf({ status: 'diterima' });
    expect(received.kind).toBe('TANDA TERIMA');
    expect(received.title).toBe('Tanda terima');
    for (const status of ['diagnosa', 'konfirmasi', 'tunggu', 'pengerjaan'] as const)
      expect(docOf({ status }).kind, status).toBe('TANDA TERIMA');
  });

  it('selesai atau lunas yang belum diambil: tetap NOTA SERVIS', () => {
    for (const status of ['selesai', 'lunas'] as const) {
      const doc = docOf({ status });
      expect(doc.kind, status).toBe('NOTA SERVIS');
      expect(doc.body, status).not.toContain('sign-box');
    }
  });

  // Judul sudah menyatakan tahap saat cetak; pita empat tahap dibuang agar nota ringkas.
  it('tak ada pita tahap di tahap mana pun', () => {
    for (const over of [{ status: 'diterima' }, { status: 'selesai' }, { status: 'lunas', ...PICKED }] as Partial<Service>[])
      expect(docOf(over).body).not.toMatch(/class="(gauge|step)/);
  });

  it('sudah diambil: SERAH TERIMA, kotak tanda tangan, tanggal diambil', () => {
    const doc = docOf({ status: 'lunas', finalCost: 500000, ...PICKED });
    expect(doc.kind).toBe('SERAH TERIMA');
    expect(doc.title).toBe('Serah terima');
    expect(doc.body).toContain('class="sign-box"');
    expect(text(doc.body)).toContain('PENERIMA UNIT');
    expect(text(doc.body)).toMatch(/Diambil\s*12 Nov 2026/);
  });

  it('serah terima memakai kalimat serah terima, bukan "bukti pengambilan"', () => {
    const t = text(docOf({ status: 'lunas', ...PICKED }).body);
    expect(t).toContain('bukti serah terima');
    expect(t).not.toMatch(/bukti pengambilan|luar jam operasional/);
  });

  it('kalimat buatan toko menggantikan kalimat bawaan di semua tahap', () => {
    const own = {
      ...org,
      settings: { receipt: { serviceTerms: 'Garansi hanya berlaku dengan nota ini.' } },
    } as unknown as Organization;
    for (const over of [{}, { status: 'selesai' }, { status: 'lunas', ...PICKED }] as Partial<Service>[]) {
      const t = text(docOf(over, own).body);
      expect(t).toContain('Garansi hanya berlaku dengan nota ini.');
      expect(t).not.toMatch(/bukti pengambilan|bukti serah terima/);
    }
  });

  it('tiket batal: tak ada tanda tangan maupun tanggal diambil; judul tetap NOTA SERVIS', () => {
    const doc = docOf({ status: 'batal', downPayment: 100000, ...PICKED });
    expect(doc.kind).toBe('NOTA SERVIS');
    expect(doc.body).not.toContain('sign-box');
    expect(text(doc.body)).not.toMatch(/Diambil/);
    expect(doc.body.trimStart()).toMatch(/^<div class="void-mark">BATAL<\/div>/);
  });

  it('tanda tangan hanya muncul di serah terima', () => {
    const statuses = ['diterima', 'diagnosa', 'konfirmasi', 'tunggu', 'pengerjaan', 'selesai', 'lunas', 'batal'] as const;
    for (const status of statuses)
      for (const picked of [{}, PICKED]) {
        const doc = docOf({ status, ...picked });
        expect(doc.body.includes('sign-box'), `${status} ${JSON.stringify(picked)}`).toBe(doc.kind === 'SERAH TERIMA');
      }
  });

  // Status tak lagi dicetak sebagai fakta: kertas ini dibawa pulang berminggu-minggu.
  it('tak ada baris "Status" pada tahap mana pun', () => {
    for (const status of ['diterima', 'pengerjaan', 'selesai', 'lunas', 'batal'] as const)
      expect(docOf({ status }).body, status).not.toMatch(/<td>Status<\/td>/);
  });

  it('bahasa Inggris memakai kamus sendiri', () => {
    useSettingsStore.setState({ language: 'en' });
    expect(docOf({}).kind).toBe('INTAKE RECEIPT');
    expect(docOf({ status: 'lunas', ...PICKED }).kind).toBe('PICKUP RECEIPT');
    expect(text(docOf({ status: 'lunas', ...PICKED }).body)).toContain('RECEIVED BY');
  });

  it('tanpa gaya sebaris: semua tata letak lewat kelas', () => {
    for (const status of ['diterima', 'pengerjaan', 'selesai'] as const)
      expect(docOf({ status }).body).not.toMatch(/style=/);
  });

  it('judul dan nomor muat sebaris di kertas 58 mm dalam kedua bahasa', () => {
    const spec = paperSpec(58);
    const glyph = BASE_FONT_DOTS * MONO_ADVANCE_EM;
    const noWidth = 'FM-0123'.length * (STRONG_FONT_DOTS * MONO_ADVANCE_EM + STRONG_FONT_DOTS * STRONG_TRACKING_EM);
    for (const language of ['id', 'en'] as const) {
      useSettingsStore.setState({ language });
      for (const over of [{}, { status: 'selesai' }, { status: 'lunas', ...PICKED }] as Partial<Service>[]) {
        const doc = docOf(over);
        const kindWidth = [...doc.kind].length * (glyph + BASE_FONT_DOTS * 0.18);
        expect(kindWidth + ROW_GAP_DOTS + noWidth, `${language} ${doc.kind}`).toBeLessThanOrEqual(spec.contentDots);
      }
    }
  });
});

describe('serviceReceiptDoc: estimasi', () => {
  it('biaya akhir ada: Estimasi tak tercetak; belum ada: Estimasi tercetak', () => {
    const final = text(html(svc({ estimateCost: 450000, finalCost: 500000 })));
    expect(final).not.toContain('Estimasi');
    expect(final).toContain('Biaya');
    const pending = text(html(svc({ estimateCost: 450000, finalCost: 0 })));
    expect(pending).toContain('Estimasi');
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
    expect(text(doc.body)).toContain('app.test/track?org=org-1&no=FM-0123');
    expect(text(doc.body)).toContain('IMEI/SN');
    expect(text(doc.body)).not.toContain('Teknisi');
    expect(doc.date).not.toMatch(/\d{2}:\d{2}/);
    const page = receiptPreviewHtml(org, doc);
    expect(page).not.toContain('class="tagline"');
    expect(text(page)).toContain('Terima kasih atas kepercayaan Anda.');
    expect(text(doc.body)).toMatch(/bukti pengambilan/);
  });

  it('QR dimatikan: tak ada <svg>, alamat lacak tetap tercetak tanpa ajakan memindai', () => {
    const doc = docWith({ showQr: false });
    expect(doc.body).not.toContain('<svg');
    expect(text(doc.body)).toContain('Cek status & garansi di:');
    expect(text(doc.body)).not.toContain('Pindai');
    expect(text(doc.body)).toContain('app.test/track?org=org-1&no=FM-0123');
  });

  it('alamat lacak dimatikan: QR tetap, tak ada teks tautan', () => {
    const doc = docWith({ showTrackUrl: false });
    expect(doc.body).toContain('<svg');
    expect(doc.body).not.toContain('class="track-url"');
  });

  it('QR dan alamat dimatikan: seluruh blok lacak hilang', () => {
    const doc = docWith({ showQr: false, showTrackUrl: false });
    expect(doc.body).not.toContain('class="track"');
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

describe('serviceReceiptDoc: kode lacak dan cetak ulang (0100)', () => {
  const now = new Date(2026, 10, 12, 9, 5); // 12 Nov 2026 09:05 lokal
  const doc = (s: Service, opts: Parameters<typeof serviceReceiptDoc>[4]) =>
    serviceReceiptDoc(s, org, 'https://app.test', [], opts);

  it('kode lacak: alamat pendek tercetak tanpa skema, tanpa nomor tiket maupun id toko', () => {
    const t = text(doc(svc({}), { trackCode: '7K3M9QXR2D' }).body);
    expect(t).toContain('app.test/t/7K3M9QXR2D');
    expect(t).not.toContain('https://');
    expect(t).not.toContain('org=');
  });

  it('tanpa kode (0100 belum diterapkan): alamat lama, juga tanpa skema', () => {
    const t = text(doc(svc({}), {}).body);
    expect(t).toContain('app.test/track?org=org-1&no=FM-0123');
    expect(t).not.toContain('https://');
  });

  it('cetak ulang: kotak CETAK ULANG berisi jam cetak, paling atas di isi nota', () => {
    const body = doc(svc({}), { reprint: true, now }).body;
    expect(body).toContain('class="reprint"');
    expect(text(body)).toContain('CETAK ULANG');
    expect(text(body)).toContain('12 Nov 2026 09:05');
    expect(body.indexOf('class="reprint"')).toBeLessThan(body.indexOf('class="track"'));
    expect(body.trimStart().startsWith('<div class="reprint">')).toBe(true);
  });

  it('cetakan pertama tak bertanda', () => {
    expect(doc(svc({}), { now }).body).not.toContain('class="reprint"');
    expect(doc(svc({}), { reprint: false, now }).body).not.toContain('class="reprint"');
  });

  it('tiket batal: kotak BATAL saja, tanpa penanda salinan', () => {
    const body = doc(svc({ status: 'batal' }), { reprint: true, now }).body;
    expect(body).toContain('class="void-mark"');
    expect(body).not.toContain('class="reprint"');
  });

  it('bahasa Inggris memakai kamus sendiri', () => {
    useSettingsStore.setState({ language: 'en' });
    expect(text(doc(svc({}), { reprint: true, now }).body)).toContain('REPRINT');
  });
});

describe('openReceiptWindow: hasil buka jendela', () => {
  it('true bila jendela terbuka, false bila popup diblokir (cetakan tak dicatat)', () => {
    const d = serviceReceiptDoc(svc({}), org, 'https://app.test');
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write: vi.fn(), close: vi.fn() },
    } as unknown as Window);
    expect(openReceiptWindow(org, d)).toBe(true);
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openReceiptWindow(org, d)).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('serviceReceiptDoc: blok lacak ringkas, QR besar di tengah', () => {
  const orgOf = (paperWidth: number) =>
    ({ ...org, settings: { receipt: { paperWidth } } }) as unknown as Organization;
  const trackOf = (paperWidth = 58, trackCode: string | null = '7K3M9QXR2D') => {
    const el = document.createElement('div');
    el.innerHTML = serviceReceiptDoc(svc({}), orgOf(paperWidth), 'https://app.test', [], { trackCode }).body;
    return el.querySelector('.track');
  };

  it('QR berdiri sendiri: tanpa label blok, kalimat dan alamat di bawahnya', () => {
    const track = trackOf();
    expect(track?.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(track?.querySelector('.track-copy')?.textContent).toBe('Pindai untuk cek status & garansi');
    expect(track?.querySelector('.track-url')?.textContent).toBe('app.test/t/7K3M9QXR2D');
    expect(track?.querySelector('.block-label')).toBeNull();
  });

  it('modul 6 titik dengan zona sunyi 4 modul: kode ±25 mm, dulu ±16 mm', () => {
    const url = 'https://app.test/t/7K3M9QXR2D';
    const modules = qrMatrix(url).length;
    const svg = trackOf()?.querySelector('svg');
    const side = modules + 2 * QR_QUIET_MODULES;
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${side} ${side}`);
    expect(Number(svg?.getAttribute('width'))).toBeCloseTo(side * dotsToPx(6), 2);
    expect(Number(svg?.getAttribute('width'))).toBeLessThanOrEqual(paperSpec(58).contentPx);
  });

  it('alamat lama yang panjang tetap muat selebar isi 58 mm', () => {
    const svg = trackOf(58, null)?.querySelector('svg');
    expect(Number(svg?.getAttribute('width'))).toBeLessThanOrEqual(paperSpec(58).contentPx);
  });

  it('alamat lacak punya titik patah setelah "/" dan sebelum "?"/"&": kode tak dibelah', () => {
    expect(trackOf()?.querySelector('.track-url')?.innerHTML).toBe('app.test/<wbr>t/<wbr>7K3M9QXR2D');
    expect(trackOf(58, null)?.querySelector('.track-url')?.innerHTML).toBe(
      'app.test/<wbr>track<wbr>?org=org-1<wbr>&amp;no=FM-0123',
    );
  });
});

describe('kertas nota: kepala dan penutup ringkas', () => {
  const page = (o: Organization = org, s: Service = svc({})) =>
    receiptPreviewHtml(o, serviceReceiptDoc(s, o, 'https://app.test'));

  it('nomor telepon tak dibelah: dibungkus nowrap, alamat tetap boleh membungkus', () => {
    const el = document.createElement('div');
    el.innerHTML = page();
    expect(el.querySelector('.contact')?.textContent).toBe('Jl. Merdeka 12 · 0812');
    expect(el.querySelector('.contact .nw')?.textContent).toBe('0812');
  });

  it('kontak tetap di-escape', () => {
    const odd = { ...org, address: '<b>Jl</b>', phone: '<i>0812</i>' } as unknown as Organization;
    const el = document.createElement('div');
    el.innerHTML = page(odd);
    expect(el.querySelector('.contact b, .contact i')).toBeNull();
    expect(el.querySelector('.contact')?.textContent).toBe('<b>Jl</b> · <i>0812</i>');
  });

  it('ucapan bawaan satu baris, langsung menyambung catatan tanpa jahitan', () => {
    const p = page();
    expect(p).toMatch(/<div class="fine">[^<]*<\/div>\s*<div class="foot">Terima kasih atas kepercayaan Anda\.<\/div>/);
    expect(p).not.toMatch(/sampai jumpa/i);
  });

  it('dokumen batal tanpa ucapan: jahitan yang menutup isi sebelum atribusi', () => {
    expect(page(org, svc({ status: 'batal' }))).toMatch(/<hr class="seam"\/>\s*<div class="by">/);
  });
});

describe('serviceReceiptDoc: Syarat & Ketentuan', () => {
  const terms = {
    pickupDays: 60,
    storageFee: 0,
    checkFee: 0,
    extra: '',
    version: '2026-11-12',
  };
  const body = (s: Service, extra: Parameters<typeof serviceReceiptDoc>[4] = {}) =>
    serviceReceiptDoc(s, org, 'https://app.test', [], { trackCode: '7K3M9QXR2D', ...extra }).body;

  it('tiket ber-S&K: satu kalimat persetujuan tebal beserta versinya, di blok catatan', () => {
    const el = document.createElement('div');
    el.innerHTML = body(svc({}), { terms });
    expect(el.querySelector('.fine .terms')?.textContent).toBe(
      'Dengan menitipkan unit, Anda menyetujui S&K versi 12\u00a0Nov\u00a02026.',
    );
    expect(el.querySelectorAll('.terms')).toHaveLength(1);
  });

  it('kalimat di bawah QR menyebut S&K; QR mati: ajakan membuka alamat', () => {
    expect(text(body(svc({}), { terms }))).toContain('Pindai untuk cek status, garansi & S&K');
    const noQr = { ...org, settings: { receipt: { showQr: false } } } as unknown as Organization;
    const t = text(serviceReceiptDoc(svc({}), noQr, 'https://app.test', [], { terms }).body);
    expect(t).toContain('Cek status, garansi & S&K di:');
  });

  it('tiket lama tanpa salinan S&K: tanpa kalimat persetujuan, kalimat QR lama', () => {
    const b = body(svc({}));
    expect(b).not.toContain('class="terms"');
    expect(text(b)).toContain('Pindai untuk cek status & garansi');
    expect(text(b)).not.toContain('S&K');
  });

  it('tiket batal tak mencetak kalimat persetujuan', () => {
    expect(body(svc({ status: 'batal' }), { terms })).not.toContain('class="terms"');
  });

  it('bahasa Inggris memakai kamus sendiri', () => {
    useSettingsStore.setState({ language: 'en' });
    expect(text(body(svc({}), { terms }))).toContain('By leaving the device, you agree to the Terms version');
  });
});
