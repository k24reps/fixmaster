/**
 * re-date-backup.mjs — Geser semua tanggal di file backup demo ke "hari ini".
 *
 * Tujuan: menjaga akun demo (yang dipampang di landing page) selalu terlihat
 * segar. Ambil satu file backup demo kanonik, jalankan skrip ini, lalu unggah
 * hasilnya lewat Pengaturan → Backup & Restore di akun demo.
 *
 * Cara kerja:
 *   - Cari tanggal PALING BARU di seluruh data (field `date` "YYYY-MM-DD" dan
 *     timestamp ISO pada createdAt/updatedAt/checkIn dll).
 *   - Hitung selisih hari ke hari ini, lalu geser SEMUA tanggal sebesar selisih
 *     itu (mempertahankan jarak antar-hari relatif → pola data tetap realistis).
 *
 * Pemakaian:
 *   node scripts/re-date-backup.mjs <input.json> [output.json]
 *   (default output: <input>-today.json)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPathArg] = process.argv;
if (!inPath) {
  console.error('Usage: node scripts/re-date-backup.mjs <input.json> [output.json]');
  process.exit(1);
}
const outPath = outPathArg ?? inPath.replace(/\.json$/i, '') + '-today.json';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const DAY_MS = 86_400_000;

const raw = JSON.parse(readFileSync(inPath, 'utf8'));

// 1) Find the most recent date anywhere in the file.
let maxMs = -Infinity;
const scan = (v) => {
  if (typeof v === 'string' && (DATE_ONLY.test(v) || ISO_TS.test(v))) {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) maxMs = Math.max(maxMs, ms);
  } else if (Array.isArray(v)) {
    v.forEach(scan);
  } else if (v && typeof v === 'object') {
    Object.values(v).forEach(scan);
  }
};
scan(raw);

if (maxMs === -Infinity) {
  console.error('Tidak menemukan tanggal apa pun di file. Tidak ada yang digeser.');
  process.exit(1);
}

// 2) Delta in whole days from the newest date to today (local midnight).
const today = new Date();
today.setHours(0, 0, 0, 0);
const newest = new Date(maxMs);
newest.setHours(0, 0, 0, 0);
const deltaDays = Math.round((today.getTime() - newest.getTime()) / DAY_MS);

const shift = (v) => {
  if (typeof v === 'string') {
    if (DATE_ONLY.test(v)) {
      const d = new Date(v + 'T00:00:00.000Z');
      d.setUTCDate(d.getUTCDate() + deltaDays);
      return d.toISOString().slice(0, 10);
    }
    if (ISO_TS.test(v)) {
      const ms = Date.parse(v);
      if (!Number.isNaN(ms)) return new Date(ms + deltaDays * DAY_MS).toISOString();
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(shift);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = shift(val);
    return out;
  }
  return v;
};

const shifted = shift(raw);
shifted.exportedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(shifted, null, 2), 'utf8');
console.log(`Digeser ${deltaDays} hari → ${outPath}`);
