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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Icon,
  Input,
  Mascot,
} from '@/components/ui';
import {
  adminListOrgs,
  adminListOperatorActions,
  isPlatformAdmin,
  type AdminOrgRow,
  type OperatorAction,
} from '@/data/supabase-client';
import { daysUntil, phaseLabel, subscriptionPhase } from '@/lib/business/billing';
import { toWaNumber } from '@/lib/business/notify';
import {
  accessRemainingLabel,
  matchesOrganization,
  operatorPlanLabel,
  organizationNumber,
} from '@/lib/business/operator';
import { OperatorActionModal, type ActionMode } from './OperatorActionModal';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateOf } from '@/lib/time';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
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
type OrgFilter = 'all' | 'attention' | 'due' | 'expired' | 'suspended';

/**
 * Ringkas `detail` jsonb jadi satu kalimat pendek untuk kolom tabel jejak.
 * Sengaja tidak menampilkan JSON mentah — kolom audit yang tak terbaca sama
 * saja dengan tidak ada.
 */
function summarizeDetail(d: Record<string, unknown>): string {
  if (d.promo) return `${String(d.promo)} · ${String(d.hari ?? '?')} hari`;
  if (d.nominal != null) {
    const plan = d.plan_sesudah ? operatorPlanLabel(String(d.plan_sesudah)) : '';
    const months = d.bulan ? `${String(d.bulan)} bulan` : '';
    return [fmtRp(Number(d.nominal)), plan, months].filter(Boolean).join(' · ');
  }
  if (d.org_number) return String(d.org_number);
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

function matchesAction(action: OperatorAction, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('id-ID');
  if (!needle) return true;
  return [
    action.action,
    action.orgName,
    action.actorEmail,
    action.reason,
    summarizeDetail(action.detail),
  ].some((value) => value.toLocaleLowerCase('id-ID').includes(needle));
}

function matchesFilter(organization: AdminOrgRow, filter: OrgFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'suspended') return organization.plan === 'suspended';
  if (organization.plan === 'suspended') return filter === 'attention';
  const days = organization.expiresAt ? daysUntil(organization.expiresAt) : null;
  if (filter === 'expired') return days !== null && days < 0;
  if (filter === 'due') return days !== null && days >= 0 && days <= 7;
  return days !== null && days <= 7;
}

