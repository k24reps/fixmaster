/**
 * TIER 2b — Gerbang auth Edge Function (kasus aman / negatif saja).
 *
 * Memanggil fungsi edge ter-deploy di staging via fetch mentah dengan HANYA
 * header `apikey` (lolos gateway) TANPA `Authorization` user → fungsi harus
 * menolak (401). Tidak mengubah state apa pun (berhenti di gerbang auth).
 *
 * Catatan: F1 (webhook fail-open saat secret kosong) TIDAK diuji di sini —
 * webhook by design selalu balas 200 (acknowledge-then-verify), jadi black-box
 * tak bisa membedakan fail-open dari no-op. F1 tetap temuan code-review.
 */
import { describe, it, expect } from 'vitest';
import { hasConfig, SUPABASE_URL, ANON_KEY } from './helpers';

const d = hasConfig ? describe : describe.skip;

async function callNoAuth(fn: string, body: unknown) {
  return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

d('Tier 2b — Edge function menolak tanpa JWT', () => {
  // Menggantikan uji `create-invoice` (Duitku dicabut). gopay-listener kini
  // satu-satunya jalur uang, dan gerbangnya adalah shared secret di header —
  // bukan JWT. Tanpa header itu ia HARUS menolak: 401 (secret terpasang,
  // header salah/absen) atau 503 (fail-closed, secret belum diset di env).
  // Yang penting: tidak pernah 2xx, karena 2xx berarti pembayaran bisa
  // dipalsukan tanpa kredensial apa pun.
  it('gopay-listener tanpa X-Listener-Secret → ditolak', async () => {
    const res = await callNoAuth('gopay-listener', {
      text: 'Kamu menerima Rp1 dari Test',
      postedAt: Date.now(),
    });
    expect([401, 503]).toContain(res.status);
  });

  it('delete-account tanpa Authorization → 401', async () => {
    const res = await callNoAuth('delete-account', {});
    expect(res.status).toBe(401);
  });
});
