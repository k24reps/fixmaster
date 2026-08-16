// ============================================================
// FixMaster — Alat operator: rekonsiliasi pembayaran GoPay
//
// Menutup jalur pemulihan manual saat pembayaran GoPay meleset (sinyal lemah,
// HP mati > window, dsb). Uang selalu masuk di akun GoPay Merchant server-side;
// yang hilang cuma konfirmasi otomatisnya. Alat ini menyandingkan invoice
// GoPay yang belum lunas dengan riwayat GoPay Merchant-mu, lalu apply by id.
//
// KENAPA DI scripts/, BUKAN di app pelanggan atau APK listener: alat ini pakai
// SERVICE ROLE (bisa apply invoice org mana pun). Service key TIDAK BOLEH ada
// di browser atau APK. Di sini ia tetap di mesinmu — tidak pernah ke jaringan
// selain ke Supabase-mu sendiri. Lihat docs/gopay-listener-android.md.
//
// Cara pakai (jalankan dari root repo):
//   node scripts/reconcile-gopay.mjs                     # daftar invoice belum-lunas
//   node scripts/reconcile-gopay.mjs apply <invoiceId>   # PRATINJAU (tidak mengubah)
//   node scripts/reconcile-gopay.mjs apply <invoiceId> --confirm   # benar-benar apply
//   node scripts/reconcile-gopay.mjs --selftest          # cek parser env (offline)
//
// Target default = .env.test.local (STAGING). Untuk produksi, set env dulu:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile-gopay.mjs
// Ref project selalu dicetak sebelum apply — jangan sampai salah environment.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

/** Parse baris KEY=VALUE dari isi file .env. Abaikan komentar & baris kosong. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/\r$/, '');
  }
  return out;
}

function loadConfig() {
  // Env eksplisit menang (jalur produksi); jika tidak, baca .env.test.local.
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    let env = {};
    try {
      env = parseEnv(readFileSync(join(REPO, '.env.test.local'), 'utf8'));
    } catch {
      /* biarkan kosong → error di bawah */
    }
    url = url || env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    key = key || env.SUPABASE_SERVICE_ROLE_KEY;
  }
  if (!url || !key) {
    throw new Error(
      'Konfigurasi tidak lengkap. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,\n' +
        'atau pastikan .env.test.local berisi VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  const ref = new URL(url).host.split('.')[0];
  return { url: url.replace(/\/$/, ''), key, ref };
}

async function rest(cfg, path, init = {}) {
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

async function list(cfg) {
  const rows = await rest(
    cfg,
    '/rest/v1/invoices?provider=eq.gopay&status=in.(pending,expired)' +
      '&select=id,amount,status,created_at,plan,organizations(name)&order=created_at.desc',
  );
  if (!rows.length) {
    console.log(`\n[${cfg.ref}] Tidak ada invoice GoPay yang menggantung. Bersih.\n`);
    return;
  }
  console.log(`\n[${cfg.ref}] Invoice GoPay belum-lunas (${rows.length}):\n`);
  for (const r of rows) {
    const org = r.organizations?.name ?? '(org?)';
    const when = new Date(r.created_at).toLocaleString('id-ID');
    console.log(
      `  ${r.status.padEnd(8)} ${rp(r.amount).padStart(12)}  ${org.padEnd(24)} ${r.plan.padEnd(10)} ${when}`,
    );
    console.log(`           id: ${r.id}`);
  }
  console.log(
    '\nCocokkan NOMINAL dengan riwayat GoPay Merchant-mu, lalu:\n' +
      '  node scripts/reconcile-gopay.mjs apply <id> --confirm\n',
  );
}

async function apply(cfg, id, confirm) {
  const rows = await rest(
    cfg,
    `/rest/v1/invoices?id=eq.${id}&select=id,amount,status,plan,paid_at,organizations(name)`,
  );
  const inv = rows[0];
  if (!inv) {
    throw new Error(`Invoice ${id} tidak ditemukan di [${cfg.ref}].`);
  }
  const org = inv.organizations?.name ?? '(org?)';
  console.log(`\n[${cfg.ref}] Invoice ${id}`);
  console.log(`  org    : ${org}`);
  console.log(`  plan   : ${inv.plan}`);
  console.log(`  nominal: ${rp(inv.amount)}`);
  console.log(`  status : ${inv.status}${inv.paid_at ? ` (paid_at ${inv.paid_at})` : ''}`);

  if (inv.status === 'paid') {
    console.log('\nSudah paid — tidak ada yang perlu dilakukan (apply_payment idempoten).\n');
    return;
  }
  if (!confirm) {
    console.log(
      '\nPRATINJAU saja. Pastikan uangnya BENAR-BENAR ada di riwayat GoPay Merchant,\n' +
        'lalu ulangi dengan --confirm untuk memperpanjang langganan org ini.\n',
    );
    return;
  }

  await rest(cfg, '/rest/v1/rpc/apply_payment', {
    method: 'POST',
    body: JSON.stringify({ p_invoice_id: id }),
  });
  const after = (
    await rest(cfg, `/rest/v1/invoices?id=eq.${id}&select=status,paid_at`)
  )[0];
  console.log(`\n✓ Diterapkan. Status sekarang: ${after.status} (paid_at ${after.paid_at}).`);
  console.log('  Langganan org diperpanjang. Realtime akan memperbarui UI mereka.\n');
}

function selftest() {
  const env = parseEnv('# komentar\nA=1\n\nB = dua \nC=x=y\r\n');
  const ok =
    env.A === '1' && env.B === 'dua' && env.C === 'x=y' && !('#' in env) && !('' in env);
  console.log(ok ? 'selftest OK' : 'selftest GAGAL: ' + JSON.stringify(env));
  process.exit(ok ? 0 : 1);
}

// ---- entry ----
// Lempar error lalu set exitCode (jangan process.exit di tengah fetch — di
// Windows itu memicu assertion libuv saat handle socket masih menutup).
async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === '--selftest') return selftest();
  const cfg = loadConfig();
  if (cmd === 'apply') {
    if (!arg) {
      throw new Error('Perlu invoice id: node scripts/reconcile-gopay.mjs apply <id> [--confirm]');
    }
    return apply(cfg, arg, process.argv.includes('--confirm'));
  }
  return list(cfg);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