export function OperatorPage() {
  const authStatus = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.init);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const email = useAuthStore((s) => s.email);
  const userId = useAuthStore((s) => s.userId);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<OrgFilter>('all');
  const [actionQuery, setActionQuery] = useState('');
  const [actionLimit, setActionLimit] = useState(50);
  const [loadError, setLoadError] = useState('');
  const [reloading, setReloading] = useState(false);
  const visibleOrgs = useMemo(
    () =>
      orgs.filter(
        (organization) =>
          matchesFilter(organization, filter) && matchesOrganization(organization, query),
      ),
    [filter, orgs, query],
  );
  const visibleActions = useMemo(
    () => actions.filter((action) => matchesAction(action, actionQuery)),
    [actionQuery, actions],
  );

  // AuthGate biasanya yang memanggil ini; route ini di luarnya.
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const reload = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([
        adminListOrgs(),
        adminListOperatorActions(actionLimit),
      ]);
      setOrgs(o);
      setActions(a);
      setLoadError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memuat data operator';
      setLoadError(message);
      throw error;
    }
  }, [actionLimit]);

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
      <div className={styles.center} role="status" aria-label="Memuat sesi operator">
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
      <div className={styles.center} role="status" aria-label="Memeriksa akses operator">
        <Icon name="circle-notch" className="spin" aria-hidden />
      </div>
    );
  }

  const suspendedCount = orgs.filter((o) => o.plan === 'suspended').length;
  const dueSoon = orgs.filter((o) => {
    const d = o.expiresAt ? daysUntil(o.expiresAt) : null;
    return d !== null && d >= 0 && d <= 7 && o.plan !== 'suspended';
  }).length;
  const expiredCount = orgs.filter((o) => {
    const d = o.expiresAt ? daysUntil(o.expiresAt) : null;
    return d !== null && d < 0 && o.plan !== 'suspended';
  }).length;
  const attentionCount = dueSoon + expiredCount + suspendedCount;
  const openAction = (organization: AdminOrgRow, mode: ActionMode) => {
    setActOrg(organization);
    setActMode(mode);
  };

  const manualReload = async () => {
    setReloading(true);
    try {
      await reload();
      toast.success('Data operator diperbarui');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memuat ulang');
    } finally {
      setReloading(false);
    }
  };

  const loadMoreActions = async () => {
    const nextLimit = Math.min(actionLimit + 50, 200);
    setReloading(true);
    try {
      const next = await adminListOperatorActions(nextLimit);
      setActions(next);
      setActionLimit(nextLimit);
      toast.success(`${next.length} aktivitas terbaru dimuat`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memuat jejak aksi');
    } finally {
      setReloading(false);
    }
  };

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
        <div className={styles.mastheadIdentity}>
          <span className={styles.mastheadMark} aria-hidden>
            <Mascot variant="face" size={50} animated={false} />
          </span>
          <div>
            <span className={styles.eyebrow}>FixMaster · Bench Console</span>
            <h1 className={styles.title}>Konsol Operator</h1>
            <p className={styles.subtitle}>Kelola akses dan masa aktif organisasi.</p>
          </div>
        </div>
        <div className={styles.mastheadRight}>
          <span className={styles.operatorState}>
            <span className={[styles.led, styles.ledOk].join(' ')} aria-hidden />
            <span className={styles.who}>{email}</span>
          </span>
          <span className={styles.billingMode}>
            <span className={[styles.led, styles.ledWarn].join(' ')} aria-hidden />
            TAGIHAN · WA MANUAL
          </span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Gunakan tema terang' : 'Gunakan tema gelap'}
            title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void manualReload()}
            loading={reloading}
            iconLeft={<Icon name="arrows-rotate" aria-hidden />}
          >
            Muat ulang
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Keluar
          </Button>
        </div>
      </header>

      {loadError && (
        <div className={styles.loadError} role="alert">
          <span><Icon name="warning" aria-hidden /> Data operator gagal dimuat: {loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => void manualReload()} loading={reloading}>
            Coba lagi
          </Button>
        </div>
      )}

      {/* Readout tetap terlihat di SEMUA tab: ini angka yang menentukan apakah
          hari ini ada yang perlu dikerjakan. Menyembunyikannya di dalam tab
          berarti operator harus berpindah-pindah untuk tahu keadaan. */}
      <div className={styles.readout}>
        <button
          type="button"
          className={[styles.readItem, filter === 'all' ? styles.readItemActive : ''].join(' ')}
          aria-pressed={filter === 'all'}
          onClick={() => { setFilter('all'); setTab('klien'); }}
        >
          <span className={styles.readLabel}>KLIEN</span>
          <strong className={styles.readValue}>{orgs.length}</strong>
        </button>
        <button
          type="button"
          className={[styles.readItem, filter === 'attention' ? styles.readItemActive : ''].join(' ')}
          aria-pressed={filter === 'attention'}
          onClick={() => { setFilter('attention'); setTab('klien'); }}
        >
          <span className={styles.readLabel}>PERLU TINDAKAN</span>
          <strong
            className={[styles.readValue, attentionCount > 0 ? styles.readCrit : ''].join(' ')}
          >
            {attentionCount}
          </strong>
        </button>
        <button
          type="button"
          className={[styles.readItem, filter === 'due' ? styles.readItemActive : ''].join(' ')}
          aria-pressed={filter === 'due'}
          onClick={() => { setFilter('due'); setTab('klien'); }}
        >
          <span className={styles.readLabel}>JATUH TEMPO ≤7H</span>
          <strong
            className={[styles.readValue, dueSoon > 0 ? styles.readWarn : ''].join(' ')}
          >
            {dueSoon}
          </strong>
        </button>
        <button
          type="button"
          className={[styles.readItem, filter === 'expired' ? styles.readItemActive : ''].join(' ')}
          aria-pressed={filter === 'expired'}
          onClick={() => { setFilter('expired'); setTab('klien'); }}
        >
          <span className={styles.readLabel}>KEDALUWARSA</span>
          <strong className={[styles.readValue, expiredCount > 0 ? styles.readCrit : ''].join(' ')}>
            {expiredCount}
          </strong>
        </button>
        <button
          type="button"
          className={[styles.readItem, filter === 'suspended' ? styles.readItemActive : ''].join(' ')}
          aria-pressed={filter === 'suspended'}
          onClick={() => { setFilter('suspended'); setTab('klien'); }}
        >
          <span className={styles.readLabel}>DITANGGUHKAN</span>
          <strong
            className={[styles.readValue, suspendedCount > 0 ? styles.readCrit : ''].join(
              ' ',
            )}
          >
            {suspendedCount}
          </strong>
        </button>
      </div>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`operator-tab-${t.id}`}
            type="button"
            role="tab"
            aria-controls={`operator-panel-${t.id}`}
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
        <section
          id="operator-panel-klien"
          role="tabpanel"
          aria-labelledby="operator-tab-klien"
          className={styles.panel}
        >
          <div className={styles.clientToolbar}>
            <label className={styles.searchBox}>
              <Icon name="magnifying-glass" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama, nomor organisasi, atau telepon"
                aria-label="Cari nama, nomor organisasi, atau telepon"
                autoComplete="off"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')}>
                  Bersihkan
                </button>
              )}
            </label>
            <span className={styles.resultCount} aria-live="polite">
              {visibleOrgs.length} dari {orgs.length} organisasi
              {filter !== 'all' ? ' · filter aktif' : ''}
            </span>
          </div>

          <Card glass>
            <CardBody className={visibleOrgs.length ? styles.noPad : undefined}>
              {visibleOrgs.length === 0 ? (
                <EmptyState
                  title={
                    orgs.length === 0
                      ? 'Belum ada organisasi'
                      : 'Organisasi tidak ditemukan'
                  }
                  description={
                    orgs.length === 0
                      ? 'Organisasi yang mendaftar akan muncul di konsol ini.'
                      : 'Coba nama lain, nomor ORG, UUID lengkap, atau nomor telepon toko.'
                  }
                />
              ) : (
                <>
                  <div className={[styles.tableWrap, styles.tableOnly].join(' ')}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Organisasi</th>
                          <th>Terdaftar</th>
                          <th>Paket</th>
                          <th>Masa aktif</th>
                          <th>Berakhir</th>
                          <th className={styles.num}>Outlet</th>
                          <th className={styles.num}>User</th>
                          <th className={styles.num}>Tiket</th>
                          <th>Aktivitas</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleOrgs.map((o) => {
                          const phase = subscriptionPhase(o.expiresAt);
                          const days = o.expiresAt ? daysUntil(o.expiresAt) : null;
                          const idle = idleLabel(o.lastActivityAt);
                          const suspended = o.plan === 'suspended';
                          return (
                            <tr key={o.orgId}>
                              <td>
                                <span className={styles.orgNumber}>
                                  {organizationNumber(o.orgId)}
                                </span>
                                <span className={styles.orgCell}>
                                  <span
                                    className={[
                                      styles.led,
                                      suspended
                                        ? styles.ledCrit
                                        : (PHASE_LED[phase] ?? ''),
                                    ].join(' ')}
                                    title={suspended ? 'Ditangguhkan' : phaseLabel(phase)}
                                  />
                                  <span className={styles.orgName}>{o.name}</span>
                                  {o.isDemo && (
                                    <span className={styles.demoTag}>DEMO</span>
                                  )}
                                </span>
                                <ShopPhone phone={o.phone} />
                                {o.note && (
                                  <span className={styles.noteInline}>{o.note}</span>
                                )}
                              </td>
                              <td className={styles.dateCell}>
                                {fmtDate(localDateOf(o.registeredAt))}
                              </td>
                              <td>
                                <span
                                  className={[
                                    styles.plan,
                                    suspended ? styles.planSuspended : '',
                                  ].join(' ')}
                                >
                                  {operatorPlanLabel(o.plan)}
                                </span>
                              </td>
                              <td
                                className={[
                                  styles.dateCell,
                                  days !== null && days <= 7 ? styles.daysWarn : '',
                                ].join(' ')}
                              >
                                {accessRemainingLabel(days)}
                              </td>
                              <td className={styles.dateCell}>
                                {o.expiresAt ? fmtDate(localDateOf(o.expiresAt)) : '—'}
                              </td>
                              <td className={styles.num}>{o.outletCount}</td>
                              <td className={styles.num}>{o.userCount}</td>
                              <td className={styles.num}>{o.serviceCount}</td>
                              <td className={idle.stale ? styles.idleStale : styles.idle}>
                                {idle.text}
                              </td>
                              <td>
                                <OrganizationActions
                                  organization={o}
                                  onAction={openAction}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.clientCards}>
                    {visibleOrgs.map((o) => (
                      <OrganizationCard
                        key={o.orgId}
                        organization={o}
                        onAction={openAction}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {tab === 'jejak' && (
        <section
          id="operator-panel-jejak"
          role="tabpanel"
          aria-labelledby="operator-tab-jejak"
          className={styles.panel}
        >
          <div className={styles.clientToolbar}>
            <label className={styles.searchBox}>
              <Icon name="magnifying-glass" aria-hidden />
              <input
                type="search"
                value={actionQuery}
                onChange={(event) => setActionQuery(event.target.value)}
                placeholder="Cari organisasi, aksi, alasan, atau operator"
                aria-label="Cari jejak aksi"
                autoComplete="off"
              />
              {actionQuery && <button type="button" onClick={() => setActionQuery('')}>Bersihkan</button>}
            </label>
            <span className={styles.resultCount} aria-live="polite">
              {visibleActions.length} dari {actions.length} aktivitas terbaru
            </span>
          </div>
          <Card glass>
            <CardBody className={visibleActions.length ? styles.noPad : undefined}>
              {visibleActions.length === 0 ? (
                <EmptyState
                  title={actions.length === 0 ? 'Belum ada aksi tercatat' : 'Jejak aksi tidak ditemukan'}
                  description={actions.length === 0 ? undefined : 'Coba kata kunci lain atau bersihkan pencarian.'}
                />
              ) : (
                <>
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
                        {visibleActions.map((a) => (
                          <tr key={a.id}>
                            <td className={styles.idle}>{fmtDate(localDateOf(a.actedAt))}</td>
                            <td><span className={styles.trailAction}>{a.action}</span></td>
                            <td className={styles.orgName}>{a.orgName}</td>
                            <td className={styles.reasonCell}>{a.reason || '—'}</td>
                            <td className={styles.detailCell}>{summarizeDetail(a.detail)}</td>
                            <td className={styles.idle}>{a.actorEmail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {actions.length >= actionLimit && actionLimit < 200 && (
                    <div className={styles.loadMore}>
                      <Button variant="secondary" loading={reloading} onClick={() => void loadMoreActions()}>
                        Muat 50 aktivitas berikutnya
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </section>
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

function OrganizationActions({
  organization,
  onAction,
}: {
  organization: AdminOrgRow;
  onAction: (organization: AdminOrgRow, mode: ActionMode) => void;
}) {
  const suspended = organization.plan === 'suspended';
  return (
    <div className={styles.rowActions}>
      <Button
        size="sm"
        variant="primary"
        onClick={() => onAction(organization, 'payment')}
      >
        Konfirmasi bayar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAction(organization, 'note')}>
        Catatan
      </Button>
      {!suspended && (
        <Button size="sm" variant="ghost" onClick={() => onAction(organization, 'suspend')}>
          Tangguhkan
        </Button>
      )}
      <details className={styles.moreActions}>
        <summary>Lainnya</summary>
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => onAction(organization, 'delete')}
        >
          <Icon name="trash" aria-hidden /> Hapus organisasi
        </button>
      </details>
    </div>
  );
}

/** Nomor toko dari Profil Usaha; langsung membuka chat WhatsApp vendor → klien. */
function ShopPhone({ phone }: { phone: string }) {
  if (!phone.trim()) return null;
  return (
    <a
      className={styles.shopPhone}
      href={`https://wa.me/${toWaNumber(phone)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat WhatsApp toko ini"
    >
      <span className={styles.shopPhoneTag}>WA</span>
      {phone}
    </a>
  );
}

function OrganizationCard({
  organization: o,
  onAction,
}: {
  organization: AdminOrgRow;
  onAction: (organization: AdminOrgRow, mode: ActionMode) => void;
}) {
  const phase = subscriptionPhase(o.expiresAt);
  const days = o.expiresAt ? daysUntil(o.expiresAt) : null;
  const idle = idleLabel(o.lastActivityAt);
  const suspended = o.plan === 'suspended';

  return (
    <article className={styles.clientCard}>
      <header className={styles.clientCardHead}>
        <div>
          <span className={styles.orgNumber}>{organizationNumber(o.orgId)}</span>
          <h2 className={styles.clientCardTitle}>
            <span
              className={[
                styles.led,
                suspended ? styles.ledCrit : (PHASE_LED[phase] ?? ''),
              ].join(' ')}
              title={suspended ? 'Ditangguhkan' : phaseLabel(phase)}
            />
            {o.name}
            {o.isDemo && <span className={styles.demoTag}>DEMO</span>}
          </h2>
          <ShopPhone phone={o.phone} />
        </div>
        <span className={[styles.plan, suspended ? styles.planSuspended : ''].join(' ')}>
          {operatorPlanLabel(o.plan)}
        </span>
      </header>

      <dl className={styles.clientFacts}>
        <div>
          <dt>Terdaftar</dt>
          <dd>{fmtDate(localDateOf(o.registeredAt))}</dd>
        </div>
        <div>
          <dt>Sisa masa aktif</dt>
          <dd className={days !== null && days <= 7 ? styles.daysWarn : ''}>
            {accessRemainingLabel(days)}
          </dd>
        </div>
        <div>
          <dt>Berakhir</dt>
          <dd>{o.expiresAt ? fmtDate(localDateOf(o.expiresAt)) : '—'}</dd>
        </div>
        <div>
          <dt>Aktivitas</dt>
          <dd className={idle.stale ? styles.idleStale : ''}>{idle.text}</dd>
        </div>
        <div>
          <dt>Outlet</dt>
          <dd>{o.outletCount}</dd>
        </div>
        <div>
          <dt>Pengguna / tiket</dt>
          <dd>
            {o.userCount} / {o.serviceCount}
          </dd>
        </div>
      </dl>

      {o.note && <p className={styles.cardNote}>{o.note}</p>}
      <OrganizationActions organization={o} onAction={onAction} />
    </article>
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
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await onSignIn(email.trim(), password);
      if (res.error) setError(res.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <section className={styles.loginShell} aria-labelledby="operator-login-title">
        <aside className={styles.loginIdentity}>
          <div className={styles.loginBrand}>
            <img src="/logo.svg" width="44" height="44" alt="" />
            <span>
              <strong>FixMaster</strong>
              <small>BENCH OS</small>
            </span>
          </div>

          <div className={styles.loginVolt} aria-hidden>
            <Mascot variant="full" size={148} animated />
            <span className={styles.voltLine} />
          </div>

          <div className={styles.loginIdentityCopy}>
            <span className={styles.consoleLabel}>VOLT // SECURE CHANNEL</span>
            <h2>Kendali klien hanya untuk operator.</h2>
            <p>
              Periksa masa aktif, konfirmasi pembayaran, dan tindak organisasi dari satu
              konsol yang tercatat.
            </p>
          </div>

          <ul className={styles.loginSignals}>
            <li>
              <span className={[styles.led, styles.ledOk].join(' ')} />
              Akses lintas organisasi<span>DILINDUNGI</span>
            </li>
            <li>
              <span className={[styles.led, styles.ledOk].join(' ')} />
              Jejak tindakan<span>AKTIF</span>
            </li>
            <li>
              <span className={[styles.led, styles.ledWarn].join(' ')} />
              Pembayaran<span>WA MANUAL</span>
            </li>
          </ul>
        </aside>

        <main className={styles.loginPanel}>
          <div className={styles.loginPanelTop}>
            <Link to="/" className={styles.backLink}>
              <Icon name="arrow-left" aria-hidden /> Beranda
            </Link>
            <button
              type="button"
              className={styles.iconButton}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Gunakan tema terang' : 'Gunakan tema gelap'}
              title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} aria-hidden />
            </button>
          </div>

          <div className={styles.loginHeading}>
            <span className={styles.consoleLabel}>OPERATOR TERMINAL // 01</span>
            <h1 id="operator-login-title">Masuk ke konsol operator</h1>
            <p>Gunakan akun platform admin FixMaster, bukan akun pemilik organisasi.</p>
          </div>

          <form className={styles.loginForm} onSubmit={submit}>
            <Input
              noAutoCap
              type="email"
              name="operator-email"
              label="Email operator"
              placeholder="operator@fixmaster.app"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              iconLeft={<Icon name="envelope" aria-hidden />}
            />
            <Input
              noAutoCap
              revealable
              type="password"
              name="operator-password"
              label="Password"
              placeholder="Masukkan password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              revealLabels={{ show: 'Tampilkan password', hide: 'Sembunyikan password' }}
            />

            {error && (
              <p className={styles.loginError} role="alert">
                <Icon name="warning" aria-hidden /> {error}
              </p>
            )}

            <Button
              type="submit"
              loading={busy}
              fullWidth
              iconLeft={<Icon name="shield" aria-hidden />}
            >
              Masuk aman
            </Button>
          </form>

          <p className={styles.loginFoot}>
            Tidak memiliki akses? Hubungi pemilik sistem untuk mendaftarkan akun sebagai
            operator FixMaster.
          </p>
        </main>
      </section>
    </div>
  );
}
