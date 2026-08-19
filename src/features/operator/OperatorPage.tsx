/**
 * Dashboard operator FixMaster (vendor-only, LINTAS-TENANT).
 *
 * Hidup DI LUAR AuthGate secara sengaja, bukan preferensi gaya: AuthGate
 * menjalankan getMyMembership() dan melempar akun tanpa membership ke Wizard
 * setup — akun operator justru memang tidak punya membership. Preseden yang
 * sama: /reset-password (publik supaya bisa membangun sesinya sendiri).
 *
 * Karena di luar AuthGate, halaman ini mengurus sendiri: init auth store,
 * form login, dan gerbang admin. TIDAK memakai AppLayout (itu chrome tenant),
 * TIDAK memanggil repository.setScope (adapter single-tenant, tak relevan).
 *
 * Pertahanan sebenarnya ada di server (gate is_platform_admin() di tiap RPC,
 * migration 0045). Pemeriksaan di sini hanya mencegah layar membingungkan.
 *
 * Teks sengaja literal Indonesia, bukan lewat useT(): surface internal
 * vendor-only yang tidak pernah dilihat klien dan tidak akan diterjemahkan.
 * Disetujui sebagai penyimpangan dari AGENTS.md §3 (preseden: BillingTab,
 * FinancePage). Lihat [[Decisions & Bug Fixes]].
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, EmptyState, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  adminListOrgs,
  adminListOperatorActions,
  adminUnpaidGopay,
  applyPayment,
  isPlatformAdmin,
  type AdminOrgRow,
  type AdminUnpaidInvoice,
  type OperatorAction,
} from '@/data/supabase-client';
import { daysUntil, phaseLabel, subscriptionPhase } from '@/lib/business/billing';
import { OperatorActionModal, type ActionMode } from './OperatorActionModal';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import styles from './OperatorPage.module.css';

/** Fase langganan → kelas LED. Sama bahasanya dengan BillingTab. */
const PHASE_LED: Record<string, string> = {
  active: styles.ledOk,
  reminder: styles.ledWarn,
  grace: styles.ledWarn,
  expired: styles.ledCrit,
};

/** Ringkas "kapan terakhir ada aktivitas" jadi sinyal dormant yang cepat dibaca. */
function idleLabel(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: 'belum pernah', stale: true };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return { text: 'hari ini', stale: false };
  if (days === 1) return { text: '1 hari lalu', stale: false };
  return { text: `${days} hari lalu`, stale: days >= 14 };
}

