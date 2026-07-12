/**
 * Pure date/time utilities.
 * Avoids toLocaleTimeString for clock rendering (known Chrome/Edge Windows
 * bug rendering 11AM as 23). No DOM/state dependencies → unit-testable.
 */

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/** Local date as "YYYY-MM-DD" (timezone-safe, no UTC shift). */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * LOCAL calendar date ("YYYY-MM-DD") of a full ISO timestamp (createdAt etc.).
 * `iso.slice(0, 10)` is WRONG for this: it yields the UTC date, so in Jakarta
 * (UTC+7) any timestamp before 07:00 local shows as the previous day — wrong
 * intake dates, report ranges, and CSV exports. Always convert via Date first.
 */
export function localDateOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : localDateStr(d);
}

/** Local time as "HH:MM" using getHours/getMinutes (avoids platform bug). */
export function localTimeStr(d: Date = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Local time as "HH:MM:SS" for live clocks (same platform-bug avoidance). */
export function localTimeSec(d: Date = new Date()): string {
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${localTimeStr(d)}:${s}`;
}

/**
 * Hours worked between two "HH:MM" times. If checkOut is earlier than
 * checkIn, assumes an overnight shift and adds 24h. Returns rounded to
 * 2 decimals. Invalid input → 0.
 */
export function calcHours(checkIn: string, checkOut: string): number {
  const inMin = parseHM(checkIn);
  const outMin = parseHM(checkOut);
  if (inMin === null || outMin === null) return 0;
  let diff = outMin - inMin;
  if (diff < 0) diff += 24 * 60; // overnight
  return Math.round((diff / 60) * 100) / 100;
}

function parseHM(hm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm?.trim() ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Format "YYYY-MM-DD" → "2 Jun 2026". */
export function fmtDate(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format with day name → "Senin, 2 Jun 2026". */
export function fmtDateFull(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Parse "YYYY-MM-DD" anchored at local noon to avoid TZ edge issues. */
export function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether `iso` date falls within [from, to] inclusive (date-only). */
export function isInRange(iso: string, from: string, to: string): boolean {
  const d = parseISODate(iso);
  const f = parseISODate(from);
  const t = parseISODate(to);
  if (!d || !f || !t) return false;
  return d.getTime() >= f.getTime() && d.getTime() <= t.getTime();
}

/** Add days to a date string, returning a new "YYYY-MM-DD". */
export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/** Difference in whole days between two date strings (to - from). */
export function daysBetween(from: string, to: string): number {
  const f = parseISODate(from);
  const t = parseISODate(to);
  if (!f || !t) return 0;
  return Math.round((t.getTime() - f.getTime()) / (24 * 60 * 60 * 1000));
}
