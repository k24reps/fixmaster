// ============================================================
// FixMaster — Edge Function: backup-email
//
// Tiap Senin (pg_cron, migrasi 0085) mengirim email ke OWNER tiap toko berisi
// tautan unduh 7 hari ke salinan otomatis terbaru di bucket `org-backups`.
// Tautan, bukan lampiran: berkasnya tetap di server, dan email yang bocor
// setelah seminggu tak berisi data apa pun.
//
// Gerbang: header x-cron-secret = BACKUP_CRON_SECRET (sama dengan auto-backup).
// Toko DILEWATI bila: ditangguhkan, masih Trial (backup JSON memang dikunci
// selama Trial di Pengaturan — email tak boleh jadi jalan pintasnya), akun
// demo, atau owner mematikannya (organizations.settings.backupEmail = false).
//
// Env:
//   RESEND_API_KEY        kosong = DRY RUN (dicatat, tidak dikirim)
//   SUPABASE_PUBLIC_URL   origin publik untuk tautan (mis. https://api.fixmaster.my.id);
//                         SUPABASE_URL di dalam kontainer adalah alamat internal
//   MAIL_FROM             default "FixMaster <noreply@fixmaster.app>"
//   MAIL_REPLY_TO         default fixmaster.cs@gmail.com (fixmaster.app tak punya kotak masuk)
//
// Body opsional (untuk uji manual dengan rahasia yang sama):
//   { "orgId": "<uuid>", "dryRun": true }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'org-backups';
const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const TZ = 'Asia/Jakarta';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (d: Date, withTime = false) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d) + (withTime ? ' WIB' : '');

/** `auto-2026-09-23T18-00-00-000Z.json` → Date. Nama berkas = waktu backup (0052). */
function backupDate(name: string): Date | null {
  const m = /^auto-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/.exec(name);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
}

/** Minggu ISO kasar untuk kunci idempotensi: ulang kirim di minggu yang sama = no-op. */
const weekKey = (d: Date) => `${d.getUTCFullYear()}-${Math.floor((d.getTime() / 86_400_000 + 3) / 7)}`;

