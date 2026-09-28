/**
 * Pure notification + document helpers: WhatsApp deep links, message
 * template interpolation, and public tracking codes. No DOM/repository
 * deps → unit-testable.
 */
import type { Service, Organization } from '@/data/types';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateOf } from '@/lib/time';
import { STATUS_LABELS, partWarranties, warrantyDecided } from './services';

/** Normalize an Indonesian phone to wa.me format (62xxxxxxxxxx, digits only). */
export function toWaNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (!digits.startsWith('62')) digits = '62' + digits;
  return digits;
}

/** Build a wa.me deep link with a pre-filled message. */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * Interpolate a template with {placeholders}. Unknown placeholders are
 * left as-is so authors can spot typos.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? vars[key] : match,
  );
}

/**
 * `interpolate` hanyalah String.replace — tidak ada percabangan di dalam
 * template. Jadi setiap baris yang datanya BISA kosong (DP, garansi,
 * kelengkapan, alamat) dibangun di sini sebagai variabel yang membawa
 * newline-nya sendiri. Saat datanya tidak ada variabelnya string kosong dan
 * barisnya hilang bersih — tanpa baris kosong menganga, tanpa "Rp 0".
 */
function optionalLine(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  return v ? `\n${label}: ${v}` : '';
}

/**
 * Blok garansi untuk pesan "selesai". Kedua tanggal diisi otomatis persis saat
 * tiket masuk status 'selesai', jadi datanya selalu siap tepat pada momen
 * pesan ini dikirim. `.slice(0, 10)` karena cloud mengembalikan timestamp
 * penuh sedangkan fmtDate hanya menerima YYYY-MM-DD.
 */
function warrantyBlock(service: Service): string {
  const lines: string[] = [];
  // Setelah Selesai, garansi kosong = "tanpa garansi" yang disengaja, dan
  // pelanggan perlu membacanya, bukan menebak tokonya lupa mengisi.
  if (service.warrantyServiceUntil)
    lines.push(`Garansi jasa s/d *${fmtDate(service.warrantyServiceUntil.slice(0, 10))}*`);
  else if (warrantyDecided(service)) lines.push('Garansi jasa: tanpa garansi');
  const parts = partWarranties(service.spareparts ?? []);
  if (parts.length) {
    for (const p of parts)
      lines.push(
        p.until
          ? `Garansi ${p.name} s/d *${fmtDate(p.until.slice(0, 10))}*`
          : `Garansi ${p.name}: tanpa garansi`,
      );
  } else if (service.warrantyPartsUntil) {
    // Tiket lama: satu tanggal untuk semua sparepart.
    lines.push(`Garansi sparepart s/d *${fmtDate(service.warrantyPartsUntil.slice(0, 10))}*`);
  }
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}

/**
 * Blok nominal. Tanpa DP cukup satu baris total. Dengan DP, yang ditebalkan
 * adalah SISA — itulah uang yang benar-benar dibawa pelanggan saat mengambil
 * unit; menyebut total saja membuat mereka datang dengan jumlah yang salah.
 */
function paymentBlock(service: Service): string {
  const dp = service.downPayment;
  // Biaya akhir belum diisi (tiket belum ditutup). Menghitung sisa dari nol
  // hanya menghasilkan "Total Rp 0 / Sisa Rp 0" yang membingungkan, jadi yang
  // disebut cukup uang yang sudah benar-benar masuk.
  if (service.finalCost <= 0 && dp > 0) return `Sudah dibayar (DP): *${fmtRp(dp)}*`;
  if (dp <= 0) return `Total biaya: *${fmtRp(service.finalCost)}*`;
  const sisa = Math.max(0, service.finalCost - dp);
  return [
    `Total biaya: ${fmtRp(service.finalCost)}`,
    `Sudah dibayar (DP): ${fmtRp(dp)}`,
    `*Sisa dibayar saat pengambilan: ${fmtRp(sisa)}*`,
  ].join('\n');
}

/** Variables available to service-related WA templates. */
export function serviceVars(service: Service, org: Organization): Record<string, string> {
  return {
    nama: service.customerName,
    no_servis: service.serviceNo,
    perangkat: service.device,
    status: STATUS_LABELS[service.status],
    biaya: fmtRp(service.finalCost),
    toko: org.name,
    estimasi: fmtRp(service.estimateCost),
    // Keluhan + kelengkapan tercatat di nota, tapi nota kertas hilang dan chat
    // WhatsApp tidak — di sinilah bukti "apa yang saya titipkan" bertahan.
    keluhan: optionalLine('Keluhan', service.complaint),
    kelengkapan: optionalLine('Kelengkapan', service.accessories),
    imei: optionalLine('IMEI/SN', service.deviceSerial),
    kondisi: optionalLine('Kondisi', service.deviceCondition),
    alamat: optionalLine('Alamat', org.address),
    garansi: warrantyBlock(service),
    rincian_bayar: paymentBlock(service),
  };
}

