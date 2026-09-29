import { useState, useRef, useEffect, useCallback } from 'react';
import { useFeature } from '@/hooks/useFeature';
import { useSearchParams } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Badge,
  Select,
  EmptyState,
  Icon,
  ProBadge,
  ProNotice,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { getCurrentPosition } from '@/lib/geo';
import { newId } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import {
  PLANS,
  BILLING_TERMS,
  BILLING_TERM_IDS,
  monthlyRateForTerm,
  totalForTerm,
  savingForTerm,
  type BillingTerm,
  roleAllows,
  PAID_TIERS,
  withinOutletQuota,
  outletTierFor,
  withinUserQuota,
  withinWalletQuota,
  priceForOutlets,
} from '@/config/plans';
import {
  subscriptionPhase,
  daysUntil,
  phaseLabel,
  GRACE_DAYS,
  manualPaymentWhatsAppLink,
} from '@/lib/business/billing';
import { FIXMASTER_WHATSAPP } from '@/config/contact';
import {
  getComplaintTemplates,
  setComplaintTemplates,
  getAccessoryTemplates,
  setAccessoryTemplates,
  getWarrantyServiceDays,
  getWarrantyPartsDays,
  setWarrantyDays,
  getWarrantyPresets,
  setWarrantyPresets,
  getWaTemplateOverrides,
  setWaTemplateOverrides,
  getCategories,
  setCategories,
  seedCategoriesFromLocal,
  setMobileNavigation as saveMobileNavigation,
  PUBLIC_NOTE_MAX,
  setPublicNote,
} from '@/config/orgConfig';
import { NAV_ITEMS } from '@/config/navigation';
import {
  DEFAULT_MOBILE_NAV_PATHS,
  sanitizeMobileNavPaths,
} from '@/lib/business/navigation';
import { translate, useT } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import {
  DEFAULT_WA_TEMPLATES,
  WA_TEMPLATE_LABELS,
  WA_TEMPLATE_VARS,
  type WaTemplateKey,
} from '@/lib/business/notify';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import { isValidInviteEmail, canChangeRole, canDeactivate } from '@/lib/business/team';
import { normalizePhone } from '@/lib/business/customers';
import { createTransfer } from '@/features/finance/transferActions';
import { createFinanceEntry } from '@/data/financeEntry';
import { localDateStr } from '@/lib/time';
import { logActivity } from '@/lib/activity';
import { useSessionStore } from '@/stores/session';
import {
  isSupabaseConfigured,
  inviteMember,
  listPendingInvites,
  revokeInvite,
  setMemberRole,
  setMemberOutlets,
  getMemberOutlets,
  getOrgMemberOutlets,
  deactivateMember,
  deleteMember,
  listInvoices,
  subscribeOrgBilling,
  deleteAccountCredential,
  type PendingInvite,
  type Invoice,
} from '@/data/supabase-client';
import type { Wallet, Outlet, Role, PlanType, OutletRent } from '@/data/types';
import { DATASETS, downloadCsv } from './exportDatasets';
import { uploadOrgLogo, removeOrgLogo } from '@/data/storage';
import { useAuthStore } from '@/stores/auth';
import { createBackup, downloadBackup, restoreBackup } from './backupRestore';
import { useBackupStore } from '@/stores/backup';
import {
  listCloudBackups,
  readCloudBackup,
  latestBackupRun,
  latestBackupEmail,
  type CloudBackup,
  type BackupRun,
  type BackupEmailRun,
} from '@/data/cloudBackup';
import {
  backupEmailStatus,
  countRecords,
  parseBackup,
  type BackupFrequency,
} from '@/lib/business/backup';
import {
  saveServiceColumns,
  getTarget,
  setMonthlyTarget,
  getRent,
  setRent,
  getLastBackupAt,
  setLastBackupAt,
  setBackupEmail,
} from '@/config/orgConfig';
import {
  SERVICE_COLUMNS,
  resolveServiceColumns,
  type ServiceColumnId,
} from '@/lib/business/serviceColumns';
import styles from './SettingsPage.module.css';
import { interpolate } from '@/lib/business/notify';
import type { TranslationKey } from '@/i18n';

/**
 * Downscale a picked image to a PNG Blob (max 256 px) without using
 * fetch(data:URL) — that call is blocked by CSP connect-src in production.
 * Uses canvas.toBlob() directly instead.
 */
async function fileToLogoBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  // Logo yang sangat memanjang dikecilkan jadi seutas garis di nota dan di
  // sidebar — ukurannya lolos (≤500KB), hasilnya yang tidak terbaca.
  const ratio = Math.max(img.width, img.height) / Math.max(1, Math.min(img.width, img.height));
  if (ratio > 4) {
    // Di luar komponen: tak ada hook, jadi bahasa dibaca langsung dari store.
    throw new Error(translate(useSettingsStore.getState().language, 'settingsPage.logoRatio'));
  }
  const MAX = 256;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Fallback: if canvas context unavailable, upload original file as-is.
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    ),
  );
}

type Tab =
  | 'usaha'
  | 'operasional'
  | 'tim'
  | 'keuangan'
  | 'outlet'
  | 'langganan'
  | 'navigasi'
  | 'sistem';

/**
 * Batas atas radius geofence. Di atas ini "pagar"-nya tidak menjaga apa pun —
 * ia hanya membuat absensi terlihat terjaga sambil meloloskan siapa saja.
 */
const MAX_GEOFENCE_M = 5000;

const TAB_IDS: Tab[] = [
  'usaha',
  'operasional',
  'tim',
  'keuangan',
  'outlet',
  'langganan',
  'navigasi',
  'sistem',
];

