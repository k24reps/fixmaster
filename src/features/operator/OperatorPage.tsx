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
import {
  adminListOrgs,
  adminListOperatorActions,
  isPlatformAdmin,
  type AdminOrgRow,
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

type Tab = 'klien' | 'jejak';

/**
 * Ringkas `detail` jsonb jadi satu kalimat pendek untuk kolom tabel jejak.
 * Sengaja tidak menampilkan JSON mentah — kolom audit yang tak terbaca sama
 * saja dengan tidak ada.
 */
function summarizeDetail(d: Record<string, unknown>): string {
  if (d.promo) return `${String(d.promo)} · ${String(d.hari ?? '?')} hari`;
  if (d.nominal != null) return fmtRp(Number(d.nominal));
  if (d.plan_sesudah)
    return `${String(d.plan_sebelum ?? '?')} → ${String(d.plan_sesudah)}`;
  if (d.plan_sebelum) return `dari ${String(d.plan_sebelum)}`;
  return '—';
}

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
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [actMode, setActMode] = useState<ActionMode | null>(null);
  const [actOrg, setActOrg] = useState<AdminOrgRow | null>(null);
  const [tab, setTab] = useState<Tab>('klien');

  // AuthGate biasanya yang memanggil ini; route ini di luarnya.
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const reload = useCallback(async () => {
    const [o, a] = await Promise.all([adminListOrgs(), adminListOperatorActions(20)]);
    setOrgs(o);
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
              Akun <strong>{email}</strong> bukan admin platform. Halaman ini hanya untuk
              operator FixMaster.
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

  const suspendedCount = orgs.filter((o) => o.plan === 'suspended').length;
  const dueSoon = orgs.filter((o) => {
    const d = o.expiresAt ? daysUntil(o.expiresAt) : null;
    return d !== null && d <= 7 && o.plan !== 'suspended';
  }).length;
  const dormant = orgs.filter((o) => idleLabel(o.lastActivityAt).stale).length;

  const TABS: { id: Tab; label: string; icon: string; count: number }[] = [
    { id: 'klien', label: 'Klien', icon: 'buildings', count: orgs.length },
    {
      id: 'jejak',
      label: 'Jejak aksi',
      icon: 'clock-rotate-left',
      count: actions.length,
    },
  ];

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

      {/* Readout tetap terlihat di SEMUA tab: ini angka yang menentukan apakah
          hari ini ada yang perlu dikerjakan. Menyembunyikannya di dalam tab
          berarti operator harus berpindah-pindah untuk tahu keadaan. */}
      <div className={styles.readout}>
        <div className={styles.readItem}>
          <span className={styles.readLabel}>KLIEN</span>
          <strong className={styles.readValue}>{orgs.length}</strong>
        </div>
        <div className={styles.readItem}>
          <span className={styles.readLabel}>JATUH TEMPO ≤7H</span>
          <strong
            className={[styles.readValue, dueSoon > 0 ? styles.readWarn : ''].join(' ')}
          >
            {dueSoon}
          </strong>
        </div>
        <div className={styles.readItem}>
          <span className={styles.readLabel}>DORMANT</span>
          <strong
            className={[styles.readValue, dormant > 0 ? styles.readWarn : ''].join(' ')}
          >
            {dormant}
          </strong>
        </div>
        <div className={styles.readItem}>
          <span className={styles.readLabel}>DITANGGUHKAN</span>
          <strong
            className={[styles.readValue, suspendedCount > 0 ? styles.readCrit : ''].join(
              ' ',
            )}
          >
            {suspendedCount}
          </strong>
        </div>
        <div className={styles.readItem}>
          <span className={styles.readLabel}>MODE TAGIHAN</span>
          <strong className={styles.readMode}>WA MANUAL</strong>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={[styles.tab, tab === t.id ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} aria-hidden /> {t.label}
            <span className={styles.tabCount}>{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'klien' && (
        <Card glass>
          <CardBody className={orgs.length ? styles.noPad : undefined}>
            {orgs.length === 0 ? (
              <EmptyState title="Belum ada organisasi" />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Organisasi</th>
                      <th>Paket</th>
                      <th className={styles.num}>Sisa</th>
                      <th
                        className={styles.num}
                        title="Jam dari daftar sampai tiket pertama"
                      >
                        Aktivasi
                      </th>
                      <th title="Minggu dengan aktivitas dari 3 minggu terakhir">
                        Retensi
                      </th>
                      <th title="Modul inti dipakai: servis, kasir, stok, keuangan">
                        Modul
                      </th>
                      <th className={styles.num}>Outlet</th>
                      <th className={styles.num}>User</th>
                      <th className={styles.num}>Tiket</th>
                      <th>Aktivitas</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((o) => {
                      const phase = subscriptionPhase(o.expiresAt);
                      const days = o.expiresAt ? daysUntil(o.expiresAt) : null;
                      const idle = idleLabel(o.lastActivityAt);
                      const suspended = o.plan === 'suspended';
                      return (
                        <tr key={o.orgId}>
                          <td>
                            <span className={styles.orgCell}>
                              <span
                                className={[
                                  styles.led,
                                  suspended ? styles.ledCrit : (PHASE_LED[phase] ?? ''),
                                ].join(' ')}
                                title={suspended ? 'Ditangguhkan' : phaseLabel(phase)}
                              />
                              <span className={styles.orgName}>{o.name}</span>
                              {o.isDemo && <span className={styles.demoTag}>DEMO</span>}
                            </span>
                            {o.note && (
                              <span className={styles.noteInline}>{o.note}</span>
                            )}
                          </td>
                          <td>
                            <span
                              className={[
                                styles.plan,
                                suspended ? styles.planSuspended : '',
                              ].join(' ')}
                            >
                              {o.plan}
                            </span>
                          </td>
                          <td
                            className={[
                              styles.num,
                              days !== null && days <= 7 ? styles.daysWarn : '',
                            ].join(' ')}
                          >
                            {days === null ? '∞' : `${days}h`}
                          </td>
                          <td className={styles.num}>
                            {o.activationHours === null ? '—' : `${o.activationHours}j`}
                          </td>
                          <td className={styles.pips}>
                            {'●'.repeat(o.weeksActive)}
                            {'○'.repeat(Math.max(0, 3 - o.weeksActive))}
                          </td>
                          <td className={styles.pips}>
                            {'●'.repeat(o.modulesUsed)}
                            {'○'.repeat(Math.max(0, 4 - o.modulesUsed))}
                          </td>
                          <td className={styles.num}>{o.outletCount}</td>
                          <td className={styles.num}>{o.userCount}</td>
                          <td className={styles.num}>{o.serviceCount}</td>
                          <td className={idle.stale ? styles.idleStale : styles.idle}>
                            {idle.text}
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setActOrg(o);
                                  setActMode('note');
                                }}
                              >
                                Catatan
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setActOrg(o);
                                  setActMode('payment');
                                }}
                              >
                                Konfirmasi bayar
                              </Button>
                              {suspended ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setActOrg(o);
                                    setActMode('reactivate');
                                  }}
                                >
                                  Aktifkan
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setActOrg(o);
                                    setActMode('suspend');
                                  }}
                                >
                                  Suspend
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'jejak' && (
        <Card glass>
          <CardBody className={actions.length ? styles.noPad : undefined}>
            {actions.length === 0 ? (
              <EmptyState title="Belum ada aksi tercatat" />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Aksi</th>
                      <th>Organisasi</th>
                      <th>Alasan</th>
                      <th>Rincian</th>
                      <th>Operator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((a) => (
                      <tr key={a.id}>
                        <td className={styles.idle}>{fmtDate(a.actedAt)}</td>
                        <td>
                          <span className={styles.trailAction}>{a.action}</span>
                        </td>
                        <td className={styles.orgName}>{a.orgName}</td>
                        <td className={styles.reasonCell}>{a.reason || '—'}</td>
                        <td className={styles.detailCell}>{summarizeDetail(a.detail)}</td>
                        <td className={styles.idle}>{a.actorEmail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Remount per (mode, org) supaya field modal selalu mulai bersih. */}
      <OperatorActionModal
        key={`${actMode ?? 'none'}-${actOrg?.orgId ?? 'none'}`}
        mode={actMode}
        org={actOrg}
        onClose={() => {
          setActMode(null);
          setActOrg(null);
        }}
        onDone={reload}
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
        <CardHeader
          icon={<Icon name="shield" aria-hidden />}
          title="Operator FixMaster"
        />
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