/**
 * Default WA messages: multi-line, sapaan sopan, satu ajakan aksi yang jelas.
 * `*bold*` adalah markup WhatsApp (bukan markdown) — dipakai untuk data yang
 * dicari pelanggan sekilas (no servis, nominal, status).
 *
 * Urutan kuncinya mengikuti alur tiket (diterima → konfirmasi → tunggu →
 * selesai → ingatkan → diambil → batal), karena urutan di sini juga urutan tab di
 * NotifyModal dan urutan kotak edit di Pengaturan.
 *
 * `{tautan}` hanya dipakai di pesan yang statusnya memang bisa dilihat sendiri
 * oleh pelanggan. Halaman /track sengaja tidak menampilkan uang sama sekali,
 * jadi menautkannya dari pesan konfirmasi biaya justru menyesatkan.
 */
export const DEFAULT_WA_TEMPLATES = {
  diterima: `Halo {nama}, terima kasih sudah mempercayakan perangkat Anda kepada kami.

Unit *{perangkat}* sudah kami terima dan masuk antrean pengerjaan.
No. Servis: *{no_servis}*{imei}{keluhan}{kelengkapan}{kondisi}
Estimasi biaya: {estimasi}

Status pengerjaan bisa dipantau kapan saja di:
{tautan}

Kami kabari lagi begitu ada perkembangan. Salam, {toko}`,

  konfirmasi: `Halo {nama}, hasil pemeriksaan unit *{perangkat}* (No. Servis *{no_servis}*) sudah keluar.

Estimasi biaya perbaikan: *{estimasi}*

Mohon konfirmasinya apakah pengerjaan kami lanjutkan. Bila ada yang ingin ditanyakan lebih dulu, silakan balas pesan ini — dengan senang hati kami jelaskan.

Terima kasih, {toko}`,

  tunggu: `Halo {nama}, kami kabari perkembangan unit *{perangkat}* (No. Servis *{no_servis}*).

Pengerjaan saat ini menunggu ketersediaan sparepart. Begitu barangnya tiba unit langsung kami kerjakan, dan Anda kami kabari lagi.

Status terbaru bisa dicek kapan saja di:
{tautan}

Terima kasih atas kesabarannya. Salam, {toko}`,

  selesai: `Halo {nama}, kabar baik — servis Anda sudah *SELESAI*.

Perangkat: *{perangkat}*
No. Servis: *{no_servis}*
{rincian_bayar}{garansi}

Unit siap diambil di *{toko}*.{alamat}
Mohon tunjukkan pesan ini saat pengambilan.

Terima kasih atas kepercayaan Anda.`,

  pengingat_ambil: `Halo {nama}, izin mengingatkan — unit *{perangkat}* (No. Servis *{no_servis}*) sudah selesai dikerjakan dan masih kami simpan di toko.

{rincian_bayar}

Unit siap diambil di *{toko}*.{alamat}
Mohon dijadwalkan pengambilannya ya, agar unit tidak terlalu lama tersimpan.

Terima kasih, {toko}`,

  diambil: `Halo {nama}, terima kasih — unit *{perangkat}* (No. Servis *{no_servis}*) sudah diambil dan lunas.
Total biaya: *{biaya}*{garansi}

Riwayat servis dan masa garansi bisa dicek kapan saja di:
{tautan}

Simpan pesan ini sebagai bukti garansi. Salam, {toko}`,

  batal: `Halo {nama}, mohon maaf — pengerjaan unit *{perangkat}* (No. Servis *{no_servis}*) kami hentikan.

Setelah diperiksa, perbaikan tidak dapat kami lanjutkan. Alasannya kami jelaskan selengkapnya saat pengambilan unit.

Unit bisa diambil kembali di *{toko}*.{alamat}

Bila ada yang ingin ditanyakan lebih dulu, silakan balas pesan ini. Terima kasih sudah mempercayakan kepada kami.`,
};

export type WaTemplateKey = keyof typeof DEFAULT_WA_TEMPLATES;

/** Human labels for each WA template key (used by NotifyModal & Settings). */
export const WA_TEMPLATE_LABELS: Record<WaTemplateKey, string> = {
  diterima: 'Diterima',
  konfirmasi: 'Konfirmasi',
  tunggu: 'Tunggu Part',
  selesai: 'Selesai',
  pengingat_ambil: 'Ingatkan Ambil',
  diambil: 'Diambil',
  batal: 'Batal',
};

/**
 * Placeholder variables available to WA templates (for the Settings editor
 * hint). Lima yang terakhir membawa barisnya sendiri dan hilang total ketika
 * datanya kosong — lihat `optionalLine` di atas.
 */
export const WA_TEMPLATE_VARS = [
  'nama',
  'no_servis',
  'perangkat',
  'status',
  'biaya',
  'estimasi',
  'toko',
  'tautan',
  'keluhan',
  'kelengkapan',
  'imei',
  'kondisi',
  'alamat',
  'garansi',
  'rincian_bayar',
] as const;

/**
 * Merge user overrides over the defaults. Empty/blank overrides fall back to
 * the default for that key, so a cleared field never produces an empty message.
 */
