/**
 * TIER 2b — Gerbang auth Edge Function (kasus aman / negatif saja).
 *
 * Memanggil fungsi edge ter-deploy di staging via fetch mentah dengan HANYA
 * header `apikey` (lolos gateway) TANPA `Authorization` user → fungsi harus
 * menolak (401). Tidak mengubah state apa pun (berhenti di gerbang auth).
 *
 * Gateway langganan tidak termasuk: sejak 0047 pembayaran dikonfirmasi manual
 * oleh operator dan tidak memakai Edge Function publik.
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
  it('delete-account tanpa Authorization → 401', async () => {
    const res = await callNoAuth('delete-account', {});
    expect(res.status).toBe(401);
  });
});
