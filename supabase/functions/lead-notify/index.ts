// ============================================================
// FixMaster — Edge Function: lead-notify
//
// Mengirim ringkasan kontak baru dari gerbang demo landing (migrasi 0102) ke
// kotak masuk FixMaster. Dipanggil pg_cron tiap 5 menit lewat
// run_demo_lead_notify(), dan hanya bila ada baris demo_leads yang belum
// diberitahukan. Satu email memuat semua kontak baru sejak email terakhir.
//
// Gerbang: header x-cron-secret = BACKUP_CRON_SECRET (rahasia yang sama
// dengan auto-backup dan backup-email; dibaca pg_cron dari Vault).
//
// Env:
//   RESEND_API_KEY   kosong = DRY RUN (tidak dikirim, tidak ditandai, jadi
//                    kontaknya ikut email pertama sesudah kunci dipasang)
//   LEAD_NOTIFY_TO   default fixmaster.cs@gmail.com
//   MAIL_FROM        default "FixMaster <noreply@fixmaster.app>"
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TZ = 'Asia/Jakarta';
const MAX_PER_EMAIL = 50;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso)) + ' WIB';

/** 6281234567890 → 0812-3456-7890: bentuk yang dibaca orang Indonesia. */
function localPhone(phone: string): string {
  const local = '0' + phone.slice(2);
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}

const SOURCE_LABEL: Record<string, string> = {
  hero: 'gerbang atas landing',
  final: 'gerbang bawah landing',
  demo: 'alamat /demo langsung',
};

interface Lead {
  id: string;
  shop_name: string;
  phone: string;
  source: string;
  locale: string;
  visits: number;
  created_at: string;
}

function waLink(lead: Lead): string {
  const text =
    lead.locale === 'en'
      ? `Hi ${lead.shop_name}, this is FixMaster. Thanks for trying our demo. Anything we can help with?`
      : `Halo ${lead.shop_name}, ini dari FixMaster. Terima kasih sudah mencoba demo kami. Ada yang bisa kami bantu?`;
  return `https://wa.me/${lead.phone}?text=${encodeURIComponent(text)}`;
}

function renderEmail(leads: Lead[]) {
  const n = leads.length;
  const subject =
    n === 1 ? `Kontak demo baru: ${leads[0].shop_name}` : `${n} kontak demo baru`;
  // Email klien tidak mengenal CSS var: warna literal dan gaya inline, sama
  // seperti backup-email. Bahasanya tetap bench: LED, readout mono, seam titik.
  const rows = leads
    .map(
      (l) => `<tr><td style="padding:12px 0;border-top:1px dotted #bdb6aa;">
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:16px;font-weight:700;color:#212327;">${esc(l.shop_name)}</div>
<div style="padding-top:4px;font-family:'JetBrains Mono',Consolas,monospace;font-size:14px;color:#212327;">${esc(localPhone(l.phone))}</div>
<div style="padding-top:4px;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;color:#5d6167;">${esc(fmtTime(l.created_at))} · ${esc(SOURCE_LABEL[l.source] ?? l.source)}${l.visits > 1 ? ` · ${l.visits}× isi` : ''}${l.locale === 'en' ? ' · EN' : ''}</div>
<div style="padding-top:8px;"><a href="${esc(waLink(l))}" style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;font-weight:700;color:#0b6e4f;">Sapa lewat WhatsApp</a></div>
</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="id"><body style="margin:0;padding:0;background:#eceff2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceff2;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbfcfe;border:1px solid #c9ced6;border-radius:12px;border-left:3px solid #cf7c08;">
<tr><td style="padding:22px 26px 6px;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;letter-spacing:0.08em;color:#5d6167;">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#077a52;margin-right:8px;"></span>FIXMASTER · KONTAK DEMO</td></tr>
<tr><td style="padding:8px 26px 4px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#43474d;">
${n === 1 ? 'Satu pengunjung' : `${n} pengunjung`} mengisi nama toko dan nomor WhatsApp untuk membuka demo.</td></tr>
<tr><td style="padding:4px 26px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="padding:14px 26px 22px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5d6167;">
Daftar lengkap dan tanda "sudah dihubungi" ada di fixmaster.app/operator. Kontak dihapus otomatis 90 hari sesudah terakhir diisi.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `FixMaster · ${subject}`,
    '',
    ...leads.map(
      (l) =>
        `${l.shop_name}\n${localPhone(l.phone)} · ${fmtTime(l.created_at)} · ${SOURCE_LABEL[l.source] ?? l.source}\n${waLink(l)}\n`,
    ),
    'Daftar lengkap: https://fixmaster.app/operator',
  ].join('\n');
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const expected = Deno.env.get('BACKUP_CRON_SECRET');
  if (!expected) return json({ error: 'BACKUP_CRON_SECRET belum diset' }, 500);
  if (req.headers.get('x-cron-secret') !== expected) return new Response('forbidden', { status: 403 });

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const to = Deno.env.get('LEAD_NOTIFY_TO') || 'fixmaster.cs@gmail.com';
  const from = Deno.env.get('MAIL_FROM') || 'FixMaster <noreply@fixmaster.app>';

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data, error } = await admin
    .from('demo_leads')
    .select('id, shop_name, phone, source, locale, visits, created_at')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_EMAIL);
  if (error) return json({ error: error.message }, 500);

  const leads = (data ?? []) as Lead[];
  if (leads.length === 0) return json({ sent: 0 });

  if (!apiKey) {
    // Nomor tidak dicatat di log: log fungsi bukan tempat data pribadi.
    console.log(`[lead-notify] DRY RUN: ${leads.length} kontak menunggu, RESEND_API_KEY kosong`);
    return json({ dryRun: true, pending: leads.length });
  }

  const mail = renderEmail(leads);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      // Panggilan ulang untuk kumpulan yang sama (penandaan gagal sesudah
      // email terkirim) tidak menggandakan email.
      'idempotency-key': `lead-${leads[0].id}-${leads[leads.length - 1].id}-${leads.length}`,
    },
    body: JSON.stringify({ from, to: [to], ...mail }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { message?: string }).message ?? 'gagal';
    console.error(`[lead-notify] resend ${res.status}: ${message}`);
    return json({ error: `resend ${res.status}: ${message}` }, 502);
  }

  const { error: markErr } = await admin
    .from('demo_leads')
    .update({ notified_at: new Date().toISOString() })
    .in(
      'id',
      leads.map((l) => l.id),
    );
  if (markErr) {
    console.error(`[lead-notify] tandai: ${markErr.message}`);
    return json({ error: markErr.message, sent: leads.length }, 500);
  }

  return json({ sent: leads.length, providerId: (body as { id?: string }).id ?? null });
});