function renderEmail(p: { shop: string; backupAt: Date; expiresAt: Date; sizeKb: number; url: string }) {
  const shop = esc(p.shop);
  const subject = `Backup mingguan ${p.shop} — ${fmtDate(p.backupAt)}`;
  // Email klien tidak mengenal CSS var / stylesheet: warna literal & gaya inline
  // adalah satu-satunya cara. Bahasanya tetap bench: readout mono, LED, spine amber.
  const html = `<!doctype html><html lang="id"><body style="margin:0;padding:0;background:#f0eeea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0eeea;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fdfcf9;border:1px solid #d6d1c8;border-radius:12px;border-left:3px solid #cf7c08;">
<tr><td style="padding:22px 26px 6px;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;letter-spacing:0.08em;color:#5d6167;">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#077a52;margin-right:8px;"></span>FIXMASTER · BACKUP MINGGUAN</td></tr>
<tr><td style="padding:8px 26px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:20px;font-weight:700;color:#212327;">${shop}</td></tr>
<tr><td style="padding:10px 26px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#43474d;">
Salinan lengkap data toko Anda per <strong style="color:#212327;">${esc(fmtDate(p.backupAt, true))}</strong> siap diunduh. Simpan berkasnya di tempat aman, misalnya Google Drive atau laptop Anda.</td></tr>
<tr><td style="padding:20px 26px 4px;">
<a href="${esc(p.url)}" style="display:inline-block;background:#e8920c;color:#1a1205;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;">Unduh backup (${p.sizeKb} KB)</a></td></tr>
<tr><td style="padding:8px 26px 0;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;color:#5d6167;">
Tautan berlaku sampai ${esc(fmtDate(p.expiresAt, true))}.</td></tr>
<tr><td style="padding:18px 26px 0;"><div style="border-top:1px dotted #bdb6aa;"></div></td></tr>
<tr><td style="padding:14px 26px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.6;color:#43474d;">
<strong style="color:#212327;">Memulihkan:</strong> buka FixMaster → Pengaturan → Sistem → <em>Pulihkan dari File</em>, lalu pilih berkas ini.<br>
<strong style="color:#212327;">Tautan kedaluwarsa?</strong> Salinan 7 malam terakhir selalu tersedia di Pengaturan → Sistem → Backup otomatis.<br>
<strong style="color:#99202f;">Jangan teruskan email ini.</strong> Berkasnya berisi seluruh data toko, termasuk pelanggan dan keuangan.</td></tr>
<tr><td style="padding:18px 26px 22px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5d6167;">
Dikirim otomatis tiap Senin oleh FixMaster · fixmaster.app. Tidak ingin menerimanya? Matikan di Pengaturan → Sistem → Backup & Restore.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `FixMaster · Backup mingguan — ${p.shop}`,
    '',
    `Salinan lengkap data toko per ${fmtDate(p.backupAt, true)} siap diunduh (${p.sizeKb} KB):`,
    p.url,
    '',
    `Tautan berlaku sampai ${fmtDate(p.expiresAt, true)}.`,
    'Memulihkan: Pengaturan → Sistem → Pulihkan dari File.',
    'Tautan kedaluwarsa? Salinan 7 malam terakhir ada di Pengaturan → Sistem → Backup otomatis.',
    'Jangan teruskan email ini: berkasnya berisi seluruh data toko.',
    '',
    'Tidak ingin menerimanya? Matikan di Pengaturan → Sistem → Backup & Restore.',
  ].join('\n');
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const expected = Deno.env.get('BACKUP_CRON_SECRET');
  if (!expected) return json({ error: 'BACKUP_CRON_SECRET belum diset' }, 500);
  if (req.headers.get('x-cron-secret') !== expected) return new Response('forbidden', { status: 403 });

  let opts: { orgId?: string; dryRun?: boolean } = {};
  try {
    opts = await req.json();
  } catch {
    /* body kosong dari pg_cron = jalankan semua */
  }

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const dryRun = opts.dryRun === true || !apiKey;
  const from = Deno.env.get('MAIL_FROM') || 'FixMaster <noreply@fixmaster.app>';
  const replyTo = Deno.env.get('MAIL_REPLY_TO') || 'fixmaster.cs@gmail.com';
  const publicUrl = (Deno.env.get('SUPABASE_PUBLIC_URL') ?? '').replace(/\/$/, '');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let q = admin.from('organizations').select('id, name, plan_type, is_demo, settings');
  if (opts.orgId) q = q.eq('id', opts.orgId);
  const { data: orgs, error: orgErr } = await q;
  if (orgErr) return json({ error: orgErr.message }, 500);

  const now = new Date();
  const results: { orgId: string; status: string; reason?: string }[] = [];

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const settings = (org.settings ?? {}) as { backupEmail?: boolean };
    // Dilewati tanpa dicatat: bukan kegagalan, dan mencatatnya tiap minggu
    // hanya menumpuk baris yang tak pernah dibaca siapa pun.
    if (settings.backupEmail === false) { results.push({ orgId, status: 'off' }); continue; }
    if (org.is_demo) { results.push({ orgId, status: 'skip', reason: 'demo' }); continue; }
    if (org.plan_type === 'suspended' || org.plan_type === 'trial') {
      results.push({ orgId, status: 'skip', reason: org.plan_type as string });
      continue;
    }

    const log = (row: Record<string, unknown>) =>
      admin.from('backup_email_runs').insert({ org_id: orgId, ...row });

    try {
      // ---- salinan otomatis terbaru ----
      const { data: listed, error: listErr } = await admin.storage.from(BUCKET).list(orgId, { limit: 100 });
      if (listErr) throw new Error(`list: ${listErr.message}`);
      const latest = (listed ?? [])
        .filter((o) => backupDate(o.name))
        .sort((a, b) => b.name.localeCompare(a.name))[0];
      if (!latest) {
        await log({ status: 'skipped', error: 'belum ada backup otomatis' });
        results.push({ orgId, status: 'skipped', reason: 'no-backup' });
        continue;
      }
      const objectPath = `${orgId}/${latest.name}`;
      const sizeKb = Math.max(1, Math.round(((latest.metadata as { size?: number } | null)?.size ?? 0) / 1024));

      // ---- penerima: semua owner aktif ----
      const { data: owners, error: memErr } = await admin
        .from('memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .eq('active', true)
        .is('deleted_at', null);
      if (memErr) throw new Error(`memberships: ${memErr.message}`);
      const recipients: string[] = [];
      for (const m of owners ?? []) {
        const { data } = await admin.auth.admin.getUserById(m.user_id as string);
        if (data?.user?.email) recipients.push(data.user.email);
      }
      if (recipients.length === 0) {
        await log({ status: 'skipped', object_path: objectPath, error: 'tidak ada owner dengan email' });
        results.push({ orgId, status: 'skipped', reason: 'no-owner-email' });
        continue;
      }

      // ---- tautan 7 hari ----
      const backupAt = backupDate(latest.name)!;
      const stamp = backupAt.toISOString().slice(0, 10);
      const { data: signed, error: signErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(objectPath, LINK_TTL_SECONDS, { download: `fixmaster-backup-${stamp}.json` });
      if (signErr || !signed) throw new Error(`sign: ${signErr?.message ?? 'kosong'}`);
      // createSignedUrl memakai SUPABASE_URL (alamat internal Docker). Token-nya
      // tak terikat host, jadi cukup ganti origin ke alamat publik.
      const u = new URL(signed.signedUrl);
      const url = publicUrl ? publicUrl + u.pathname + u.search : signed.signedUrl;
      const expiresAt = new Date(now.getTime() + LINK_TTL_SECONDS * 1000);

      const mail = renderEmail({ shop: (org.name as string) || 'Toko Anda', backupAt, expiresAt, sizeKb, url });

      if (dryRun) {
        // Tautan TIDAK dikembalikan: respons pg_net tersimpan di tabel database.
        await log({ status: 'dry_run', recipients, object_path: objectPath, link_expires_at: expiresAt.toISOString() });
        results.push({ orgId, status: 'dry_run' });
        continue;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          // Ulang kirim (retry cron/manual) di minggu yang sama tidak menggandakan email.
          'idempotency-key': `backup-${orgId}-${weekKey(now)}`,
        },
        body: JSON.stringify({ from, to: recipients, reply_to: replyTo, ...mail }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`resend ${res.status}: ${(body as { message?: string }).message ?? 'gagal'}`);

      await log({
        status: 'sent',
        recipients,
        object_path: objectPath,
        link_expires_at: expiresAt.toISOString(),
        provider_id: (body as { id?: string }).id ?? null,
      });
      results.push({ orgId, status: 'sent' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log({ status: 'failed', error: message.slice(0, 500) });
      console.error(`[backup-email] ${orgId}: ${message}`);
      results.push({ orgId, status: 'failed', reason: message });
    }
  }

  const failed = results.filter((r) => r.status === 'failed').length;
  return json({ dryRun, total: results.length, failed, results }, failed === 0 ? 200 : 207);
});