export function SettingsPage() {
  const me = useSessionStore((s) => s.currentEmployee);
  const resetWorkspace = useSessionStore((s) => s.resetWorkspace);
  const isOwner = me ? roleAllows(me.role, '*') : false;
  const t = useT();

  const { data: wallets } = useCollection('wallets');
  const { data: outlets } = useCollection('outlets');
  const { data: employees } = useCollection('employees');

  // ?tab= membuat kartu terkunci (dan kanal terkunci di sidebar) bisa
  // menautkan langsung ke tab yang relevan. Nilai tak dikenal jatuh ke
  // Usaha; tab yang tidak boleh dilihat peran ini disaring oleh visibleTabs.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(
    requestedTab && TAB_IDS.includes(requestedTab) ? requestedTab : 'usaha',
  );
  const [confirmReset, setConfirmReset] = useState(false);

  const TABS: {
    id: Tab;
    label: string;
    icon: string;
    ownerOnly?: boolean;
    cloudOnly?: boolean;
  }[] = [
    { id: 'usaha', label: t('settingsPage.tabBusiness'), icon: 'fa-store' },
    { id: 'operasional', label: t('settingsPage.tabOps'), icon: 'fa-sliders' },
    { id: 'tim', label: t('settingsPage.tabTeam'), icon: 'fa-users', ownerOnly: true },
    { id: 'keuangan', label: t('settingsPage.tabWallet'), icon: 'fa-wallet', ownerOnly: true },
    { id: 'outlet', label: t('settingsPage.tabOutlet'), icon: 'fa-shop', ownerOnly: true },
    {
      id: 'langganan',
      label: t('settingsPage.tabBilling'),
      icon: 'fa-crown',
      ownerOnly: true,
      cloudOnly: true,
    },
    {
      id: 'navigasi',
      label: t('settings.mobileNav.tab'),
      icon: 'fa-bars',
      ownerOnly: true,
    },
    { id: 'sistem', label: t('settingsPage.tabSystem'), icon: 'fa-gear' },
  ];
  const visibleTabs = TABS.filter(
    (item) => (!item.ownerOnly || isOwner) && (!item.cloudOnly || isSupabaseConfigured),
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            className={[styles.tab, tab === item.id ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} aria-hidden /> {item.label}
          </button>
        ))}
      </div>

      {tab === 'usaha' && (
        <>
          <BusinessTab />
          {isOwner && <MonthlyTargetCard />}
          {isOwner && <RentCard />}
        </>
      )}
      {tab === 'operasional' && (
        <>
          <ServiceTemplatesCard />
          <DeviceCategoriesCard />
          <ServiceColumnsCard />
          <WarrantyCard />
          <WhatsAppTemplatesCard />
          <PublicNoteCard />
        </>
      )}
      {tab === 'tim' && isOwner && <TeamTab employees={employees} outlets={outlets} />}
      {tab === 'keuangan' && isOwner && <WalletTab wallets={wallets} outlets={outlets} />}
      {tab === 'outlet' && isOwner && <OutletTab outlets={outlets} />}
      {tab === 'langganan' && isOwner && isSupabaseConfigured && (
        <BillingTab outlets={outlets} />
      )}
      {tab === 'navigasi' && isOwner && <MobileNavigationCard />}
      {tab === 'sistem' && (
        <SystemTab
          onReset={() => {
            if (
              demoGuard(
                t('settingsPage.resetDemo'),
              )
            )
              return;
            setConfirmReset(true);
          }}
          isOwner={isOwner}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        title={t('settingsPage.resetSeluruhData')}
        message={
          isSupabaseConfigured
            ? t('settingsPage.resetCloudMsg')
            : t('settingsPage.resetLocalMsg')
        }
        confirmLabel={t('settingsPage.yaResetSemua')}
        danger
        onConfirm={async () => {
          try {
            await resetWorkspace();
            toast.success(t('settingsPage.workspaceDireset'));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('settingsPage.resetFailed'));
          } finally {
            // In cloud the workspace stays mounted (empty), so the dialog must
            // be closed explicitly — it isn't unmounted like the local wizard path.
            setConfirmReset(false);
          }
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function MobileNavigationCard() {
  const configured = useSessionStore((state) => state.org?.settings?.mobileNavigation);
  const initial = sanitizeMobileNavPaths(configured);
  return <MobileNavigationEditor key={initial.join('|')} initial={initial} />;
}

function MobileNavigationEditor({ initial }: { initial: string[] }) {
  const t = useT();
  const [draft, setDraft] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);

  const options = NAV_ITEMS.map((item) => ({ value: item.to, label: t(item.labelKey) }));

  const setSlot = (slot: number, path: string) => {
    setDraft((current) => {
      const next = [...current];
      const duplicateAt = next.indexOf(path);
      if (duplicateAt >= 0 && duplicateAt !== slot) {
        next[duplicateAt] = next[slot];
      }
      next[slot] = path;
      return sanitizeMobileNavPaths(next);
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveMobileNavigation(draft);
      toast.success(t('settings.mobileNav.saved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.mobileNav.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card glass accent="brand">
      <CardHeader
        icon={<Icon name="bars" aria-hidden />}
        title={t('settings.mobileNav.title')}
      />
      <CardBody>
        <div className={styles.mobileNavIntro}>
          <div>
            <span className={styles.mobileNavKicker}>
              <span aria-hidden />
              {t('settings.mobileNav.ownerControl')}
            </span>
            <p>{t('settings.mobileNav.description')}</p>
          </div>
          <span className={styles.mobileNavSync}>
            <Icon name="check-double" aria-hidden /> {t('settings.mobileNav.synced')}
          </span>
        </div>

        <div className={styles.mobileNavEditor}>
          <div className={styles.mobileNavSlots}>
            {draft.map((path, index) => (
              <div className={styles.mobileNavSlot} key={index}>
                <span className={styles.mobileNavSlotNumber}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Select
                  id={`mobile-navigation-slot-${index + 1}`}
                  label={`${t('settings.mobileNav.slot')} ${index + 1}`}
                  value={path}
                  options={options}
                  onChange={(event) => setSlot(index, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className={styles.mobileNavPreviewWrap}>
            <span className={styles.mobileNavPreviewLabel}>
              {t('settings.mobileNav.preview')}
            </span>
            <div className={styles.mobileNavPreview}>
              {draft.map((path, index) => {
                const item = NAV_ITEMS.find((entry) => entry.to === path) ?? NAV_ITEMS[0];
                return (
                  <span
                    className={index === 0 ? styles.mobileNavPreviewActive : ''}
                    key={path}
                  >
                    <Icon
                      name={item.icon}
                      weight={index === 0 ? 'fill' : 'regular'}
                      aria-hidden
                    />
                    <small>{item.to === '/' ? t('nav.home') : t(item.labelKey)}</small>
                  </span>
                );
              })}
              <span>
                <Icon name="bars" aria-hidden />
                <small>{t('nav.more')}</small>
              </span>
            </div>
            <small className={styles.mobileNavHint}>{t('settings.mobileNav.hint')}</small>
          </div>
        </div>

        <div className={styles.mobileNavActions}>
          <Button
            variant="secondary"
            onClick={() => setDraft([...DEFAULT_MOBILE_NAV_PATHS])}
            iconLeft={<Icon name="repeat" aria-hidden />}
          >
            {t('settings.mobileNav.reset')}
          </Button>
          <Button
            onClick={save}
            loading={busy}
            iconLeft={<Icon name="check" aria-hidden />}
          >
            {t('common.save')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function BusinessTab() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const setOrg = useSessionStore((s) => s.setOrg);
  const [name, setName] = useState(org?.name ?? '');
  const [address, setAddress] = useState(org?.address ?? '');
  const [phone, setPhone] = useState(org?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!org) return;
    // Nama, alamat, dan telepon ini tercetak di nota yang dibawa pulang
    // pelanggan dan tampil di halaman lacak publik — dulu ketiganya diterima
    // apa adanya, termasuk nomor yang jelas bukan nomor.
    if (!name.trim()) return toast.error(t('settingsPage.namaUsahaWajibDiisi'));
    if (name.trim().length > 60) return toast.error(t('settingsPage.namaUsahaTerlaluPanjang'));
    if (address.trim().length > 160)
      return toast.error(t('settingsPage.alamatTerlaluPanjangUntuk'));
    if (phone.trim() && normalizePhone(phone).length < 8)
      return toast.error(t('settingsPage.noTeleponTidakValid'));

    setBusy(true);
    const updated = {
      ...org,
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
    };
    try {
      await repository.setSingleton('organization', updated);
      setOrg(updated);
      logActivity({
        action: 'settings.update',
        entityType: 'organization',
        entityId: org.id,
        entityLabel: updated.name,
        meta: { address: updated.address, phone: updated.phone },
      });
      toast.success(t('settingsPage.profilUsahaDisimpan'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.profileFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || !org) return;
    if (!file.type.startsWith('image/')) return toast.error(t('settingsPage.fileHarusBerupaGambar'));
    if (file.size > 500 * 1024) return toast.error(t('settingsPage.ukuranLogoMaksimal500kb'));
    try {
      // Downscale to PNG Blob via canvas (no fetch(data:URL) — CSP blocks it).
      // Cloud mode: uploads to `org-logos` bucket, returns public CDN URL.
      // Local mode: falls back to a data URL stored in the org row.
      const blob = await fileToLogoBlob(file);
      const logoDataUrl = await uploadOrgLogo(org.id, blob);
      const updated = { ...org, logoDataUrl };
      await repository.setSingleton('organization', updated);
      setOrg(updated);
      toast.success(t('settingsPage.logoDiperbarui'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Gagal upload logo: ${msg}`);
      console.error('[logo upload]', err);
    }
  };

  // Logo kustom adalah fitur Pro. Yang dikunci adalah KONTROLNYA, bukan
  // datanya: org yang turun paket tetap menampilkan logonya di nota dan
  // halaman lacak, karena mencabutnya diam-diam akan mengubah dokumen yang
  // sudah dipegang pelanggan mereka.
  const canLogo = useFeature('logo');

  const removeLogo = async () => {
    if (!org) return;
    try {
      await removeOrgLogo(org.id); // delete bucket objects in cloud mode
    } catch {
      // Non-critical: still clear the reference below even if delete failed.
    }
    const updated = { ...org, logoDataUrl: null };
    await repository.setSingleton('organization', updated);
    setOrg(updated);
    toast.success(t('settingsPage.logoDihapus'));
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="store" aria-hidden />} title={t('settingsPage.profilUsaha')} />
      <CardBody>
        <div className={styles.form}>
          <div className={styles.logoRow}>
            <span className={styles.logoPreview}>
              {org?.logoDataUrl ? (
                <img src={org.logoDataUrl} alt="Logo toko" />
              ) : (
                <span className={styles.logoFallback}>
                  {(org?.name ?? 'F').charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div className={styles.logoMeta}>
              <strong>{t('settingsPage.logoToko')}</strong>
              <small>{t('settingsPage.pngJpgMaks500kb')}</small>
              <div className={styles.logoActions}>
                <Button
                  variant="secondary"
                  disabled={!canLogo}
                  onClick={() => fileRef.current?.click()}
                  iconLeft={<Icon name="download" aria-hidden />}
                >
                  {org?.logoDataUrl ? t('settingsPage.changeLogo') : t('settingsPage.uploadLogo')}
                </Button>
                {org?.logoDataUrl && (
                  <Button
                    variant="ghost"
                    onClick={removeLogo}
                    iconLeft={<Icon name="trash" aria-hidden />}
                  >
                    {t('settingsPage.hapus')}
                  </Button>
                )}
              </div>
              {!canLogo && (
                <ProNotice>
                  {t('settingsPage.pLogoTokoTampilDi')}
                </ProNotice>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickLogo}
                hidden
              />
            </div>
          </div>
          <Input
            label={t('settingsPage.namaUsaha')}
            value={name}
            autoCapWords
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={t('settingsPage.alamat')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Input
            label={t('settingsPage.noTelepon')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button onClick={save} loading={busy}>
            {t('settingsPage.simpanPerubahan')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Manage reusable complaint & accessory templates used as quick-picks in
 * the service form. Stored in orgConfig (localStorage), so we keep local
 * state in sync after each mutation.
 */
function ServiceTemplatesCard() {
  const t = useT();
  const [complaints, setComplaints] = useState<string[]>(() => getComplaintTemplates());
  const [accessories, setAccessories] = useState<string[]>(() => getAccessoryTemplates());
  const [busy, setBusy] = useState(false);

  // Template kini tersimpan di baris organisasi (tersinkron), jadi penyimpanan
  // bisa gagal — daftar di layar hanya berubah setelah servernya menerima.
  const persist = async (next: string[], save: (v: string[]) => Promise<void>, apply: (v: string[]) => void) => {
    setBusy(true);
    try {
      await save(next);
      apply(next);
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanTemplate'));
    } finally {
      setBusy(false);
    }
  };

  const addComplaint = (value: string) =>
    void persist([...complaints, value], setComplaintTemplates, setComplaints);
  const removeComplaint = (value: string) =>
    void persist(complaints.filter((c) => c !== value), setComplaintTemplates, setComplaints);
  const addAccessory = (value: string) =>
    void persist([...accessories, value], setAccessoryTemplates, setAccessories);
  const removeAccessory = (value: string) =>
    void persist(accessories.filter((a) => a !== value), setAccessoryTemplates, setAccessories);

  return (
    <Card glass>
      <CardHeader
        icon={<Icon name="clipboard-list" aria-hidden />}
        title={t('settingsPage.templateServis')}
      />
      <CardBody>
        <p className={styles.tplHint}>
          Pilihan cepat keluhan &amp; kelengkapan saat membuat servis baru.
        </p>
        <StringListEditor
          label={t('settingsPage.templateKeluhan')}
          placeholder={t('settingsPage.misMatiTotal')}
          items={complaints}
          onAdd={addComplaint}
          onRemove={removeComplaint}
          disabled={busy}
        />
        <StringListEditor
          label={t('settingsPage.templateKelengkapan')}
          placeholder={t('settingsPage.misCharger')}
          items={accessories}
          onAdd={addAccessory}
          onRemove={removeAccessory}
          disabled={busy}
        />
      </CardBody>
    </Card>
  );
}

/**
 * Device categories (e.g. "Laptop", "HP / Smartphone") offered as the category
 * dropdown when creating a service. Stored on the organization row
 * (settings.deviceCategories, migration 0032) so they sync across devices.
 */
/**
 * Kolom tabel Servis yang ditampilkan. Tersimpan di baris organisasi, jadi semua
 * perangkat toko melihat tabel yang sama. No. Servis, Status, dan Aksi selalu ada.
 */
function ServiceColumnsCard() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const columns = resolveServiceColumns(org?.settings?.serviceColumns);
  const [busy, setBusy] = useState(false);

  const toggle = async (id: ServiceColumnId) => {
    const next = columns.includes(id) ? columns.filter((c) => c !== id) : [...columns, id];
    setBusy(true);
    try {
      await saveServiceColumns(next);
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanKolomTabel'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="clipboard-list" aria-hidden />} title={t('settingsPage.kolomTabelServis')} />
      <CardBody>
        <p className={styles.tplHint}>
          {t('settingsPage.pPilihKolomYangTampil')}
        </p>
        <div className={styles.columnList}>
          {SERVICE_COLUMNS.map((c) => (
            <label key={c.id} className={styles.columnOption}>
              <input
                type="checkbox"
                checked={columns.includes(c.id)}
                onChange={() => void toggle(c.id)}
                disabled={busy}
              />
              <span className={styles.columnText}>
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function DeviceCategoriesCard() {
  const t = useT();
  // Read reactively from the org slice so a save here (and realtime updates
  // from other devices) re-render the list immediately.
  const org = useSessionStore((s) => s.org);
  const categories = org?.settings?.deviceCategories ?? getCategories();
  const [busy, setBusy] = useState(false);

  // One-time lift of any legacy per-device list into the cloud copy.
  useEffect(() => {
    void seedCategoriesFromLocal();
  }, []);

  const persist = async (next: string[]) => {
    setBusy(true);
    try {
      await setCategories(next);
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanKategori'));
    } finally {
      setBusy(false);
    }
  };

  const addCategory = (value: string) => {
    if (categories.includes(value)) return;
    void persist([...categories, value]);
  };
  const removeCategory = (value: string) => {
    void persist(categories.filter((c) => c !== value));
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="laptop" aria-hidden />} title={t('settingsPage.kategoriPerangkat')} />
      <CardBody>
        <p className={styles.tplHint}>
          {t('settingsPage.pJenisPerangkatYangDilayani')}
        </p>
        <StringListEditor
          label={t('settingsPage.kategori')}
          placeholder={t('settingsPage.misTablet')}
          items={categories}
          onAdd={addCategory}
          onRemove={removeCategory}
          disabled={busy}
        />
      </CardBody>
    </Card>
  );
}

function StringListEditor({
  label,
  placeholder,
  items,
  onAdd,
  onRemove,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [value, setValue] = useState('');
  const commit = () => {
    const v = value.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.warning(t('settingsPage.templateSudahAda'));
      return;
    }
    onAdd(v);
    setValue('');
  };
  return (
    <div className={styles.tplGroup}>
      <span className={styles.tplLabel}>{label}</span>
      {items.length > 0 && (
        <div className={styles.tplChips}>
          {items.map((item) => (
            <span key={item} className={styles.tplChip}>
              {item}
              <button
                onClick={() => onRemove(item)}
                aria-label={`Hapus ${item}`}
                title={t('settingsPage.hapus')}
                disabled={disabled}
              >
                <Icon name="times" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.addRow}>
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          disabled={disabled}
        />
        <Button
          onClick={commit}
          iconLeft={<Icon name="plus" aria-hidden />}
          disabled={disabled}
        >
          {t('settingsPage.tambah')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Default warranty lengths (service & parts) prefilled in StatusModal when a
 * job is finished, plus quick-pick duration presets. Stored in orgConfig.
 */
function WarrantyCard() {
  const t = useT();
  const [svcDays, setSvcDays] = useState(() => String(getWarrantyServiceDays()));
  const [partsDays, setPartsDays] = useState(() => String(getWarrantyPartsDays()));
  const [presets, setPresets] = useState<number[]>(() => getWarrantyPresets());
  const [presetInput, setPresetInput] = useState('');

  const [saving, setSaving] = useState(false);

  const saveDefaults = async () => {
    setSaving(true);
    try {
      // Clamp to non-negative: a "number" input still accepts "-5".
      await setWarrantyDays(Number(svcDays) || 0, Number(partsDays) || 0);
      toast.success(t('settingsPage.defaultGaransiDisimpan'));
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanDefaultGaransi'));
    } finally {
      setSaving(false);
    }
  };

  const addPreset = async () => {
    const n = Math.max(0, Math.round(Number(presetInput) || 0));
    if (!n) return toast.warning(t('settingsPage.masukkanJumlahHariYang'));
    if (presets.includes(n)) return toast.warning(t('settingsPage.presetSudahAda'));
    const next = [...presets, n].sort((a, b) => a - b);
    try {
      await setWarrantyPresets(next);
      setPresets(next);
      setPresetInput('');
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanPreset'));
    }
  };
  const removePreset = async (n: number) => {
    const next = presets.filter((p) => p !== n);
    try {
      await setWarrantyPresets(next);
      setPresets(next);
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanPreset'));
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="shield-halved" aria-hidden />} title={t('settingsPage.garansi')} />
      <CardBody>
        <p className={styles.tplHint}>
          {t('settingsPage.warrantyIntro')}{' '}
          <strong>{t('settingsPage.warrantyDone')}</strong>. {t('settingsPage.warrantyPerService')}
        </p>
        <div className={styles.warrantyDefaults}>
          <Input
            label={t('settingsPage.garansiJasaHari')}
            type="number"
            inputMode="numeric"
            value={svcDays}
            onChange={(e) => setSvcDays(e.target.value)}
          />
          <Input
            label={t('settingsPage.garansiSparepartHari')}
            type="number"
            inputMode="numeric"
            value={partsDays}
            onChange={(e) => setPartsDays(e.target.value)}
          />
        </div>
        <Button onClick={saveDefaults} loading={saving}>
          {t('settingsPage.simpanDefault')}
        </Button>

        <div className={styles.tplGroup}>
          <span className={styles.tplLabel}>{t('settingsPage.presetDurasiQuickPick')}</span>
          {presets.length > 0 && (
            <div className={styles.tplChips}>
              {presets.map((p) => (
                <span key={p} className={styles.tplChip}>
                  {p} hari
                  <button
                    onClick={() => void removePreset(p)}
                    aria-label={`Hapus ${p} hari`}
                    title={t('settingsPage.hapus')}
                  >
                    <Icon name="times" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={styles.addRow}>
            <Input
              placeholder={t('settingsPage.mis60')}
              type="number"
              inputMode="numeric"
              value={presetInput}
              onChange={(e) => setPresetInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addPreset()}
            />
            <Button onClick={() => void addPreset()} iconLeft={<Icon name="plus" aria-hidden />}>
              {t('settingsPage.tambah')}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Target bulanan (Dashboard) & anggaran overhead (break-even Laporan). Wizard
 * onboarding berjanji "bisa diubah nanti", tapi sampai 28 Sep 2026 tak ada
 * tempat untuk mengubahnya.
 */
function MonthlyTargetCard() {
  const t = useT();
  const current = getTarget();
  const [revenue, setRevenue] = useState(() => (current.revenue ? fmtRpInput(String(current.revenue)) : ''));
  const [units, setUnits] = useState(() => (current.serviceCount ? String(current.serviceCount) : ''));
  const [overhead, setOverhead] = useState(() =>
    current.overheadBudget ? fmtRpInput(String(current.overheadBudget)) : '',
  );
  const [busy, setBusy] = useState(false);
  const next = {
    revenue: parseRpInput(revenue),
    serviceCount: Math.max(0, parseInt(units.replace(/\D/g, ''), 10) || 0),
    overheadBudget: parseRpInput(overhead),
  };
  const dirty =
    next.revenue !== current.revenue ||
    next.serviceCount !== current.serviceCount ||
    next.overheadBudget !== current.overheadBudget;

  const save = async () => {
    if (demoGuard()) return;
    setBusy(true);
    try {
      await setMonthlyTarget(next);
      toast.success(t('settingsPage.targetBulananDisimpan'));
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanTarget'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="bullseye" aria-hidden />} title={t('settingsPage.targetBulanan')} />
      <CardBody>
        <p className={styles.tplHint}>
          {t('settingsPage.pDipakaiGaugeTargetDi')}
        </p>
        <div className={styles.targetGrid}>
          <Input
            label={t('settingsPage.targetPendapatanBulan')}
            inputMode="numeric"
            value={revenue}
            onChange={(e) => setRevenue(fmtRpInput(e.target.value))}
            placeholder="50.000.000"
          />
          <Input
            label={t('settingsPage.targetUnitServisSelesai')}
            inputMode="numeric"
            value={units}
            onChange={(e) => setUnits(e.target.value.replace(/\D/g, ''))}
            placeholder="60"
          />
          <Input
            label={t('settingsPage.overheadStartLabel')}
            inputMode="numeric"
            value={overhead}
            onChange={(e) => setOverhead(fmtRpInput(e.target.value))}
            placeholder="8.000.000"
            hint={t('settingsPage.overheadStartHint')}
          />
        </div>
        <div className={styles.noteFoot}>
          <span />
          <Button onClick={save} disabled={busy || !dirty}>
            {t('settingsPage.simpanTarget')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Sewa tempat per cabang untuk overhead Laporan. Bulanan = dari catatan Sewa di
 * Keuangan; tahunan = nominal ÷ 12 tiap bulan, dan catatan Sewa cabang itu
 * tidak dihitung lagi (pembayarannya tetap dicatat supaya saldo kas benar).
 */
function RentCard() {
  const t = useT();
  const { data: outlets } = useCollection('outlets');
  const current = getRent();
  const [draft, setDraft] = useState<Record<string, { mode: OutletRent['mode']; yearly: string }>>(() =>
    Object.fromEntries(
      Object.entries(current).map(([id, r]) => [id, { mode: r.mode, yearly: r.yearly ? fmtRpInput(String(r.yearly)) : '' }]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const rowOf = (id: string) => draft[id] ?? { mode: 'bulanan' as const, yearly: '' };
  const normalize = (r: OutletRent | undefined): OutletRent =>
    r?.mode === 'tahunan' ? { mode: 'tahunan', yearly: r.yearly } : { mode: 'bulanan', yearly: 0 };
  const next: Record<string, OutletRent> = Object.fromEntries(
    outlets.map((o) => {
      const r = rowOf(o.id);
      return [o.id, normalize({ mode: r.mode, yearly: parseRpInput(r.yearly) })];
    }),
  );
  const dirty = outlets.some((o) => JSON.stringify(next[o.id]) !== JSON.stringify(normalize(current[o.id])));
  const missing = outlets.some((o) => next[o.id].mode === 'tahunan' && next[o.id].yearly <= 0);
  const patch = (id: string, change: Partial<{ mode: OutletRent['mode']; yearly: string }>) =>
    setDraft((d) => ({ ...d, [id]: { ...rowOf(id), ...change } }));

  const save = async () => {
    if (demoGuard()) return;
    setBusy(true);
    try {
      await setRent(next);
      toast.success(t('settingsPage.rentSaved'));
    } catch {
      toast.error(t('settingsPage.rentSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (outlets.length === 0) return null;
  return (
    <Card glass>
      <CardHeader icon={<Icon name="store" aria-hidden />} title={t('settingsPage.rentTitle')} />
      <CardBody>
        <p className={styles.tplHint}>{t('settingsPage.rentHint')}</p>
        <div className={styles.rentRows}>
          {outlets.map((o) => {
            const r = rowOf(o.id);
            const yearly = parseRpInput(r.yearly);
            return (
              <div key={o.id} className={styles.rentRow}>
                <span className={styles.rentName}>{o.name}</span>
                <Select
                  aria-label={interpolate(t('settingsPage.rentModeFor'), { outlet: o.name })}
                  value={r.mode}
                  onChange={(e) => patch(o.id, { mode: e.target.value as OutletRent['mode'] })}
                  options={[
                    { value: 'bulanan', label: t('settingsPage.rentMonthly') },
                    { value: 'tahunan', label: t('settingsPage.rentYearly') },
                  ]}
                />
                {r.mode === 'tahunan' ? (
                  <>
                    <Input
                      aria-label={interpolate(t('settingsPage.rentYearlyFor'), { outlet: o.name })}
                      inputMode="numeric"
                      value={r.yearly}
                      onChange={(e) => patch(o.id, { yearly: fmtRpInput(e.target.value) })}
                      placeholder="24.000.000"
                    />
                    <span className={styles.rentReadout}>
                      {yearly > 0 ? interpolate(t('settingsPage.rentPerMonth'), { amount: fmtRp(yearly / 12) }) : '—'}
                    </span>
                  </>
                ) : (
                  <span className={[styles.rentReadout, styles.rentFromFinance].join(' ')}>
                    {t('settingsPage.rentFromFinance')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.noteFoot}>
          <span className={styles.tplHint}>{missing ? t('settingsPage.rentYearlyMissing') : ''}</span>
          <Button onClick={save} disabled={busy || !dirty || missing}>
            {t('settingsPage.rentSave')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Catatan bebas milik toko, tampil di nota cetak DAN halaman lacak publik.
 * Ini satu-satunya teks pada kedua dokumen itu yang ditulis pemiliknya
 * sendiri — jadi nota yang dibawa pulang pelanggan terbaca sebagai dokumen
 * toko tersebut, bukan cetakan seragam dari sebuah aplikasi.
 */
function PublicNoteCard() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const [draft, setDraft] = useState(() => org?.settings?.publicNote ?? '');
  const [busy, setBusy] = useState(false);
  const left = PUBLIC_NOTE_MAX - draft.length;

  const save = async () => {
    if (demoGuard()) return;
    setBusy(true);
    try {
      await setPublicNote(draft);
      toast.success(t('settingsPage.catatanTokoDisimpan'));
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanCatatan'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="note" aria-hidden />} title={t('settingsPage.catatanToko')} />
      <CardBody>
        <p className={styles.tplHint}>
          {t('settingsPage.pTampilDiNotaCetak')}
        </p>
        <textarea
          className={styles.waTextarea}
          value={draft}
          maxLength={PUBLIC_NOTE_MAX}
          rows={4}
          placeholder={'Senin–Sabtu 09.00–17.00 WIB.\nGaransi batal bila segel rusak.'}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className={styles.noteFoot}>
          <span className={styles.noteCount} data-low={left <= 40 ? 'true' : undefined}>
            {left} karakter tersisa
          </span>
          <Button onClick={save} disabled={busy || draft === (org?.settings?.publicNote ?? '')}>
            {t('settingsPage.simpanCatatan')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}


/**
 * Per-key WhatsApp message template editor. Saves overrides to orgConfig;
 * blank fields fall back to the built-in default via resolveWaTemplates.
 */
function WhatsAppTemplatesCard() {
  const t = useT();
  // Menyunting template adalah fitur Pro; MEMAKAI-nya tidak. Solo tetap
  // mengirim WhatsApp dengan template bawaan — yang dibeli adalah menulis
  // ulang suaranya, bukan kemampuan mengabari pelanggan.
  const canEdit = useFeature('waTemplates');
  const overrides = getWaTemplateOverrides();
  const keys = Object.keys(DEFAULT_WA_TEMPLATES) as WaTemplateKey[];
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of keys) init[k] = overrides[k] ?? DEFAULT_WA_TEMPLATES[k];
    return init;
  });

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!canEdit) return;
    const next: Record<string, string> = {};
    for (const k of keys) {
      const v = drafts[k]?.trim();
      // Only persist as override if it differs from default & is non-empty.
      if (v && v !== DEFAULT_WA_TEMPLATES[k]) next[k] = v;
    }
    setSaving(true);
    try {
      await setWaTemplateOverrides(next);
      toast.success(t('settingsPage.templateWhatsappDisimpan'));
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanTemplateWhatsapp'));
    } finally {
      setSaving(false);
    }
  };

  const resetKey = (k: WaTemplateKey) => {
    if (!canEdit) return;
    setDrafts((d) => ({ ...d, [k]: DEFAULT_WA_TEMPLATES[k] }));
  };

  return (
    <Card glass>
      <CardHeader
        icon={<Icon name="whatsapp" aria-hidden />}
        title={t('settingsPage.templateWhatsapp')}
        action={canEdit ? undefined : <ProBadge />}
      />
      <CardBody>
        <p className={styles.tplHint}>
          Variabel tersedia:{' '}
          {WA_TEMPLATE_VARS.map((v) => (
            <code key={v} className={styles.varChip}>{`{${v}}`}</code>
          ))}
          <br />
          <code className={styles.varChip}>{`{keluhan}`}</code>,{' '}
          <code className={styles.varChip}>{`{kelengkapan}`}</code>,{' '}
          <code className={styles.varChip}>{`{alamat}`}</code>,{' '}
          <code className={styles.varChip}>{`{garansi}`}</code> dan{' '}
          <code className={styles.varChip}>{`{rincian_bayar}`}</code> membawa barisnya
          sendiri — barisnya hilang otomatis kalau datanya kosong, jadi tidak perlu
          ditulis label lagi di depannya.
        </p>
        {keys.map((k) => (
          <div key={k} className={styles.tplGroup}>
            <div className={styles.waHead}>
              <span className={styles.tplLabel}>{WA_TEMPLATE_LABELS[k]}</span>
              {canEdit && (
                <button
                  className={styles.waReset}
                  onClick={() => resetKey(k)}
                  type="button"
                >
                  {t('settingsPage.resetDefault')}
                </button>
              )}
            </div>
            <textarea
              className={styles.waTextarea}
              // Default kini multi-baris — 3 baris memotongnya jadi tak terbaca.
              rows={10}
              value={drafts[k]}
              // Solo tetap boleh MEMBACA template yang dipakainya; yang dikunci
              // adalah menyuntingnya. readOnly, bukan disabled, supaya teksnya
              // tetap bisa disorot dan disalin.
              readOnly={!canEdit}
              onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
            />
          </div>
        ))}
        {canEdit ? (
          <Button onClick={save} loading={saving}>
            {t('settingsPage.simpanTemplate')}
          </Button>
        ) : (
          <ProNotice>
            {t('settingsPage.pTemplateBawaanTetapTerkirim')}
          </ProNotice>
        )}
      </CardBody>
    </Card>
  );
}

const ROLE_LABEL: Record<string, TranslationKey> = {
  owner: 'settingsPage.owner',
  admin: 'settingsPage.admin',
  karyawan: 'settingsPage.karyawan',
};

/**
 * Inline editor to assign a staff member to one or more branches (outlets).
 * Loads the current assignment on open, toggles chips, and replaces the set
 * via the set_member_outlets RPC. Empty selection is refused (0057): with no
 * fallback in auth_outlet_ids(), it would leave the member seeing no branch.
 */
function MemberOutletsEditor({
  memberId,
  outlets,
  onClose,
}: {
  memberId: string;
  outlets: Outlet[];
  onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMemberOutlets(memberId)
      .then((ids) => {
        if (!cancelled) setSelected(ids);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : t('settingsPage.loadBranchesFailed')),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, t]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const save = async () => {
    setBusy(true);
    try {
      await setMemberOutlets(memberId, selected);
      toast.success(t('settingsPage.penugasanCabangDisimpan'));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.saveBranchesFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.outletEditor}>
      <div className={styles.outletEditorHead}>
        <strong>{t('settingsPage.cabangYangDapatDiakses')}</strong>
        <small className={styles.hint}>
          Anggota ini hanya melihat &amp; mengelola data cabang terpilih.
        </small>
      </div>
      {loading ? (
        <small className={styles.hint}>{t('settingsPage.memuat')}</small>
      ) : (
        <div className={styles.tplChips}>
          {outlets.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                className={[styles.tplChip, on ? styles.tplChipOn : ''].join(' ')}
                aria-pressed={on}
                onClick={() => toggle(o.id)}
              >
                <Icon name={on ? 'check' : 'shop'} aria-hidden /> {o.name}
              </button>
            );
          })}
        </div>
      )}
      {!loading && selected.length === 0 && (
        <small className={styles.hint} role="note">
          {t('settingsPage.pPilihMinimalSatuCabang')}
        </small>
      )}
      <div className={styles.addRow}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t('settingsPage.tutup')}
        </Button>
        <Button size="sm" onClick={save} loading={busy} disabled={selected.length === 0}>
          {t('settingsPage.simpan')}
        </Button>
      </div>
    </div>
  );
}

function TeamTab({
  employees,
  outlets,
}: {
  employees: ReturnType<typeof useCollection<'employees'>>['data'];
  outlets: Outlet[];
}) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const me = useSessionStore((s) => s.currentEmployee);
  const plan = useSessionStore((s) => s.org?.planType ?? 'trial');

  const { refetch } = useCollection('employees');

  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('karyawan');
  // Outlets to assign on invite (empty = all, decided at claim time).
  const [inviteOutlets, setInviteOutlets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Per-member outlet assignment editor (memberId being edited).
  const [editOutletsFor, setEditOutletsFor] = useState<string | null>(null);
  // membership_id -> assigned outlet ids, for the at-a-glance summary per row.
  const [memberOutlets, setMemberOutlets2] = useState<Record<string, string[]>>({});

  const loadMemberOutlets = useCallback(async () => {
    if (!isSupabaseConfigured || !orgId) return;
    try {
      setMemberOutlets2(await getOrgMemberOutlets(orgId));
    } catch {
      // Non-fatal: the summary is informational; editor still works.
    }
  }, [orgId]);

  const toggleInviteOutlet = (id: string) =>
    setInviteOutlets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const loadInvites = useCallback(async () => {
    if (!isSupabaseConfigured || !orgId) return;
    try {
      setInvites(await listPendingInvites(orgId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.loadInvitesFailed'));
    }
  }, [orgId, t]);

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return;
    let cancelled = false;
    listPendingInvites(orgId)
      .then((data) => {
        if (!cancelled) setInvites(data);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : t('settingsPage.loadInvitesFailed')),
      );
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

  // Load the per-member outlet assignment summary (for the team list badges).
  // Inline .then() with a cancelled guard — mirrors the invites effect so the
  // setState is not flagged as synchronous-in-effect.
  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return;
    let cancelled = false;
    getOrgMemberOutlets(orgId)
      .then((m) => {
        if (!cancelled) setMemberOutlets2(m);
      })
      .catch(() => {
        // Non-fatal: summary is informational; editor still works.
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Solo is single-user (the owner). Inviting anyone exceeds the quota and
  // forces an upgrade to Pro. Active members + outstanding invites both count.
  // Anggota NONAKTIF tidak memakai kursi: menonaktifkan orang yang keluar
  // dulu tidak mengembalikan kursinya, jadi toko Solo yang berganti karyawan
  // terkunci meski penggunanya tetap satu. Server menghitung dengan aturan
  // yang sama (0077).
  const seatsUsed = employees.filter((e) => e.active).length + invites.length;
  const canInvite = withinUserQuota(plan, seatsUsed + 1);

  const invite = async () => {
    if (!canInvite)
      return toast.error(
        t('settingsPage.soloLimit'),
      );
    if (!name.trim()) return toast.error(t('settingsPage.namaWajibDiisi'));
    if (!isValidInviteEmail(email)) return toast.error(t('settingsPage.emailTidakValid'));
    setBusy(true);
    try {
      await inviteMember({ orgId, email, name, role, outletIds: inviteOutlets });
      // Tindakan kewenangan dicatat: siapa menambah siapa, dengan peran apa.
      logActivity({
        action: 'member.invite',
        entityType: 'member',
        entityLabel: name.trim(),
        meta: { email: email.trim(), role },
      });
      toast.success(interpolate(t('settingsPage.inviteCreated'), { email: email.trim() }));
      setName('');
      setEmail('');
      setRole('karyawan');
      setInviteOutlets([]);
      await loadInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.inviteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const target = invites.find((i) => i.id === id);
      await revokeInvite(id);
      logActivity({
        action: 'invite.revoke',
        entityType: 'invite',
        entityId: id,
        entityLabel: target?.email ?? '',
        meta: { name: target?.name ?? '', role: target?.role ?? null },
      });
      await loadInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.cancelInviteFailed'));
    }
  };

  const changeRole = async (memberId: string, newRole: Role) => {
    try {
      await setMemberRole(memberId, newRole);
      logActivity({
        action: 'member.role',
        entityType: 'member',
        entityId: memberId,
        entityLabel: employees.find((e) => e.id === memberId)?.name ?? '',
        meta: { role: newRole },
      });
      toast.success(t('settingsPage.peranDiperbarui'));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.roleFailed'));
    }
  };

  const deactivate = async (memberId: string) => {
    setConfirmOff(null);
    try {
      await deactivateMember(memberId);
      logActivity({
        action: 'member.deactivate',
        entityType: 'member',
        entityId: memberId,
        entityLabel: employees.find((e) => e.id === memberId)?.name ?? '',
      });
      toast.success(t('settingsPage.anggotaDinonaktifkan'));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.deactivateFailed'));
    }
  };

  const deleteMemberAction = async (memberId: string) => {
    setConfirmDelete(null);
    try {
      const gone = employees.find((e) => e.id === memberId);
      await deleteMember(memberId);
      logActivity({
        action: 'member.delete',
        entityType: 'member',
        entityId: memberId,
        entityLabel: gone?.name ?? '',
        meta: { role: gone?.role ?? null },
      });
      toast.success(t('settingsPage.anggotaDihapusPermanen'));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settingsPage.removeMemberFailed'));
    }
  };

  return (
    <>
      {isSupabaseConfigured && (
        <Card glass>
          <CardHeader
            icon={<Icon name="user-plus" aria-hidden />}
            title={t('settingsPage.undangAnggota')}
          />
          <CardBody>
            <p className={styles.hint}>
              {t('settingsPage.pKaryawanMendaftarSendiriDengan')}
            </p>
            {!canInvite ? (
              <p className={styles.hint} role="note">
                {t('settingsPage.planWord')} <strong>{PLANS[plan].name}</strong> {t('settingsPage.oneUserUpgrade')}{' '}
                <strong>{t('settingsPage.pro')}</strong> {t('settingsPage.unlimitedMembers')}
              </p>
            ) : (
              <div className={styles.inviteRow}>
                <Input
                  placeholder={t('settingsPage.nama')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  placeholder={t('settingsPage.emailContohCom')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <select
                  className={styles.roleSelect}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  aria-label={t('settingsPage.peran')}
                >
                  <option value="karyawan">{t('settingsPage.karyawan')}</option>
                  <option value="admin">{t('settingsPage.admin')}</option>
                </select>
                <Button
                  onClick={invite}
                  loading={busy}
                  iconLeft={<Icon name="paper-plane-tilt" aria-hidden />}
                >
                  {t('settingsPage.undang')}
                </Button>
              </div>
            )}
            {canInvite && role !== 'owner' && outlets.length > 0 && (
              <div className={styles.outletPick}>
                <span className={styles.tplLabel}>{t('settingsPage.tugaskanCabangOpsional')}</span>
                <div className={styles.tplChips}>
                  {outlets.map((o) => {
                    const on = inviteOutlets.includes(o.id);
                    return (
                      <button
                        type="button"
                        key={o.id}
                        className={[styles.tplChip, on ? styles.tplChipOn : ''].join(' ')}
                        aria-pressed={on}
                        onClick={() => toggleInviteOutlet(o.id)}
                      >
                        <Icon name={on ? 'check' : 'shop'} aria-hidden /> {o.name}
                      </button>
                    );
                  })}
                </div>
                <small className={styles.hint}>
                  {t('settingsPage.kosongkanUntukAksesSemua')}
                </small>
              </div>
            )}
            {invites.length > 0 && (
              <ul className={styles.list}>
                {invites.map((inv) => (
                  <li key={inv.id} className={styles.listItem}>
                    <span className={styles.avatar}>
                      <Icon name="envelope" aria-hidden />
                    </span>
                    <div className={styles.itemInfo}>
                      <strong>{inv.email}</strong>
                      {/* Undangan kini punya masa berlaku 14 hari (0078) —
                          sebelumnya email salah ketik pun bisa diklaim setahun
                          kemudian dan langsung membuka seluruh data toko. */}
                      <small>
                        {t(ROLE_LABEL[inv.role])} ·{' '}
                        {inv.expiresAt && new Date(inv.expiresAt) < new Date()
                          ? t('settingsPage.inviteExpired')
                          : inv.expiresAt
                            ? interpolate(t('settingsPage.inviteValidUntil'), { date: new Date(inv.expiresAt).toLocaleDateString('id-ID') })
                            : t('settingsPage.invitePending')}
                      </small>
                    </div>
                    <span className={styles.itemActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void revoke(inv.id)}
                        iconLeft={<Icon name="x" aria-hidden />}
                      >
                        {t('settingsPage.batalkan')}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card glass>
        <CardHeader icon={<Icon name="users" aria-hidden />} title={t('settingsPage.anggotaTim')} />
        <CardBody className={styles.noPad}>
          <ul className={styles.list}>
            {employees.map((e) => {
              const isSelf = me?.id === e.id;
              // Sekali saja per baris: tombol dan tooltip-nya harus menjawab
              // dari pemeriksaan YANG SAMA, bukan dua panggilan yang bisa
              // berbeda — kontrol hidup dengan tooltip "terkunci" persis bug
              // yang blok ini perbaiki.
              const lockedOwner = e.role === 'owner' && !canChangeRole(e, 'karyawan', employees);
              const canTurnOff = canDeactivate(e, employees);
              return (
                <li key={e.id} className={styles.listItem}>
                  <span className={styles.avatar}>{e.name.charAt(0).toUpperCase()}</span>
                  <div className={styles.itemInfo}>
                    <strong>{e.name}</strong>
                    <small>{t(ROLE_LABEL[e.role])}</small>
                    {isSupabaseConfigured && e.role !== 'owner' && outlets.length > 0 && (
                      <small className={styles.memberOutlets}>
                        <Icon name="shop" aria-hidden />{' '}
                        {(memberOutlets[e.id] ?? []).length === 0
                          ? t('settingsPage.noBranch')
                          : outlets
                              .filter((o) => (memberOutlets[e.id] ?? []).includes(o.id))
                              .map((o) => o.name)
                              .join(', ')}
                      </small>
                    )}
                  </div>
                  {/* All controls live in ONE flex cell so the mobile rule can
                      drop them to their own full-width line (they used to be
                      loose siblings squeezed into the 390px row). */}
                  {isSupabaseConfigured && !isSelf && e.active ? (
                    <span className={styles.itemActions}>
                      {/* Penjaga "owner terakhir" sudah lama ada di lib dan di
                          server, tapi layar tetap membiarkan tombolnya ditekan
                          lalu menampilkan penolakan. Sekarang kontrolnya yang
                          mati, dengan alasannya. */}
                      <select
                        className={styles.roleSelect}
                        value={e.role}
                        onChange={(ev) => void changeRole(e.id, ev.target.value as Role)}
                        aria-label={interpolate(t('settingsPage.roleOf'), { name: e.name })}
                        disabled={lockedOwner}
                        title={
                          lockedOwner
                            ? t('settingsPage.lastOwnerRole')
                            : undefined
                        }
                      >
                        <option value="owner">{t('settingsPage.owner')}</option>
                        <option value="admin">{t('settingsPage.admin')}</option>
                        <option value="karyawan">{t('settingsPage.karyawan')}</option>
                      </select>
                      {e.role !== 'owner' && outlets.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditOutletsFor(editOutletsFor === e.id ? null : e.id)
                          }
                          iconLeft={<Icon name="shop" aria-hidden />}
                        >
                          {t('settingsPage.cabang')}
                        </Button>
                      ) : (
                        outlets.length > 0 && (
                          // Owner selalu mencakup semua cabang (RLS is_org_owner),
                          // jadi penugasan outlet tak berlaku untuknya. Admin kini
                          // di-scope per-cabang (0036) lewat tombol "Cabang" di atas.
                          <span title={t('settingsPage.ownerMencakupSemuaCabang')}>
                            <Badge tone="info">
                              <Icon name="boxes-stacked" aria-hidden /> Semua cabang
                            </Badge>
                          </span>
                        )
                      )}
                      <span
                        title={
                          canTurnOff
                            ? undefined
                            : t('settingsPage.lastOwnerOff')
                        }
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmOff(e.id)}
                          disabled={!canTurnOff}
                          iconLeft={<Icon name="user-minus" aria-hidden />}
                        >
                          {t('settingsPage.nonaktifkan')}
                        </Button>
                      </span>
                    </span>
                  ) : (
                    <span className={styles.itemActions}>
                      <Badge tone={e.active ? 'success' : 'neutral'}>
                        {e.active ? t('settingsPage.active') : t('settingsPage.inactive')}
                      </Badge>
                      {isSupabaseConfigured && !isSelf && !e.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDelete(e.id)}
                          iconLeft={<Icon name="trash" aria-hidden />}
                        >
                          {t('settingsPage.hapus')}
                        </Button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {editOutletsFor && (
            <MemberOutletsEditor
              key={editOutletsFor}
              memberId={editOutletsFor}
              outlets={outlets}
              onClose={() => {
                setEditOutletsFor(null);
                void loadMemberOutlets();
              }}
            />
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOff !== null}
        title={t('settingsPage.nonaktifkanAnggota')}
        message={t('settingsPage.anggotaTidakAkanBisa')}
        confirmLabel={t('settingsPage.nonaktifkan')}
        danger
        onConfirm={() => confirmOff && void deactivate(confirmOff)}
        onCancel={() => setConfirmOff(null)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('settingsPage.hapusAnggotaPermanen')}
        message={t('settingsPage.anggotaAkanDihapusDari')}
        confirmLabel={t('settingsPage.hapusPermanen')}
        danger
        onConfirm={() => confirmDelete && void deleteMemberAction(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

function BillingTab({ outlets }: { outlets: Outlet[] }) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const orgId = org?.id ?? '';
  const plan = (org?.planType ?? 'trial') as PlanType;
  const expiry = org?.planExpiredAt ?? null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  // Termin yang sedang dilihat pemilik. Default bulanan: opsi termurah di
  // muka dulu, penghematannya yang menarik dia ke kanan — bukan sebaliknya.
  const [term, setTerm] = useState<BillingTerm>('monthly');
  const phase = subscriptionPhase(expiry, undefined, BILLING_TERMS[term].reminderDays);
  const days = expiry ? daysUntil(expiry) : null;
  const outletCount = outlets.length || 1;
  const suggested = outletTierFor(outletCount);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    listInvoices(orgId)
      .then((data) => {
        if (!cancelled) setInvoices(data);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : t('settingsPage.invoiceFailed')),
      );
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

  // Auto-refresh: when the webhook (or another device) changes an invoice or
  // the org's plan, Supabase Realtime notifies us — re-fetch invoices and
  // refresh the org in session so the UI updates without a manual reload.
  useEffect(() => {
    if (!orgId) return;
    const unsubscribe = subscribeOrgBilling(orgId, () => {
      void (async () => {
        try {
          setInvoices(await listInvoices(orgId));
          const fresh = await repository.getSingleton('organization');
          if (fresh) useSessionStore.getState().setOrg(fresh);
        } catch {
          // Transient realtime refresh failure is non-fatal; next event or a
          // manual action will reconcile.
        }
      })();
    });
    return unsubscribe;
  }, [orgId]);

  const requestPayment = (tier: PlanType) => {
    if (!withinOutletQuota(tier, outletCount)) {
      return toast.error(
        interpolate(t('settingsPage.tierMaxOutlets'), { tier: PLANS[tier].name, n: String(PLANS[tier].maxOutlets) }),
      );
    }
    if (!org) return;
    const base =
      tier === 'enterprise'
        ? priceForOutlets(outletCount)
        : PLANS[tier].priceMonthly;
    const amount = monthlyRateForTerm(base, term);
    const link = manualPaymentWhatsAppLink({
      supportPhone: FIXMASTER_WHATSAPP,
      orgId: org.id,
      orgName: org.name,
      currentPlan: PLANS[plan].name,
      expiresAt: expiry,
      requestedPlan: PLANS[tier].name,
      amount,
      outletCount,
      term,
      total: totalForTerm(base, term),
    });
    window.open(link, '_blank', 'noopener,noreferrer');
    toast.success(t('settings.billing.whatsappOpened'));
  };

  // LED color per subscription phase (bench status-light language).
  const phaseLed: Record<string, string> = {
    active: styles.ledOk,
    reminder: styles.ledWarn,
    grace: styles.ledWarn,
    expired: styles.ledCrit,
  };
  // Phase tint applied to the charge gauge container (drives tick color).
  const phaseGauge: Record<string, string> = {
    active: styles.gaugeOk,
    reminder: styles.gaugeWarn,
    grace: styles.gaugeWarn,
    expired: styles.gaugeCrit,
  };

  // Charge gauge: remaining subscription "power" as % of a ~30-day period.
  // No expiry (e.g. unlimited) reads as full charge.
  const chargePct = expiry
    ? Math.max(0, Math.min(100, Math.round(((days ?? 0) / 30) * 100)))
    : 100;
  const TICKS = 24;
  const filledTicks = Math.round((chargePct / 100) * TICKS);

  const invoiceTone = (status: string) =>
    status === 'paid'
      ? styles.tonePaid
      : status === 'pending'
        ? styles.tonePending
        : styles.toneVoid;
  const paymentHistory = invoices.filter((invoice) => invoice.status === 'paid');

  return (
    <>
      <Card glass>
        <CardHeader
          icon={<Icon name="crown" aria-hidden />}
          title={t('settings.billing.status')}
        />
        <CardBody>
          {/* License meter — subscription as bench operating "power". */}
          <div className={styles.licenseMeter}>
            <div className={styles.licenseTop}>
              <span className={[styles.led, phaseLed[phase]].join(' ')} aria-hidden />
              <div className={styles.licenseName}>
                <span className={styles.planName}>{PLANS[plan].name}</span>
                <span className={styles.licensePhase}>{phaseLabel(phase)}</span>
              </div>
              {expiry && phase !== 'expired' && days != null && (
                <div className={styles.daysReadout}>
                  <span className={styles.daysNum}>{Math.max(0, days)}</span>
                  <span className={styles.daysUnit}>{t('settingsPage.days')}</span>
                </div>
              )}
            </div>

            {expiry && (
              <div
                className={[styles.chargeGauge, phaseGauge[phase]].join(' ')}
                role="meter"
                aria-valuenow={chargePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={interpolate(t('settingsPage.subRemaining'), { pct: String(chargePct) })}
              >
                {Array.from({ length: TICKS }).map((_, i) => (
                  <span
                    key={i}
                    className={[styles.tick, i < filledTicks ? styles.tickOn : ''].join(
                      ' ',
                    )}
                  />
                ))}
              </div>
            )}

            <div className={styles.licenseMeta}>
              {expiry ? (
                phase === 'expired' ? (
                  <>Kedaluwarsa {new Date(expiry).toLocaleDateString('id-ID')}</>
                ) : days != null && days >= 0 ? (
                  <>Berlaku s/d {new Date(expiry).toLocaleDateString('id-ID')}</>
                ) : (
                  <>
                    Masa tenggang hingga {GRACE_DAYS} hari setelah{' '}
                    {new Date(expiry).toLocaleDateString('id-ID')}
                  </>
                )
              ) : (
                <>{t('settingsPage.tanpaBatasMasaAktif')}</>
              )}
            </div>
          </div>

          {(phase === 'reminder' || phase === 'grace' || phase === 'expired') && (
            <p className={styles.billingBanner}>
              <Icon name="warning" aria-hidden />{' '}
              {phase === 'expired'
                ? t('settingsPage.subExpired')
                : phase === 'grace'
                  ? t('settingsPage.subGrace')
                  : t('settingsPage.subDue')}
            </p>
          )}
        </CardBody>
      </Card>

      <Card glass>
        <CardHeader
          icon={<Icon name="whatsapp" aria-hidden />}
          title={t('settings.billing.manualTitle')}
        />
        <CardBody>
          <div className={styles.manualBillingFlow}>
            <span className={styles.manualBillingLed} aria-hidden />
            <div>
              <strong>{t('settings.billing.manualKicker')}</strong>
              <p>{t('settings.billing.manualDescription')}</p>
            </div>
            <ol className={styles.manualBillingSteps}>
              <li>{t('settings.billing.stepChoose')}</li>
              <li>{t('settings.billing.stepProof')}</li>
              <li>{t('settings.billing.stepConfirm')}</li>
            </ol>
          </div>
          <p className={styles.hint}>
            {t('settings.billing.priceIntro')} {outletCount}.{' '}
            {suggested &&
              `${t('settings.billing.recommendation')} ${PLANS[suggested].name}.`}
          </p>
          {/* Pemilih termin. Radiogroup, bukan sekadar tombol: ini satu
              pilihan dari tiga yang saling meniadakan, dan pembaca layar
              harus mendengarnya begitu. */}
          <div
            className={styles.termBar}
            role="radiogroup"
            aria-label={t('settingsPage.terminPembayaran')}
          >
            {BILLING_TERM_IDS.map((id) => {
              const termDef = BILLING_TERMS[id];
              const active = term === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={[styles.termBtn, active ? styles.termBtnActive : ''].join(' ')}
                  onClick={() => setTerm(id)}
                >
                  {termDef.label}
                  {termDef.multiplier < 1 && (
                    <span className={styles.termSave}>
                      &minus;{Math.round((1 - termDef.multiplier) * 100)}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={styles.planGrid}>
            {PAID_TIERS.map((tier) => {
              const def = PLANS[tier];
              const fits = withinOutletQuota(tier, outletCount);
              const isRec = suggested === tier;
              const base =
                tier === 'enterprise'
                  ? priceForOutlets(outletCount)
                  : def.priceMonthly;
              const rate = monthlyRateForTerm(base, term);
              const saving = savingForTerm(base, term);
              return (
                <div
                  key={tier}
                  className={[styles.planCard, isRec ? styles.planCardRec : ''].join(' ')}
                >
                  <span className={styles.planSpine} aria-hidden />
                  {isRec && <span className={styles.planRecTag}>{t('settingsPage.disarankan')}</span>}
                  <strong className={styles.planCardName}>{def.name}</strong>
                  <span className={styles.planPrice}>{fmtRp(rate)}/bln</span>
                  {saving > 0 && (
                    <span className={styles.planTermTotal}>
                      {fmtRp(totalForTerm(base, term))} di muka · hemat{" "}
                      {fmtRp(saving)}
                    </span>
                  )}
                  <small className={styles.planQuota}>
                    {def.maxOutlets < 0
                      ? t('settingsPage.unlimitedOutlets')
                      : `s/d ${def.maxOutlets} outlet`}{' '}
                    ·{' '}
                    {def.maxUsers < 0 ? 'user tak terbatas' : `${def.maxUsers} pengguna`}
                  </small>
                  <Button
                    variant={isRec ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={!fits}
                    onClick={() => requestPayment(tier)}
                    iconLeft={fits ? <Icon name="whatsapp" aria-hidden /> : undefined}
                  >
                    {fits
                      ? t('settings.billing.requestViaWhatsapp')
                      : t('settings.billing.outletExceeded')}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {paymentHistory.length > 0 && (
        <Card glass>
          <CardHeader
            icon={<Icon name="receipt" aria-hidden />}
            title={t('settings.billing.history')}
          />
          <CardBody className={styles.noPad}>
            {/* Receipt tape — thermal-print language, shared with POS/Keuangan. */}
            <div className={styles.tape}>
              {paymentHistory.map((inv) => (
                <div
                  key={inv.id}
                  className={[styles.tapeRow, invoiceTone(inv.status)].join(' ')}
                >
                  <div className={styles.tapeInfo}>
                    <strong className={styles.tapePlan}>
                      {PLANS[inv.plan as PlanType]?.name ?? inv.plan}
                    </strong>
                    <span className={styles.tapeDate}>
                      {new Date(inv.createdAt).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                  <div className={styles.tapeRight}>
                    <span className={styles.tapeAmount}>{fmtRp(inv.amount)}</span>
                    <span
                      className={[styles.tapeStatus, invoiceTone(inv.status)].join(' ')}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
}


function WalletTab({ wallets, outlets }: { wallets: Wallet[]; outlets: Outlet[] }) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  // Kuota wallet (Solo 2, Pro 99) sudah lama ada di plans.ts tapi tidak
  // pernah dibaca siapa pun. Dicek di sini terhadap jumlah SESUDAH
  // penambahan, sama seperti kuota pengguna dan outlet.
  const walletPlan = useSessionStore((s) => s.org?.planType ?? 'trial');
  const canAddWallet = withinWalletQuota(walletPlan, wallets.length + 1);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  // Hybrid wallet (OQ Q2): a wallet is either shared org-wide (null) or tied
  // to a specific branch. '' = Bersama (shared).
  const [outletId, setOutletId] = useState('');
  // Uang fisik di laci: kembalian Kasir selalu diambil dari wallet ini (0095).
  const [isCash, setIsCash] = useState(false);
  // Transfer sub-action: move funds between two wallets.
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [adding, setAdding] = useState(false);

  const outletName = (id: string | null) =>
    id ? (outlets.find((o) => o.id === id)?.name ?? t('settingsPage.cabang')) : t('settingsPage.bersama');

  const add = async () => {
    if (!canAddWallet)
      return toast.error(
        interpolate(t('settingsPage.walletQuota'), { n: String(PLANS[walletPlan].maxWallets) }),
      );
    if (!name.trim()) return toast.error(t('settingsPage.namaWalletWajibDiisi'));
    if (adding) return;
    setAdding(true);
    const now = new Date().toISOString();
    const initial = parseRpInput(balance);
    try {
      const walletId = newId();
      // Wallet SELALU lahir bersaldo nol. Saldo awal adalah uang yang benar-benar
      // masuk ke kas, jadi ia dicatat sebagai setoran Modal — dulu angkanya
      // langsung ditulis ke saldo dan Buku Kas tak pernah bisa menjelaskan
      // dari mana uang itu datang.
      await repository.put('wallets', {
        id: walletId,
        orgId,
        outletId: outletId || null,
        name: name.trim(),
        balance: 0,
        sortOrder: wallets.length,
        isCash,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      if (initial > 0) {
        await createFinanceEntry({
          orgId,
          kind: 'income',
          date: localDateStr(),
          category: 'Modal',
          amount: initial,
          walletId,
          description: `Saldo awal ${name.trim()}`,
          outletId: outletId || null,
        });
      }
      toast.success(
        initial > 0 ? t('settingsPage.walletAddedModal') : t('settingsPage.walletAdded'),
      );
      setName('');
      setBalance('');
      setOutletId('');
      setIsCash(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.walletAddFailed'));
    } finally {
      setAdding(false);
    }
  };

  const doTransfer = async () => {
    const amount = parseRpInput(transferAmount);
    const from = wallets.find((w) => w.id === fromId);
    const to = wallets.find((w) => w.id === toId);
    if (!from || !to) return toast.error(t('settingsPage.pilihWalletAsalTujuan'));
    setTransferring(true);
    try {
      // Jalur yang sama dengan Buku Kas (0086): validasi kembar server, RPC di
      // cloud, tabel wallet_transfers + log di lokal.
      await createTransfer({ wallets, fromWalletId: fromId, toWalletId: toId, amount, note: '' });
      toast.success(interpolate(t('settingsPage.transferDone'), { amount: fmtRp(amount), from: from.name, to: to.name }));
      setTransferAmount('');
      setFromId('');
      setToId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.transferFailed'));
    } finally {
      setTransferring(false);
    }
  };


  return (
    <Card glass>
      <CardHeader icon={<Icon name="wallet" aria-hidden />} title={t('settingsPage.walletKas')} />
      <CardBody>
        <p className={styles.hint}>
          Kas bisa <strong>{t('settingsPage.bersama')}</strong> (dipakai semua cabang) atau dikhususkan ke
          satu cabang. Saat transaksi, hanya kas bersama + kas cabang aktif yang tampil.
        </p>
        <ul className={styles.walletList}>
          {wallets.map((w) => (
            <WalletRow key={w.id} wallet={w} outletLabel={outletName(w.outletId)} outlets={outlets} />
          ))}
        </ul>
        <div className={styles.addRow}>
          <Input
            placeholder={t('settingsPage.namaWallet')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder={t('settingsPage.saldoAwal')}
            value={balance}
            onChange={(e) => setBalance(fmtRpInput(e.target.value))}
          />
          {outlets.length > 0 && (
            <Select
              aria-label={t('settingsPage.cabangWallet')}
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              options={[
                { value: '', label: 'Bersama (semua cabang)' },
                ...outlets.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          )}
          <Button
            onClick={add}
            loading={adding}
            disabled={!canAddWallet}
            iconLeft={<Icon name="plus" aria-hidden />}
          >
            {t('settingsPage.tambah')}
          </Button>
        </div>
        <label className={styles.columnOption}>
          <input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />
          <span className={styles.columnText}>
            <strong>{t('settingsPage.uangTunaiLaci')}</strong>
            <small>{t('settingsPage.kembalianKasirSelaluDiambil')}</small>
          </span>
        </label>
        {!canAddWallet && (
          <ProNotice>
            Paket ini dibatasi {PLANS[walletPlan].maxWallets} wallet. Pro membuka wallet
            terpisah untuk tiap rekening, kasir, dan cabang.
          </ProNotice>
        )}

        {wallets.length >= 2 && (
          <div className={styles.tplGroup}>
            <span className={styles.tplLabel}>{t('settingsPage.transferSaldoAntarWallet')}</span>
            <p className={styles.tplHint}>
              {t('settingsPage.pPindahkanSaldoAntarKas')}
            </p>
            <div className={styles.addRow}>
              <Select
                aria-label={t('settingsPage.walletAsal')}
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                options={wallets.map((w) => ({
                  value: w.id,
                  label: `${w.name} (${fmtRp(w.balance)})`,
                }))}
                placeholder={t('settingsPage.dariWallet')}
              />
              <Select
                aria-label={t('settingsPage.walletTujuan')}
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                options={wallets
                  .filter((w) => w.id !== fromId)
                  .map((w) => ({ value: w.id, label: w.name }))}
                placeholder={t('settingsPage.keWallet')}
              />
              <Input
                placeholder={t('settingsPage.nominal')}
                value={transferAmount}
                onChange={(e) => setTransferAmount(fmtRpInput(e.target.value))}
              />
              <Button
                onClick={doTransfer}
                disabled={transferring}
                iconLeft={<Icon name="arrow-right-arrow-left" aria-hidden />}
              >
                {t('settingsPage.transfer')}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Satu baris wallet: ganti nama dan hapus. Sebelumnya kas hanya bisa DITAMBAH —
 * salah ketik nama menetap selamanya, dan kas yang tak dipakai lagi tetap
 * muncul di setiap form pembayaran. Penghapusan dijaga server (0077): kas yang
 * masih memegang saldo atau masih dipakai baris kas tidak boleh hilang.
 */
function WalletRow({ wallet, outletLabel, outlets }: { wallet: Wallet; outletLabel: string; outlets: Outlet[] }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(wallet.name);
  const [outletId, setOutletId] = useState(wallet.outletId ?? '');
  const [isCash, setIsCash] = useState(!!wallet.isCash);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const rename = async () => {
    if (!name.trim()) return toast.error(t('settingsPage.namaWalletWajibDiisi'));
    setBusy(true);
    try {
      await repository.put('wallets', {
        ...wallet,
        name: name.trim(),
        // Cabang & tunai bisa diatur belakangan — wallet lama lahir "Bersama".
        outletId: outletId || null,
        isCash,
        updatedAt: new Date().toISOString(),
      });
      toast.success(t('settingsPage.walletDiperbarui'));
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.walletRenameFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirm(false);
    // Cermin penjagaan server, supaya alasannya muncul sebelum permintaan dikirim.
    if (wallet.balance !== 0) {
      return toast.error(
        `"${wallet.name}" masih memegang ${fmtRp(wallet.balance)}. Pindahkan saldonya dulu lewat transfer.`,
      );
    }
    setBusy(true);
    try {
      await repository.remove('wallets', wallet.id);
      toast.success(t('settingsPage.walletDihapus'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.walletDeleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.walletItem}>
      {editing ? (
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={interpolate(t('settingsPage.walletNameOf'), { name: wallet.name })}
          />
          {outlets.length > 0 && (
            <Select
              aria-label={interpolate(t('settingsPage.walletBranchOf'), { name: wallet.name })}
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              options={[
                { value: '', label: 'Bersama (semua cabang)' },
                ...outlets.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          )}
          <label className={styles.columnOption}>
            <input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />
            <span className={styles.columnText}>
              <strong>{t('settingsPage.uangTunaiLaci')}</strong>
            </span>
          </label>
          <span className={styles.itemActions}>
            <Button size="sm" onClick={rename} loading={busy}>
              {t('settingsPage.simpan')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setName(wallet.name);
                setOutletId(wallet.outletId ?? '');
                setIsCash(!!wallet.isCash);
                setEditing(false);
              }}
            >
              {t('settingsPage.batal')}
            </Button>
          </span>
        </>
      ) : (
        <>
          <span>
            {wallet.name}
            <Badge tone={wallet.outletId ? 'info' : 'neutral'}>{outletLabel}</Badge>
            {wallet.isCash && <Badge tone="success">{t('settingsPage.tunai')}</Badge>}
          </span>
          <strong>{fmtRp(wallet.balance)}</strong>
          <span className={styles.itemActions}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              iconLeft={<Icon name="pen" aria-hidden />}
            >
              {t('settingsPage.ubah')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirm(true)}
              disabled={busy}
              iconLeft={<Icon name="trash" aria-hidden />}
            >
              {t('settingsPage.hapus')}
            </Button>
          </span>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={t('settingsPage.hapusWallet')}
        message={`"${wallet.name}" akan dihapus. Hanya bisa dihapus bila saldonya nol dan belum pernah dipakai di pemasukan atau pengeluaran.`}
        confirmLabel={t('settingsPage.hapus')}
        danger
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </li>
  );
}

function OutletTab({ outlets }: { outlets: Outlet[] }) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const plan = useSessionStore((s) => s.org?.planType ?? 'trial');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!name.trim()) return toast.error(t('settingsPage.namaOutletWajibDiisi'));
    // Enforce the plan's outlet limit client-side (mirrors TeamTab's seat check).
    // `outlets` already includes the primary row, so the count after adding is
    // outlets.length + 1.
    if (!withinOutletQuota(plan, outlets.length + 1)) {
      return toast.error(
        interpolate(t('settingsPage.outletQuota'), { plan: PLANS[plan].name, n: String(PLANS[plan].maxOutlets) }),
      );
    }
    if (adding) return;
    setAdding(true);
    const now = new Date().toISOString();
    try {
      await repository.put('outlets', {
        id: newId(),
        orgId,
        outletId: null,
        name: name.trim(),
        address: address.trim(),
        isPrimary: outlets.length === 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      toast.success(t('settingsPage.outletDitambahkan'));
      setName('');
      setAddress('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.outletAddFailed'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="shop" aria-hidden />} title={t('settingsPage.outletCabang')} />
      <CardBody>
        {outlets.length === 0 ? (
          <EmptyState
            icon={<Icon name="shop" aria-hidden />}
            title={t('settingsPage.belumAdaOutletTambahan')}
            description={t('settingsPage.outletUtamaDigunakanSecara')}
          />
        ) : (
          <ul className={styles.list}>
            {outlets.map((o) => (
              <OutletRow key={o.id} outlet={o} />
            ))}
          </ul>
        )}
        <div className={styles.addRow}>
          <Input
            placeholder={t('settingsPage.namaOutlet')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder={t('settingsPage.alamat')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button
            onClick={add}
            loading={adding}
            iconLeft={<Icon name="plus" aria-hidden />}
          >
            {t('settingsPage.tambah')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * One outlet row with an expandable geofence editor. Setting coordinates +
 * radius turns on GPS-validated attendance for that outlet; leaving them empty
 * keeps clock-in unrestricted. "Gunakan lokasi saya" fills lat/lng from the
 * device GPS (owner is expected to set it while physically at the outlet).
 */
function OutletRow({ outlet }: { outlet: Outlet }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(outlet.lat != null ? String(outlet.lat) : '');
  const [lng, setLng] = useState(outlet.lng != null ? String(outlet.lng) : '');
  const [radius, setRadius] = useState(
    outlet.geofenceRadiusM != null ? String(outlet.geofenceRadiusM) : '100',
  );
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  // Nama & alamat cabang dulu tidak bisa diubah sama sekali setelah dibuat,
  // dan cabang yang tutup tidak bisa dihapus — keduanya menetap di semua
  // pemilih cabang selamanya.
  const [name, setName] = useState(outlet.name);
  const [address, setAddress] = useState(outlet.address ?? '');
  const [confirm, setConfirm] = useState(false);

  const geofenceOn =
    outlet.lat != null && outlet.lng != null && (outlet.geofenceRadiusM ?? 0) > 0;

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setLat(pos.lat.toFixed(6));
      setLng(pos.lng.toFixed(6));
      const radN = Number(radius) || 0;
      // Akurasi yang lebih lebar dari radius berarti titik ini bisa meleset
      // keluar pagar — dikatakan sekarang, bukan setelah absensi ditolak.
      if (radN > 0 && pos.accuracyM > radN) {
        toast.warning(
          interpolate(t('settingsPage.gpsWide'), { acc: String(Math.round(pos.accuracyM)), radius: String(radN) }),
        );
      } else {
        toast.success(interpolate(t('settingsPage.locationFound'), { acc: String(Math.round(pos.accuracyM)) }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    const latN = lat.trim() === '' ? null : Number(lat);
    const lngN = lng.trim() === '' ? null : Number(lng);
    const radN = radius.trim() === '' ? null : Math.round(Number(radius));
    if (latN != null && (Number.isNaN(latN) || latN < -90 || latN > 90)) {
      return toast.error(t('settingsPage.latitudeTidakValid90'));
    }
    if (lngN != null && (Number.isNaN(lngN) || lngN < -180 || lngN > 180)) {
      return toast.error(t('settingsPage.longitudeTidakValid180'));
    }
    if (radN != null && (Number.isNaN(radN) || radN <= 0)) {
      return toast.error(t('settingsPage.radiusHarusLebihDari'));
    }
    // Radius sebesar satu kota bukan pagar: ia meloloskan siapa pun sambil
    // tetap terlihat seperti penjagaan.
    if (radN != null && radN > MAX_GEOFENCE_M) {
      return toast.error(
        interpolate(t('settingsPage.radiusMax'), { max: MAX_GEOFENCE_M.toLocaleString('id-ID') }),
      );
    }
    if (!name.trim()) return toast.error(t('settingsPage.namaCabangWajibDiisi'));
    setBusy(true);
    try {
      await repository.put('outlets', {
        ...outlet,
        name: name.trim(),
        address: address.trim(),
        lat: latN,
        lng: lngN,
        geofenceRadiusM: radN,
        updatedAt: new Date().toISOString(),
      });
      toast.success(t('settingsPage.cabangDisimpan'));
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.geofenceFailed'));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await repository.put('outlets', {
        ...outlet,
        lat: null,
        lng: null,
        geofenceRadiusM: null,
        updatedAt: new Date().toISOString(),
      });
      setLat('');
      setLng('');
      setRadius('100');
      toast.success(t('settingsPage.geofenceDimatikanAbsensiBebas'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.geofenceOffFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.outletItem}>
      <div className={styles.listItem}>
        <span className={styles.avatar}>
          <Icon name="shop" aria-hidden />
        </span>
        <div className={styles.itemInfo}>
          <strong>{outlet.name}</strong>
          <small>{outlet.address || '—'}</small>
        </div>
        {geofenceOn && (
          <Badge tone="success">
            <Icon name="map-pin" aria-hidden /> {outlet.geofenceRadiusM}m
          </Badge>
        )}
        {outlet.isPrimary && <Badge tone="brand">{t('settingsPage.utama')}</Badge>}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          iconLeft={<Icon name="map-pin" aria-hidden />}
        >
          {open ? t('settingsPage.tutup') : t('settingsPage.geofence')}
        </Button>
      </div>

      {open && (
        <div className={styles.geofenceBox}>
          <div className={styles.geofenceRow}>
            <Input label={t('settingsPage.namaCabang')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label={t('settingsPage.alamat')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <p className={styles.geofenceHint}>
            <Icon name="info-circle" aria-hidden /> Isi koordinat + radius untuk
            mewajibkan absensi dari lokasi outlet. Kosongkan untuk absensi bebas lokasi.
            Set saat Anda sedang berada di outlet. Radius maksimal{' '}
            {MAX_GEOFENCE_M.toLocaleString('id-ID')} m.
          </p>
          <div className={styles.geofenceRow}>
            <Input
              label={t('settingsPage.latitude')}
              placeholder="-6.200000"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <Input
              label={t('settingsPage.longitude')}
              placeholder="106.816666"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
            <Input
              label={t('settingsPage.radiusM')}
              type="number"
              placeholder="100"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            />
          </div>
          <div className={styles.geofenceActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={useMyLocation}
              loading={locating}
              iconLeft={<Icon name="map-pin" aria-hidden />}
            >
              {t('settingsPage.gunakanLokasiSaya')}
            </Button>
            <span className={styles.geofenceSpacer} />
            {!outlet.isPrimary && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirm(true)}
                disabled={busy}
                iconLeft={<Icon name="trash" aria-hidden />}
              >
                {t('settingsPage.hapusCabang')}
              </Button>
            )}
            {geofenceOn && (
              <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
                {t('settingsPage.matikan')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={save}
              loading={busy}
              iconLeft={<Icon name="check" aria-hidden />}
            >
              {t('settingsPage.simpan')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title={t('settingsPage.hapusCabang2')}
        message={`"${outlet.name}" akan dihapus. Hanya bisa dihapus bila belum pernah dipakai transaksi, absensi, kas, atau penugasan anggota — cabang utama tidak bisa dihapus.`}
        confirmLabel={t('settingsPage.hapus')}
        danger
        onConfirm={async () => {
          setConfirm(false);
          setBusy(true);
          try {
            await repository.remove('outlets', outlet.id);
            toast.success(t('settingsPage.cabangDihapus'));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('settingsPage.branchDeleteFailed'));
          } finally {
            setBusy(false);
          }
        }}
        onCancel={() => setConfirm(false)}
      />
    </li>
  );
}

/** CSV export of each major dataset. Owner-only (includes finance + PII). */
function ExportDataCard() {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);

  // Ekspor data adalah portabilitas: fitur Pro, dan sengaja juga dikunci
  // selama Trial supaya masa coba tidak jadi jalan memanen data lalu pergi.
  const canExport = useFeature('exportImport');
  const onExport = async (key: string, label: string) => {
    if (!canExport) return;
    setBusy(key);
    try {
      const def = DATASETS.find((d) => d.key === key);
      if (!def) return;
      const csv = await def.toCsv();
      downloadCsv(def.label, csv);
      toast.success(interpolate(t('settingsPage.exported'), { label }));
    } catch {
      toast.error(t('settingsPage.gagalMengeksporData'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card glass>
      <CardHeader
        icon={<Icon name="download" aria-hidden />}
        title={t('settingsPage.exportData')}
        action={canExport ? undefined : <ProBadge />}
      />
      <CardBody>
        <p className={styles.dangerNote}>
          {t('settingsPage.pUnduhDataSebagaiCsv')}
        </p>
        {!canExport && (
          <ProNotice>
            {t('settingsPage.eksporCsvMembuatData')}
          </ProNotice>
        )}
        <div className={styles.exportGrid}>
          {DATASETS.map((d) => (
            <button
              key={d.key}
              className={styles.exportBtn}
              onClick={() => onExport(d.key, d.label)}
              disabled={busy !== null || !canExport}
            >
              <Icon name={d.icon} aria-hidden />
              <span>{busy === d.key ? 'Menyiapkan…' : d.label}</span>
              <Icon name="download" aria-hidden />
            </button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Full JSON backup + restore (local-first). Owner-only because a backup
 * contains ALL data (finance + customer PII). Unlike CSV export, the JSON is
 * lossless and restorable. Restore is REPLACE semantics and disabled in cloud
 * mode (rely on Supabase backups/PITR there).
 */
function BackupCard() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const cloud = isSupabaseConfigured;
  const isDemo = Boolean(org?.isDemo);
  // Backup JSON = SELURUH data dalam format lossless, jadi dikunci selama Trial
  // bersama ekspor CSV — kalau tidak, gerbang CSV tidak menjaga apa pun. Hanya
  // Trial: toko yang ditangguhkan tetap harus bisa membawa datanya keluar.
  // Restore tetap terbuka; memulihkan ke toko sendiri bukan membawa data pergi.
  const canBackup = (org?.planType ?? 'trial') !== 'trial';
  // Restore is available to every owner (this whole page is owner-only). The
  // server RPC restore_org_data (migration 0020) enforces owner + forces
  // org_id, so an owner can only ever replace THEIR OWN org's data.
  const canRestore = true;
  const frequency = useBackupStore((s) => s.frequency);
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt);
  const setFrequency = useBackupStore((s) => s.setFrequency);
  const markBackedUp = useBackupStore((s) => s.markBackedUp);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  // Jumlah data di file yang menunggu konfirmasi. Dialog dulu memakai
  // kalimat statis yang tidak pernah menyebut isi file, padahal
  // countRecords() sudah ada dan diuji — hanya tidak pernah dipanggil.
  const [pendingCount, setPendingCount] = useState(0);

  // Satu pintu masuk untuk kedua sumber file (unggahan & backup cloud):
  // validasi DULU, laporkan kegagalannya saat itu juga, dan baru buka
  // dialog kalau filenya benar-benar bisa dipulihkan. Sebelumnya file
  // rusak atau kosong tetap membuka dialog merah "SEMUA data akan
  // DIGANTI", dan baru gagal setelah pengguna menekan Pulihkan.
  const stageRestore = (text: string) => {
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setPendingCount(countRecords(parsed.backup));
    setPendingText(text);
  };
  const [restoring, setRestoring] = useState(false);
  // Backup otomatis (server-scheduled) — hanya ada di mode cloud.
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [lastRun, setLastRun] = useState<BackupRun | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  // Email backup mingguan (0085). Tanpa nilai = aktif; hanya `false` mematikan.
  const emailOn = useSessionStore((s) => s.org?.settings?.backupEmail !== false);
  const [lastEmail, setLastEmail] = useState<BackupEmailRun | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    if (!cloud || !org?.id) return;
    let cancelled = false;
    void (async () => {
      // setState-nya di dalam closure async, bukan di badan effect: yang
      // sinkron memicu render bertingkat (react-hooks/set-state-in-effect).
      setLoadingCloud(true);
      try {
        const [files, run, mail] = await Promise.all([
          listCloudBackups(org.id),
          latestBackupRun(org.id),
          latestBackupEmail(org.id).catch(() => null),
        ]);
        if (cancelled) return;
        setCloudBackups(files);
        setLastRun(run);
        setLastEmail(mail);
      } catch {
        // Kegagalan memuat daftar tidak boleh melumpuhkan kartu ini —
        // backup manual tetap harus bisa dijalankan.
      } finally {
        if (!cancelled) setLoadingCloud(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloud, org?.id]);

  // Memulihkan dari salinan cloud memakai JALUR YANG SAMA dengan file
  // lokal: ambil teksnya, lalu masuk ke dialog konfirmasi yang sudah ada.
  // Satu format, satu jalur restore, satu tempat yang bisa salah.
  const restoreFromCloud = async (backup: CloudBackup) => {
    if (demoGuard('Restore tersedia di FixMaster versi penuh — daftar gratis.')) return;
    try {
      stageRestore(await readCloudBackup(backup.path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settingsPage.backupReadFailed'));
    }
  };

  const toggleBackupEmail = async () => {
    setSavingEmail(true);
    try {
      await setBackupEmail(!emailOn);
      toast.success(emailOn ? t('settingsPage.backupEmailOff') : t('settingsPage.backupEmailOn'));
    } catch {
      toast.error(t('settingsPage.gagalMenyimpanPengaturan'));
    } finally {
      setSavingEmail(false);
    }
  };

  const handleBackup = async () => {
    if (!canBackup) return;
    if (demoGuard('Backup tersedia di FixMaster versi penuh — daftar gratis.')) return;
    setBusy(true);
    try {
      const backup = await createBackup(org?.id ?? null);
      downloadBackup(backup);
      markBackedUp();
      // Waktunya juga disimpan di baris organisasi: "kapan terakhir toko ini
      // di-backup" adalah fakta tentang TOKO, bukan tentang browser ini.
      await setLastBackupAt(new Date().toISOString()).catch(() => {
        /* pengingat lokal sudah tercatat; sinkronisasi bukan syarat backup */
      });
      toast.success(t('settingsPage.backupBerhasilDiunduh'));
    } catch {
      toast.error(t('settingsPage.gagalMembuatBackup'));
    } finally {
      setBusy(false);
    }
  };

  // Read the picked file's text, then open the replace-confirm dialog.
  const onPickFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file later
    if (!file) return;
    try {
      stageRestore(await file.text());
    } catch {
      toast.error(t('settingsPage.gagalMembacaFile'));
    }
  };

  const handleRestore = async () => {
    if (demoGuard('Pulihkan data tersedia di FixMaster versi penuh — daftar gratis.'))
      return;
    if (pendingText === null) return;
    setRestoring(true);
    try {
      const res = await restoreBackup(pendingText);
      if (res.ok) {
        toast.success(interpolate(t('settingsPage.restored'), { n: String(res.restored) }));
        setTimeout(() => window.location.reload(), 900);
      } else {
        toast.error(res.error);
      }
    } finally {
      setRestoring(false);
      setPendingText(null);
    }
  };

  // Waktu dari baris organisasi menang: ia berlaku untuk seluruh toko, bukan
  // hanya browser yang sedang dipakai.
  const sharedBackupAt = getLastBackupAt();
  const backupHint = sharedBackupAt
    ? interpolate(t('settingsPage.lastBackupShop'), { at: new Date(sharedBackupAt).toLocaleString('id-ID') })
    : lastBackupAt
      ? interpolate(t('settingsPage.lastBackupDevice'), { at: new Date(lastBackupAt).toLocaleString('id-ID') })
      : t('settingsPage.neverBackedUp');

  return (
    <Card glass>
      <CardHeader
        icon={<Icon name="clock-rotate-left" aria-hidden />}
        title={t('settingsPage.backupRestore')}
      />
      <CardBody>
        <p className={styles.dangerNote}>
          {t('settingsPage.pBackupMenyimpanSeluruhData')}
        </p>
        {!canBackup && (
          <ProNotice>
            {t('settingsPage.pBackupJsonMembawaSeluruh')}
          </ProNotice>
        )}
        <div className={styles.backupRow}>
          <Button
            onClick={handleBackup}
            loading={busy}
            disabled={!canBackup}
            iconLeft={<Icon name="download" aria-hidden />}
          >
            {t('settingsPage.backupSekarang')}
          </Button>
          {canRestore && (
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              iconLeft={<Icon name="clock-rotate-left" aria-hidden />}
            >
              {t('settingsPage.pulihkanDariFile')}
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onPickFile(e.currentTarget)}
            hidden
          />
        </div>
        {cloud && (
          <p className={styles.planNote}>
            <Icon name="info-circle" aria-hidden /> Restore mengganti SELURUH data
            operasional org ini dengan isi file. Tim, langganan, dan profil org TIDAK ikut
            diganti. Disarankan backup dulu sebelum memulihkan.
            {isDemo ? ' (Akun demo)' : ''}
          </p>
        )}
        {cloud && (
          <>
            <hr className={styles.dangerDivider} />
            <div className={styles.autoBackupHead}>
              <span className={styles.autoBackupLabel}>{t('settingsPage.backupOtomatis')}</span>
              {lastRun && (
                <span
                  className={styles.autoBackupStatus}
                  data-tone={lastRun.status === 'ok' ? 'ok' : 'failed'}
                >
                  <span className={styles.autoBackupLed} aria-hidden />
                  {lastRun.status === 'ok' ? 'Berjalan' : 'Gagal'}
                </span>
              )}
            </div>
            <p className={styles.planNote}>
              {t('settingsPage.pServerMembuatSalinanPenuh')}
            </p>
            {/* Kegagalan ditampilkan, bukan disembunyikan: backup yang diam-diam
                berhenti membuat pemilik merasa aman padahal tidak. */}
            {lastRun?.status === 'failed' && (
              <p className={styles.autoBackupError}>
                <Icon name="triangle-exclamation" aria-hidden /> Backup terakhir gagal
                pada {new Date(lastRun.startedAt).toLocaleString('id-ID')}
                {lastRun.error ? ` — ${lastRun.error}` : ''}
              </p>
            )}
            {loadingCloud && <p className={styles.planNote}>{t('settingsPage.memuatDaftar')}</p>}
            {!loadingCloud && cloudBackups.length === 0 && (
              <p className={styles.planNote}>
                {t('settingsPage.pBelumAdaSalinanOtomatis')}
              </p>
            )}
            {cloudBackups.length > 0 && (
              <ul className={styles.autoBackupList}>
                {cloudBackups.map((b) => (
                  <li key={b.path} className={styles.autoBackupItem}>
                    <span className={styles.autoBackupWhen}>
                      {b.createdAt
                        ? new Date(b.createdAt).toLocaleString('id-ID')
                        : b.name}
                    </span>
                    <span className={styles.autoBackupSize}>
                      {Math.max(1, Math.round(b.sizeBytes / 1024))} KB
                    </span>
                    <button
                      type="button"
                      className={styles.autoBackupAction}
                      onClick={() => void restoreFromCloud(b)}
                    >
                      {t('settingsPage.pulihkan')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {cloud && !isDemo && (
          <>
            <hr className={styles.dangerDivider} />
            <div className={styles.autoBackupHead}>
              <span className={styles.autoBackupLabel}>{t('settingsPage.emailBackupMingguan')}</span>
              <button
                type="button"
                role="switch"
                aria-checked={emailOn && canBackup}
                aria-label={t('settingsPage.emailBackupMingguan')}
                className={styles.channelSwitch}
                data-on={emailOn && canBackup}
                disabled={!canBackup || savingEmail}
                onClick={() => void toggleBackupEmail()}
              >
                <span className={styles.channelSwitchLed} aria-hidden />
                {emailOn && canBackup ? t('settingsPage.active') : t('settingsPage.off')}
              </button>
            </div>
            <p className={styles.planNote}>
              {t('settingsPage.backupEmailNote')}
            </p>
            {!canBackup ? (
              <p className={styles.planNote}>
                {t('settingsPage.mulaiDikirimSetelahToko')}
              </p>
            ) : (
              emailOn && (
                <p
                  className={
                    lastEmail?.status === 'failed' ? styles.autoBackupError : styles.planNote
                  }
                >
                  {backupEmailStatus(lastEmail)}
                </p>
              )
            )}
          </>
        )}
        {/* Pengingat untuk tombol yang terkunci hanya akan jadi omelan. */}
        {canBackup && (
          <>
            <hr className={styles.dangerDivider} />
            <Select
              label={t('settingsPage.pengingatBackupManualPerangkat')}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BackupFrequency)}
              options={[
                { value: 'off', label: t('settingsPage.inactive') },
                { value: 'daily', label: 'Harian' },
                { value: 'weekly', label: 'Mingguan' },
                { value: 'monthly', label: 'Bulanan' },
              ]}
              hint={backupHint}
            />
          </>
        )}
      </CardBody>

      <ConfirmDialog
        open={pendingText !== null}
        title={t('settingsPage.pulihkanDariBackup')}
        message={interpolate(t('settingsPage.restoreMsg'), { n: pendingCount.toLocaleString('id-ID') })}
        confirmLabel={t(restoring ? 'settingsPage.restoring' : 'settingsPage.confirmRestore')}
        danger
        onConfirm={handleRestore}
        onCancel={() => setPendingText(null)}
      />
    </Card>
  );
}

function SystemTab({ onReset, isOwner }: { onReset: () => void; isOwner: boolean }) {
  const t = useT();
  const cloud = isSupabaseConfigured;
  const isDemo = Boolean(useSessionStore((s) => s.org)?.isDemo);
  const signOut = useAuthStore((s) => s.signOut);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (demoGuard('Hapus akun dinonaktifkan di demo.')) return;
    setDeleting(true);
    try {
      // 1. Local mode: wipe the local DB. In cloud this is a deliberate no-op
      //    (multi-tenant safety) — the org data is erased server-side in step 2.
      await repository.clearAll();

      // 2. Delete the owner's business data AND auth credential via the
      //    privileged Edge Function (org cascade + deleteUser). It fails CLOSED:
      //    on any error nothing is deleted, so we must NOT claim success or sign
      //    out — keep the account intact and let the user retry.
      await deleteAccountCredential();

      await signOut();
      toast.success(t('settingsPage.akunSeluruhDataDihapus'));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('settingsPage.deleteAccountFailed'),
      );
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={styles.systemGrid}>
      {isOwner && <BackupCard />}

      {isOwner && <ExportDataCard />}

      {isOwner && (
        <Card glass accent="danger">
          <CardHeader
            icon={<Icon name="triangle-exclamation" aria-hidden />}
            title={t('settingsPage.zonaBerbahaya')}
          />
          <CardBody>
            <p className={styles.dangerNote}>
              {cloud
                ? t('settingsPage.resetCloudNote')
                : t('settingsPage.resetLocalNote')}
            </p>
            <Button
              variant="danger"
              onClick={onReset}
              iconLeft={<Icon name="trash" aria-hidden />}
            >
              {t('settingsPage.resetSeluruhData2')}
            </Button>

            {cloud && !isDemo && (
              <>
                <hr className={styles.dangerDivider} />
                <p className={styles.dangerNote}>
                  {t('settingsPage.deleteAccountNote')}
                </p>
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  iconLeft={<Icon name="trash" aria-hidden />}
                >
                  {t('settingsPage.hapusAkunPermanen')}
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('settingsPage.hapusAkunPermanen2')}
        message={t('settingsPage.semuaDataUsahaServis')}
        confirmLabel={deleting ? t('settingsPage.deleting') : t('settingsPage.confirmDeleteForever')}
        danger
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