export function OperatorPage() {
  const authStatus = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.init);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const email = useAuthStore((s) => s.email);
  const userId = useAuthStore((s) => s.userId);

  // Status admin disimpan BERSAMA userId pemiliknya, lalu diturunkan — bukan
  // di-reset lewat effect. Kalau akun berganti, `admin` otomatis kembali null,
  // sehingga hasil pemeriksaan akun sebelumnya tidak mungkin terbaca sesaat.
  const [adminFor, setAdminFor] = useState<{ userId: string; ok: boolean } | null>(null);
  const admin = adminFor && adminFor.userId === userId ? adminFor.ok : null;
  const [orgs, setOrgs] = useState<AdminOrgRow[]>([]);
  const [unpaid, setUnpaid] = useState<AdminUnpaidInvoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<AdminUnpaidInvoice | null>(null);
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [actMode, setActMode] = useState<ActionMode | null>(null);
  const [actOrg, setActOrg] = useState<AdminOrgRow | null>(null);

  // AuthGate biasanya yang memanggil ini; route ini di luarnya.
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const reload = useCallback(async () => {
    const [o, u, a] = await Promise.all([
      adminListOrgs(),
      adminUnpaidGopay(),
      adminListOperatorActions(20),
    ]);
    setOrgs(o);
    setUnpaid(u);
    setActions(a);
  }, []);

  // Cek keanggotaan admin, lalu muat data. Fail-closed: error apa pun →
  // bukan admin, jangan pernah menampilkan data karena gagal memeriksa.
  useEffect(() => {
    if (authStatus !== 'signed-in' || !userId) return;
    let alive = true;
    void (async () => {
      const ok = await isPlatformAdmin();
      if (!alive) return;
      setAdminFor({ userId, ok });
      if (!ok) return;
      try {
        await reload();
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : 'Gagal memuat data');
      }
    })();
    return () => {
      alive = false;
    };
  }, [authStatus, userId, reload]);

  const acceptPayment = async (inv: AdminUnpaidInvoice) => {
    setBusy(true);
    try {
      await applyPayment(inv.invoiceId);
      toast.success(`${inv.orgName} — pembayaran diterima, masa aktif diperpanjang`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menerima pembayaran');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (authStatus === 'loading') {
    return (
      <div className={styles.center}>
        <Icon name="circle-notch" className="spin" aria-hidden />
      </div>
    );
  }

  if (authStatus === 'signed-out') {
    return <OperatorLogin onSignIn={signIn} />;
  }

  // Masuk tapi bukan admin. JANGAN redirect ke '/' seperti OwnerRoute —
  // akun tanpa membership justru akan terjebak di Wizard setup tenant.
  if (admin === false) {
    return (
      <div className={styles.center}>
        <Card glass>
          <CardHeader icon={<Icon name="lock" aria-hidden />} title="Akses ditolak" />
          <CardBody>
            <p className={styles.hint}>
              Akun <strong>{email}</strong> bukan admin platform. Halaman ini hanya untuk operator
              FixMaster.
            </p>
            <Button variant="secondary" onClick={() => void signOut()}>
              Keluar
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (admin === null) {
    return (
      <div className={styles.center}>
        <Icon name="circle-notch" className="spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.masthead}>
        <div>
          <span className={styles.eyebrow}>FixMaster · Operator</span>
          <h1 className={styles.title}>Dashboard Klien</h1>
        </div>
        <div className={styles.mastheadRight}>
          <span className={styles.who}>{email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void reload().catch(() => toast.error('Gagal memuat ulang'))}
            iconLeft={<Icon name="arrows-rotate" aria-hidden />}
          >
            Muat ulang
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Keluar
          </Button>
        </div>
      </header>

      {/* ---------- Rekonsiliasi: paling atas karena ini yang butuh tindakan ---------- */}
      <Card glass accent={unpaid.length > 0 ? 'warning' : 'none'}>
        <CardHeader
          icon={<Icon name="qr-code" aria-hidden />}
          title="Rekonsiliasi GoPay"
          action={<span className={styles.count}>{unpaid.length}</span>}
        />
        <CardBody className={unpaid.length ? styles.noPad : undefined}>
          {unpaid.length === 0 ? (
            <EmptyState
              icon={<Icon name="check" aria-hidden />}
              title="Tidak ada invoice menggantung"
              description="Semua pembayaran GoPay sudah terkorelasi otomatis."
            />
          ) : (
            <>
              <p className={styles.warn}>
                Cocokkan nominal dengan riwayat GoPay Merchant sebelum menerima. Menerima tanpa
                uangnya benar-benar masuk = memberi langganan gratis.
              </p>
              <div className={styles.tape}>
                {unpaid.map((inv) => (
                  <div key={inv.invoiceId} className={styles.tapeRow}>
                    <div className={styles.tapeBody}>
                      <span className={styles.tapeOrg}>{inv.orgName}</span>
                      <span className={styles.tapeMeta}>
                        {inv.plan} · {inv.status} · dibuat {fmtDate(inv.openedAt)}
                      </span>
                    </div>
                    <span className={styles.tapeAmount}>{fmtRp(inv.amount)}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setConfirm(inv)}
                    >
                      Terima
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* ---------- Daftar klien ---------- */}
      <Card glass>
        <CardHeader
          icon={<Icon name="buildings" aria-hidden />}
          title="Klien"
          action={<span className={styles.count}>{orgs.length}</span>}
        />
        <CardBody className={orgs.length ? styles.noPad : undefined}>
          {orgs.length === 0 ? (
            <EmptyState title="Belum ada organisasi" />
          ) : (
            <div className={styles.ledger}>
              {orgs.map((o) => {
                const phase = subscriptionPhase(o.expiresAt);
                const days = o.expiresAt ? daysUntil(o.expiresAt) : null;
                const idle = idleLabel(o.lastActivityAt);
                const suspended = o.plan === 'suspended';
                return (
                  <div key={o.orgId} className={styles.clientRow}>
                    <div className={styles.clientTop}>
                      <span
                        className={[styles.led, suspended ? styles.ledCrit : (PHASE_LED[phase] ?? '')].join(' ')}
                        title={suspended ? 'Ditangguhkan' : phaseLabel(phase)}
                      />
                      <span className={styles.orgName}>{o.name}</span>
                      {o.isDemo && <span className={styles.demoTag}>DEMO</span>}
                      <span className={[styles.plan, suspended ? styles.planSuspended : ''].join(' ')}>
                        {o.plan}
                      </span>
                      <span className={[styles.days, days !== null && days <= 7 ? styles.daysWarn : ''].join(' ')}>
                        {days === null ? '∞' : `${days} hari`}
                      </span>
                    </div>

                    {/* Tiga metrik pertama memetakan Scorecard Pilot di
                        docs/roadmap-penjualan.md — aktivasi, retensi, kedalaman. */}
                    <div className={styles.clientMeta}>
                      <span title="Jam dari daftar sampai tiket pertama">
                        aktivasi {o.activationHours === null ? 'belum' : `${o.activationHours} jam`}
                      </span>
                      <span title="Minggu dengan aktivitas dari 3 minggu terakhir">
                        retensi {'●'.repeat(o.weeksActive)}{'○'.repeat(Math.max(0, 3 - o.weeksActive))}
                      </span>
                      <span title="Modul inti yang dipakai: servis, kasir, stok, keuangan">
                        modul {'●'.repeat(o.modulesUsed)}{'○'.repeat(Math.max(0, 4 - o.modulesUsed))}
                      </span>
                      <span>{o.outletCount} outlet · {o.userCount} user · {o.serviceCount} tiket</span>
                      <span className={idle.stale ? styles.idleStale : undefined}>{idle.text}</span>
                      {o.pendingInvoices > 0 && <span>{o.pendingInvoices} invoice pending</span>}
                    </div>

                    {o.note && <p className={styles.noteLine}>{o.note}</p>}

                    <div className={styles.rowActions}>
                      <Button size="sm" variant="ghost" onClick={() => { setActOrg(o); setActMode('note'); }}>
                        Catatan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setActOrg(o); setActMode('promo'); }}>
                        Promo
                      </Button>
                      {suspended ? (
                        <Button size="sm" variant="secondary" onClick={() => { setActOrg(o); setActMode('reactivate'); }}>
                          Aktifkan kembali
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { setActOrg(o); setActMode('suspend'); }}>
                          Suspend
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ---------- Jejak aksi operator ---------- */}
      <Card glass>
        <CardHeader
          icon={<Icon name="clock-rotate-left" aria-hidden />}
          title="Jejak aksi operator"
          action={<span className={styles.count}>{actions.length}</span>}
        />
        <CardBody className={actions.length ? styles.noPad : undefined}>
          {actions.length === 0 ? (
            <EmptyState title="Belum ada aksi tercatat" />
          ) : (
            <div className={styles.trail}>
              {actions.map((a) => (
                <div key={a.id} className={styles.trailRow}>
                  <span className={styles.trailWhen}>{fmtDate(a.actedAt)}</span>
                  <span className={styles.trailBody}>
                    <strong className={styles.trailAction}>{a.action}</strong> {a.orgName}
                    {a.reason && <span className={styles.trailReason}> — {a.reason}</span>}
                  </span>
                  <span className={styles.trailWho}>{a.actorEmail}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Remount per (mode, org) supaya field modal selalu mulai bersih. */}
      <OperatorActionModal
        key={`${actMode ?? 'none'}-${actOrg?.orgId ?? 'none'}`}
        mode={actMode}
        org={actOrg}
        onClose={() => { setActMode(null); setActOrg(null); }}
        onDone={reload}
      />
      <ConfirmDialog
        open={confirm !== null}
        title="Terima pembayaran ini?"
        message={
          confirm
            ? `${confirm.orgName} — ${fmtRp(confirm.amount)}. Pastikan nominal PERSIS ini ada di riwayat GoPay Merchant. Masa aktif akan diperpanjang 1 bulan.`
            : ''
        }
        confirmLabel="Ya, terima"
        onConfirm={() => confirm && void acceptPayment(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/**
 * Login minimal khusus operator. Sengaja tidak memakai AuthPage: komponen itu
 * membawa alur tenant (signup, wizard, PIN) yang tak relevan dan justru
 * menyesatkan di surface ini.
 */
function OperatorLogin({
  onSignIn,
}: {
  onSignIn: (email: string, password: string) => Promise<{ error?: string | null }>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await onSignIn(email.trim(), password);
    setBusy(false);
    if (res.error) toast.error(res.error);
  };

  return (
    <div className={styles.center}>
      <Card glass>
        <CardHeader icon={<Icon name="shield" aria-hidden />} title="Operator FixMaster" />
        <CardBody>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <Button type="submit" loading={busy} fullWidth>
              Masuk
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