export function resolveWaTemplates(
  overrides: Record<string, string> | null | undefined,
): Record<WaTemplateKey, string> {
  const result = { ...DEFAULT_WA_TEMPLATES };
  if (overrides) {
    for (const key of Object.keys(DEFAULT_WA_TEMPLATES) as WaTemplateKey[]) {
      const v = overrides[key];
      if (typeof v === 'string' && v.trim()) result[key] = v;
    }
  }
  return result;
}

/** Build a public tracking URL for a service. */
export function trackingUrl(origin: string, orgId: string, serviceNo: string): string {
  return `${origin}/track?org=${encodeURIComponent(orgId)}&no=${encodeURIComponent(serviceNo)}`;
}

/**
 * Satu baris nota. `group` menentukan blok mana yang memuatnya saat dicetak —
 * pengelompokan ini milik ISI nota, bukan milik perendernya, jadi ia tinggal
 * di sini bersama datanya alih-alih diterka ulang dari label di printReceipt.
 */
export interface ReceiptLine {
  label: string;
  value: string;
  group: 'identitas' | 'unit' | 'uang' | 'garansi';
  /** Angka yang benar-benar dibawa pelanggan saat mengambil unit. */
  emphasis?: boolean;
}

/** Build structured receipt lines for a service (used by the print view). */
export function serviceReceiptLines(service: Service): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  // Tanggal masuk: bukti kapan unit diterima — pertanyaan nomor satu saat klaim.
  if (service.createdAt)
    // createdAt adalah timestamp penuh; fmtDate hanya menerima YYYY-MM-DD dan
    // mengembalikan masukannya apa adanya kalau tidak cocok — tanpa localDateOf
    // nota mencetak "2026-09-02T09:12:00.000Z" ke tangan pelanggan.
    lines.push({
      label: 'Tanggal',
      value: fmtDate(localDateOf(service.createdAt)),
      group: 'identitas',
    });
  lines.push(
    { label: 'No. Servis', value: service.serviceNo, group: 'identitas' },
    { label: 'Pelanggan', value: service.customerName, group: 'unit' },
    { label: 'Perangkat', value: service.device, group: 'unit' },
  );
  // Bukti "unit seperti apa yang saya titipkan" — nomor seri & kondisi fisik.
  if (service.deviceSerial)
    lines.push({ label: 'IMEI/SN', value: service.deviceSerial, group: 'unit' });
  if (service.deviceCondition)
    lines.push({ label: 'Kondisi', value: service.deviceCondition, group: 'unit' });
  if (service.complaint)
    lines.push({ label: 'Keluhan', value: service.complaint, group: 'unit' });
  if (service.accessories)
    lines.push({ label: 'Kelengkapan', value: service.accessories, group: 'unit' });
  lines.push({ label: 'Status', value: STATUS_LABELS[service.status], group: 'unit' });
  if (service.estimateCost > 0)
    lines.push({ label: 'Estimasi', value: fmtRp(service.estimateCost), group: 'uang' });
  if (service.finalCost > 0)
    lines.push({ label: 'Biaya', value: fmtRp(service.finalCost), group: 'uang' });
  if (service.downPayment > 0) {
    lines.push({ label: 'DP', value: fmtRp(service.downPayment), group: 'uang' });
    lines.push({
      label: 'Sisa',
      value: fmtRp(Math.max(0, service.finalCost - service.downPayment)),
      group: 'uang',
      emphasis: true,
    });
  } else if (service.finalCost > 0) {
    // Tanpa DP, total itu sendirilah yang harus dibayar — tegaskan barisnya
    // supaya mata jatuh ke angka yang sama di kedua kasus.
    lines[lines.length - 1].emphasis = true;
  }
  // Warranty (auto-filled from the shop's default when a service is marked
  // 'selesai'). Printed so the customer has proof of coverage on the nota.
  // Garansi jasa + per sparepart. Setelah Selesai, 0 hari tercetak "Tanpa
  // garansi" supaya pelanggan tahu itu disengaja, bukan lupa diisi.
  if (service.warrantyServiceUntil) {
    lines.push({
      label: 'Jasa',
      value: 's/d ' + fmtDate(service.warrantyServiceUntil.slice(0, 10)),
      group: 'garansi',
    });
  } else if (warrantyDecided(service)) {
    lines.push({ label: 'Jasa', value: 'Tanpa garansi', group: 'garansi' });
  }
  const parts = partWarranties(service.spareparts ?? []);
  if (parts.length) {
    for (const p of parts) {
      lines.push({
        label: p.name,
        value: p.until ? 's/d ' + fmtDate(p.until.slice(0, 10)) : 'Tanpa garansi',
        group: 'garansi',
      });
    }
  } else if (service.warrantyPartsUntil) {
    lines.push({
      label: 'Sparepart',
      value: 's/d ' + fmtDate(service.warrantyPartsUntil.slice(0, 10)),
      group: 'garansi',
    });
  }
  return lines;
}
