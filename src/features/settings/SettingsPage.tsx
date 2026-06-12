import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardBody, Button, Input, Badge, Select, EmptyState, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { getCurrentPosition } from '@/lib/geo';
import { newId } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { PLANS, roleAllows, PAID_TIERS, withinOutletQuota, outletTierFor, withinUserQuota, priceForOutlets } from '@/config/plans';
import { subscriptionPhase, daysUntil, phaseLabel, GRACE_DAYS } from '@/lib/business/billing';
import {
  getComplaintTemplates,
  setComplaintTemplates,
  getAccessoryTemplates,
  setAccessoryTemplates,
  getWarrantyServiceDays,
  setWarrantyServiceDays,
  getWarrantyPartsDays,
  setWarrantyPartsDays,
  getWarrantyPresets,
  setWarrantyPresets,
  getWaTemplateOverrides,
  setWaTemplateOverrides,
} from '@/config/orgConfig';
import {
  DEFAULT_WA_TEMPLATES,
  WA_TEMPLATE_LABELS,
  WA_TEMPLATE_VARS,
  type WaTemplateKey,
} from '@/lib/business/notify';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import { isValidInviteEmail } from '@/lib/business/team';
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
  startSubscription,
  applyPayment,
  cancelInvoice,
  listInvoices,
  subscribeOrgBilling,
  createPaymentInvoice,
  deleteAccountCredential,
  type PendingInvite,
  type Invoice,
} from '@/data/supabase-client';
import type { Wallet, Outlet, Role, PlanType } from '@/data/types';
import { DATASETS, downloadCsv } from './exportDatasets';
import { uploadOrgLogo, removeOrgLogo } from '@/data/storage';
import { useAuthStore } from '@/stores/auth';
import { createBackup, downloadBackup, restoreBackup } from './backupRestore';
import { useBackupStore } from '@/stores/backup';
import { type BackupFrequency } from '@/lib/business/backup';
import styles from './SettingsPage.module.css';

/**
 * Downscale a picked image to a square-ish data URL (max 256px) so the
 * logo stays small in storage and renders crisply in the sidebar.
 */
async function fileToLogoDataUrl(file: File): Promise<string> {
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
  const MAX = 256;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

type Tab = 'usaha' | 'operasional' | 'tim' | 'keuangan' | 'outlet' | 'langganan' | 'sistem';

export function SettingsPage() {
  const me = useSessionStore((s) => s.currentEmployee);
  const resetWorkspace = useSessionStore((s) => s.resetWorkspace);
  const isOwner = me ? roleAllows(me.role, '*') : false;

  const { data: wallets } = useCollection('wallets');
  const { data: outlets } = useCollection('outlets');
  const { data: employees } = useCollection('employees');

  const [tab, setTab] = useState<Tab>('usaha');
  const [confirmReset, setConfirmReset] = useState(false);

  const TABS: { id: Tab; label: string; icon: string; ownerOnly?: boolean; cloudOnly?: boolean }[] = [
    { id: 'usaha', label: 'Usaha', icon: 'fa-store' },
    { id: 'operasional', label: 'Operasional', icon: 'fa-sliders' },
    { id: 'tim', label: 'Tim', icon: 'fa-users', ownerOnly: true },
    { id: 'keuangan', label: 'Wallet', icon: 'fa-wallet', ownerOnly: true },
    { id: 'outlet', label: 'Outlet', icon: 'fa-shop', ownerOnly: true },
    { id: 'langganan', label: 'Langganan', icon: 'fa-crown', ownerOnly: true, cloudOnly: true },
    { id: 'sistem', label: 'Sistem', icon: 'fa-gear' },
  ];
  const visibleTabs = TABS.filter(
    (t) => (!t.ownerOnly || isOwner) && (!t.cloudOnly || isSupabaseConfigured),
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            className={[styles.tab, tab === t.id ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'usaha' && <BusinessTab />}
      {tab === 'operasional' && (
        <>
          <ServiceTemplatesCard />
          <WarrantyCard />
          <WhatsAppTemplatesCard />
        </>
      )}
      {tab === 'tim' && isOwner && <TeamTab employees={employees} outlets={outlets} />}
      {tab === 'keuangan' && isOwner && <WalletTab wallets={wallets} outlets={outlets} />}
      {tab === 'outlet' && isOwner && <OutletTab outlets={outlets} />}
      {tab === 'langganan' && isOwner && isSupabaseConfigured && <BillingTab outlets={outlets} />}
      {tab === 'sistem' && (
        <SystemTab
          onReset={() => {
            if (demoGuard('Reset data dinonaktifkan di demo. Pakai tombol "Reset Demo" di atas untuk mengembalikan data contoh.')) return;
            setConfirmReset(true);
          }}
          isOwner={isOwner}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset Seluruh Data?"
        message={
          isSupabaseConfigured
            ? 'SEMUA data operasional (servis, transaksi, stok, keuangan) akan dihapus permanen. Tim, langganan, dan profil usaha TETAP. Workspace jadi kosong. Tindakan ini tidak dapat dibatalkan.'
            : 'SEMUA data (servis, transaksi, stok, dll) akan dihapus permanen dan Anda kembali ke setup awal. Tindakan ini tidak dapat dibatalkan.'
        }
        confirmLabel="Ya, Reset Semua"
        danger
        onConfirm={async () => {
          await resetWorkspace();
          toast.success('Workspace direset');
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

function BusinessTab() {
  const org = useSessionStore((s) => s.org);
  const setOrg = useSessionStore((s) => s.setOrg);
  const [name, setName] = useState(org?.name ?? '');
  const [address, setAddress] = useState(org?.address ?? '');
  const [phone, setPhone] = useState(org?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!org) return;
    setBusy(true);
    const updated = { ...org, name: name.trim(), address: address.trim(), phone: phone.trim() };
    await repository.setSingleton('organization', updated);
    setOrg(updated);
    toast.success('Profil usaha disimpan');
    setBusy(false);
  };

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || !org) return;
    if (!file.type.startsWith('image/')) return toast.error('File harus berupa gambar');
    if (file.size > 2 * 1024 * 1024) return toast.error('Ukuran logo maksimal 2MB');
    try {
      // Downscale first (keeps both the upload and any local data URL small),
      // then hand the blob to storage: cloud uploads to the bucket and returns
      // a public URL; local mode returns a data URL (legacy behaviour).
      const downscaled = await fileToLogoDataUrl(file);
      const blob = await (await fetch(downscaled)).blob();
      const logoDataUrl = await uploadOrgLogo(org.id, blob);
      const updated = { ...org, logoDataUrl };
      await repository.setSingleton('organization', updated);
      setOrg(updated);
      toast.success('Logo diperbarui');
    } catch {
      toast.error('Gagal memproses gambar');
    }
  };

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
    toast.success('Logo dihapus');
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="store" aria-hidden />} title="Profil Usaha" />
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
              <strong>Logo Toko</strong>
              <small>PNG/JPG, maks 2MB. Tampil di sidebar &amp; struk.</small>
              <div className={styles.logoActions}>
                <Button
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  iconLeft={<Icon name="download" aria-hidden />}
                >
                  {org?.logoDataUrl ? 'Ganti Logo' : 'Unggah Logo'}
                </Button>
                {org?.logoDataUrl && (
                  <Button variant="ghost" onClick={removeLogo} iconLeft={<Icon name="trash" aria-hidden />}>
                    Hapus
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickLogo}
                hidden
              />
            </div>
          </div>
          <Input label="Nama Usaha" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Alamat" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Input label="No. Telepon" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button onClick={save} loading={busy}>Simpan Perubahan</Button>
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
  const [complaints, setComplaints] = useState<string[]>(() => getComplaintTemplates());
  const [accessories, setAccessories] = useState<string[]>(() => getAccessoryTemplates());

  const addComplaint = (value: string) => {
    const next = [...complaints, value];
    setComplaintTemplates(next);
    setComplaints(next);
  };
  const removeComplaint = (value: string) => {
    const next = complaints.filter((c) => c !== value);
    setComplaintTemplates(next);
    setComplaints(next);
  };
  const addAccessory = (value: string) => {
    const next = [...accessories, value];
    setAccessoryTemplates(next);
    setAccessories(next);
  };
  const removeAccessory = (value: string) => {
    const next = accessories.filter((a) => a !== value);
    setAccessoryTemplates(next);
    setAccessories(next);
  };

  return (
    <Card glass>
      <CardHeader
        icon={<Icon name="clipboard-list" aria-hidden />}
        title="Template Servis"
      />
      <CardBody>
        <p className={styles.tplHint}>
          Pilihan cepat keluhan &amp; kelengkapan saat membuat servis baru.
        </p>
        <StringListEditor
          label="Template Keluhan"
          placeholder="mis. Mati total"
          items={complaints}
          onAdd={addComplaint}
          onRemove={removeComplaint}
        />
        <StringListEditor
          label="Template Kelengkapan"
          placeholder="mis. Charger"
          items={accessories}
          onAdd={addAccessory}
          onRemove={removeAccessory}
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
}: {
  label: string;
  placeholder: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const commit = () => {
    const v = value.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.warning('Template sudah ada');
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
              <button onClick={() => onRemove(item)} aria-label={`Hapus ${item}`} title="Hapus">
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
        />
        <Button onClick={commit} iconLeft={<Icon name="plus" aria-hidden />}>Tambah</Button>
      </div>
    </div>
  );
}

/**
 * Default warranty lengths (service & parts) prefilled in StatusModal when a
 * job is finished, plus quick-pick duration presets. Stored in orgConfig.
 */
function WarrantyCard() {
  const [svcDays, setSvcDays] = useState(() => String(getWarrantyServiceDays()));
  const [partsDays, setPartsDays] = useState(() => String(getWarrantyPartsDays()));
  const [presets, setPresets] = useState<number[]>(() => getWarrantyPresets());
  const [presetInput, setPresetInput] = useState('');

  const saveDefaults = () => {
    setWarrantyServiceDays(Number(svcDays) || 0);
    setWarrantyPartsDays(Number(partsDays) || 0);
    toast.success('Default garansi disimpan');
  };

  const addPreset = () => {
    const n = Math.max(0, Math.round(Number(presetInput) || 0));
    if (!n) return toast.warning('Masukkan jumlah hari yang valid');
    if (presets.includes(n)) return toast.warning('Preset sudah ada');
    const next = [...presets, n].sort((a, b) => a - b);
    setWarrantyPresets(next);
    setPresets(next);
    setPresetInput('');
  };
  const removePreset = (n: number) => {
    const next = presets.filter((p) => p !== n);
    setWarrantyPresets(next);
    setPresets(next);
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="shield-halved" aria-hidden />} title="Garansi" />
      <CardBody>
        <p className={styles.tplHint}>
          Lama garansi default (hari) yang otomatis terisi saat servis ditandai <strong>selesai</strong>.
          Bisa diubah per servis.
        </p>
        <div className={styles.warrantyDefaults}>
          <Input
            label="Garansi Jasa (hari)"
            type="number"
            inputMode="numeric"
            value={svcDays}
            onChange={(e) => setSvcDays(e.target.value)}
          />
          <Input
            label="Garansi Sparepart (hari)"
            type="number"
            inputMode="numeric"
            value={partsDays}
            onChange={(e) => setPartsDays(e.target.value)}
          />
        </div>
        <Button onClick={saveDefaults}>Simpan Default</Button>

        <div className={styles.tplGroup}>
          <span className={styles.tplLabel}>Preset Durasi (quick-pick)</span>
          {presets.length > 0 && (
            <div className={styles.tplChips}>
              {presets.map((p) => (
                <span key={p} className={styles.tplChip}>
                  {p} hari
                  <button onClick={() => removePreset(p)} aria-label={`Hapus ${p} hari`} title="Hapus">
                    <Icon name="times" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={styles.addRow}>
            <Input
              placeholder="mis. 60"
              type="number"
              inputMode="numeric"
              value={presetInput}
              onChange={(e) => setPresetInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPreset()}
            />
            <Button onClick={addPreset} iconLeft={<Icon name="plus" aria-hidden />}>Tambah</Button>
          </div>
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
  const overrides = getWaTemplateOverrides();
  const keys = Object.keys(DEFAULT_WA_TEMPLATES) as WaTemplateKey[];
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of keys) init[k] = overrides[k] ?? DEFAULT_WA_TEMPLATES[k];
    return init;
  });

  const save = () => {
    const next: Record<string, string> = {};
    for (const k of keys) {
      const v = drafts[k]?.trim();
      // Only persist as override if it differs from default & is non-empty.
      if (v && v !== DEFAULT_WA_TEMPLATES[k]) next[k] = v;
    }
    setWaTemplateOverrides(next);
    toast.success('Template WhatsApp disimpan');
  };

  const resetKey = (k: WaTemplateKey) => {
    setDrafts((d) => ({ ...d, [k]: DEFAULT_WA_TEMPLATES[k] }));
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="whatsapp" aria-hidden />} title="Template WhatsApp" />
      <CardBody>
        <p className={styles.tplHint}>
          Variabel tersedia:{' '}
          {WA_TEMPLATE_VARS.map((v) => (
            <code key={v} className={styles.varChip}>{`{${v}}`}</code>
          ))}
        </p>
        {keys.map((k) => (
          <div key={k} className={styles.tplGroup}>
            <div className={styles.waHead}>
              <span className={styles.tplLabel}>{WA_TEMPLATE_LABELS[k]}</span>
              <button className={styles.waReset} onClick={() => resetKey(k)} type="button">
                Reset default
              </button>
            </div>
            <textarea
              className={styles.waTextarea}
              rows={3}
              value={drafts[k]}
              onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
            />
          </div>
        ))}
        <Button onClick={save}>Simpan Template</Button>
      </CardBody>
    </Card>
  );
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', karyawan: 'Karyawan' };

/**
 * Inline editor to assign a staff member to one or more branches (outlets).
 * Loads the current assignment on open, toggles chips, and replaces the set
 * via the set_member_outlets RPC. Empty selection = access to no specific
 * branch (only org-wide rows) once RLS is tightened — so we warn on empty.
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
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMemberOutlets(memberId)
      .then((ids) => {
        if (!cancelled) setSelected(ids);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Gagal memuat cabang'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setBusy(true);
    try {
      await setMemberOutlets(memberId, selected);
      toast.success('Penugasan cabang disimpan');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan cabang');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.outletEditor}>
      <div className={styles.outletEditorHead}>
        <strong>Cabang yang dapat diakses</strong>
        <small className={styles.hint}>Karyawan hanya melihat &amp; mengelola data cabang terpilih.</small>
      </div>
      {loading ? (
        <small className={styles.hint}>Memuat…</small>
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
          Tidak ada cabang terpilih — anggota ini tak akan melihat data transaksi cabang mana pun.
        </small>
      )}
      <div className={styles.addRow}>
        <Button variant="secondary" size="sm" onClick={onClose}>Tutup</Button>
        <Button size="sm" onClick={save} loading={busy}>Simpan</Button>
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
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const me = useSessionStore((s) => s.currentEmployee);
  const plan = useSessionStore((s) => s.org?.planType ?? 'trial');
  const { refetch } = useCollection('employees');

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('karyawan');
  // Outlets to assign on invite (empty = all, decided at claim time).
  const [inviteOutlets, setInviteOutlets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
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
    setInviteOutlets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const loadInvites = useCallback(async () => {
    if (!isSupabaseConfigured || !orgId) return;
    try {
      setInvites(await listPendingInvites(orgId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat undangan');
    }
  }, [orgId]);

  useEffect(() => {
    if (!isSupabaseConfigured || !orgId) return;
    let cancelled = false;
    listPendingInvites(orgId)
      .then((data) => {
        if (!cancelled) setInvites(data);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Gagal memuat undangan'),
      );
    return () => {
      cancelled = true;
    };
  }, [orgId]);

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
  const seatsUsed = employees.length + invites.length;
  const canInvite = withinUserQuota(plan, seatsUsed + 1);

  const invite = async () => {
    if (!canInvite)
      return toast.error('Paket Solo hanya untuk 1 pengguna. Upgrade ke Pro untuk menambah anggota tim.');
    if (!name.trim()) return toast.error('Nama wajib diisi');
    if (!isValidInviteEmail(email)) return toast.error('Email tidak valid');
    setBusy(true);
    try {
      await inviteMember({ orgId, email, name, role, outletIds: inviteOutlets });
      toast.success(`Undangan untuk ${email.trim()} dibuat`);
      setName('');
      setEmail('');
      setRole('karyawan');
      setInviteOutlets([]);
      await loadInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengundang');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await revokeInvite(id);
      await loadInvites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membatalkan undangan');
    }
  };

  const changeRole = async (memberId: string, newRole: Role) => {
    try {
      await setMemberRole(memberId, newRole);
      toast.success('Peran diperbarui');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah peran');
    }
  };

  const deactivate = async (memberId: string) => {
    setConfirmOff(null);
    try {
      await deactivateMember(memberId);
      toast.success('Anggota dinonaktifkan');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menonaktifkan');
    }
  };

  return (
    <>
      {isSupabaseConfigured && (
        <Card glass>
          <CardHeader icon={<Icon name="user-plus" aria-hidden />} title="Undang Anggota" />
          <CardBody>
            <p className={styles.hint}>
              Karyawan mendaftar sendiri dengan email yang diundang, lalu otomatis bergabung ke
              organisasi ini saat masuk pertama kali.
            </p>
            {!canInvite ? (
              <p className={styles.hint} role="note">
                Paket <strong>{PLANS[plan].name}</strong> hanya untuk 1 pengguna. Upgrade ke{' '}
                <strong>Pro</strong> untuk menambah anggota tim tanpa batas.
              </p>
            ) : (
              <div className={styles.inviteRow}>
                <Input placeholder="Nama" value={name} onChange={(e) => setName(e.target.value)} />
                <Input
                  placeholder="email@contoh.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <select
                  className={styles.roleSelect}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  aria-label="Peran"
                >
                  <option value="karyawan">Karyawan</option>
                  <option value="admin">Admin</option>
                </select>
                <Button onClick={invite} loading={busy} iconLeft={<Icon name="paper-plane-tilt" aria-hidden />}>
                  Undang
                </Button>
              </div>
            )}
            {canInvite && role === 'karyawan' && outlets.length > 0 && (
              <div className={styles.outletPick}>
                <span className={styles.tplLabel}>Tugaskan cabang (opsional)</span>
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
                  Kosongkan untuk akses semua cabang. Bisa diubah nanti per anggota.
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
                      <small>{ROLE_LABEL[inv.role]} · menunggu pendaftaran</small>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void revoke(inv.id)}
                      iconLeft={<Icon name="x" aria-hidden />}
                    >
                      Batalkan
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card glass>
        <CardHeader icon={<Icon name="users" aria-hidden />} title="Anggota Tim" />
        <CardBody className={styles.noPad}>
          <ul className={styles.list}>
            {employees.map((e) => {
              const isSelf = me?.id === e.id;
              return (
                <li key={e.id} className={styles.listItem}>
                  <span className={styles.avatar}>{e.name.charAt(0).toUpperCase()}</span>
                  <div className={styles.itemInfo}>
                    <strong>{e.name}</strong>
                    <small>{ROLE_LABEL[e.role]}</small>
                    {isSupabaseConfigured && e.role === 'karyawan' && outlets.length > 0 && (
                      <small className={styles.memberOutlets}>
                        <Icon name="shop" aria-hidden />{' '}
                        {(memberOutlets[e.id] ?? []).length === 0
                          ? 'Belum ada cabang'
                          : outlets
                              .filter((o) => (memberOutlets[e.id] ?? []).includes(o.id))
                              .map((o) => o.name)
                              .join(', ')}
                      </small>
                    )}
                  </div>
                  {isSupabaseConfigured && !isSelf && e.active ? (
                    <>
                      <select
                        className={styles.roleSelect}
                        value={e.role}
                        onChange={(ev) => void changeRole(e.id, ev.target.value as Role)}
                        aria-label={`Peran ${e.name}`}
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="karyawan">Karyawan</option>
                      </select>
                      {e.role === 'karyawan' && outlets.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditOutletsFor(editOutletsFor === e.id ? null : e.id)}
                          iconLeft={<Icon name="shop" aria-hidden />}
                        >
                          Cabang
                        </Button>
                      ) : (
                        outlets.length > 0 && (
                          // Model A: owner/admin (manager) selalu mencakup semua
                          // cabang (RLS is_org_manager), jadi penugasan outlet
                          // tak berlaku. Tampilkan label eksplisit, bukan tombol
                          // kosong, agar tak terkesan ada opsi yang hilang.
                          <span title="Owner & admin mencakup semua cabang">
                            <Badge tone="info">
                              <Icon name="boxes-stacked" aria-hidden /> Semua cabang
                            </Badge>
                          </span>
                        )
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmOff(e.id)}
                        iconLeft={<Icon name="user-minus" aria-hidden />}
                      >
                        Nonaktifkan
                      </Button>
                    </>
                  ) : (
                    <Badge tone={e.active ? 'success' : 'neutral'}>
                      {e.active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
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
        title="Nonaktifkan anggota?"
        message="Anggota tidak akan bisa masuk sampai diaktifkan kembali. Data terkait tetap utuh."
        confirmLabel="Nonaktifkan"
        danger
        onConfirm={() => confirmOff && void deactivate(confirmOff)}
        onCancel={() => setConfirmOff(null)}
      />
    </>
  );
}

function BillingTab({ outlets }: { outlets: Outlet[] }) {
  const org = useSessionStore((s) => s.org);
  const orgId = org?.id ?? '';
  const plan = (org?.planType ?? 'trial') as PlanType;
  const expiry = org?.planExpiredAt ?? null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [busy, setBusy] = useState(false);

  const phase = subscriptionPhase(expiry);
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
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Gagal memuat invoice'));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

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

  const reload = async () => {
    try {
      setInvoices(await listInvoices(orgId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memuat invoice');
    }
  };

  const subscribe = async (tier: PlanType) => {
    if (!withinOutletQuota(tier, outletCount)) {
      return toast.error(`Tier ${PLANS[tier].name} maksimal ${PLANS[tier].maxOutlets} outlet`);
    }
    setBusy(true);
    try {
      // Pro (enterprise) scales with outlet count: base covers 2 outlets,
      // +addon per extra, capped at the ceiling. Solo is a flat label price.
      const amount =
        tier === 'enterprise'
          ? priceForOutlets(outletCount)
          : parseAmount(PLANS[tier].priceLabel);
      try {
        // Real provider: create a Fersaku payment and open the hosted checkout
        // page (QRIS). Confirmation arrives via the webhook.
        const { link } = await createPaymentInvoice(tier, amount, window.location.href);
        window.open(link, '_blank', 'noopener');
        toast.success(`Invoice ${PLANS[tier].name} dibuat — selesaikan pembayaran di tab baru`);
      } catch {
        // Fallback (Edge Function not deployed yet): mock pending invoice,
        // confirmable manually via "Saya sudah bayar".
        await startSubscription(tier, amount);
        toast.success(`Invoice ${PLANS[tier].name} dibuat — selesaikan pembayaran`);
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat invoice');
    } finally {
      setBusy(false);
    }
  };

  const confirmPay = async (invoiceId: string) => {
    setBusy(true);
    try {
      await applyPayment(invoiceId);
      toast.success('Pembayaran diterima — langganan diperpanjang');
      await reload();
      // Refresh org plan in session (expiry/plan changed).
      const fresh = await repository.getSingleton('organization');
      if (fresh) useSessionStore.getState().setOrg(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses pembayaran');
    } finally {
      setBusy(false);
    }
  };

  const cancelPay = async (invoiceId: string) => {
    setBusy(true);
    try {
      await cancelInvoice(invoiceId);
      toast.success('Invoice dibatalkan');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membatalkan invoice');
    } finally {
      setBusy(false);
    }
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
  const chargePct = expiry ? Math.max(0, Math.min(100, Math.round(((days ?? 0) / 30) * 100))) : 100;
  const TICKS = 24;
  const filledTicks = Math.round((chargePct / 100) * TICKS);

  const invoiceTone = (status: string) =>
    status === 'paid' ? styles.tonePaid : status === 'pending' ? styles.tonePending : styles.toneVoid;

  const pendingInvoice = invoices.find((i) => i.status === 'pending');

  return (
    <>
      <Card glass>
        <CardHeader icon={<Icon name="crown" aria-hidden />} title="Status Langganan" />
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
                  <span className={styles.daysUnit}>hari</span>
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
                aria-label={`Sisa masa langganan ${chargePct}%`}
              >
                {Array.from({ length: TICKS }).map((_, i) => (
                  <span
                    key={i}
                    className={[styles.tick, i < filledTicks ? styles.tickOn : ''].join(' ')}
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
                  <>Masa tenggang hingga {GRACE_DAYS} hari setelah {new Date(expiry).toLocaleDateString('id-ID')}</>
                )
              ) : (
                <>Tanpa batas masa aktif</>
              )}
            </div>
          </div>

          {(phase === 'reminder' || phase === 'grace' || phase === 'expired') && (
            <p className={styles.billingBanner}>
              <Icon name="warning" aria-hidden />{' '}
              {phase === 'expired'
                ? 'Langganan kedaluwarsa. Perpanjang untuk membuka kembali operasi tulis.'
                : phase === 'grace'
                  ? 'Masa tenggang aktif. Segera bayar agar layanan tidak terhenti.'
                  : 'Langganan akan jatuh tempo. Perpanjang sekarang.'}
            </p>
          )}
        </CardBody>
      </Card>

      {pendingInvoice && (
        <Card glass>
          <CardHeader icon={<Icon name="qr-code" aria-hidden />} title="Selesaikan Pembayaran" />
          <CardBody>
            <div className={styles.payDock}>
              <span className={styles.payDockLabel}>Menunggu pembayaran</span>
              <span className={styles.payDockAmount}>{fmtRp(pendingInvoice.amount)}</span>
              <span className={styles.payDockPlan}>
                {PLANS[pendingInvoice.plan as PlanType]?.name ?? pendingInvoice.plan}
              </span>
            </div>
            {pendingInvoice.provider === 'mock' ? (
              <>
                <p className={styles.hint}>
                  Provider QRIS belum terhubung (mode mock). Konfirmasi manual untuk menguji alur
                  perpanjangan langganan.
                </p>
                <Button
                  onClick={() => void confirmPay(pendingInvoice.id)}
                  loading={busy}
                  iconLeft={<Icon name="check" aria-hidden />}
                >
                  Saya sudah bayar
                </Button>
              </>
            ) : (
              <>
                {pendingInvoice.qrisUrl && (
                  <a
                    className={styles.payLink}
                    href={pendingInvoice.qrisUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="up-right-from-square" aria-hidden /> Buka Halaman Pembayaran QRIS
                  </a>
                )}
                <p className={styles.hint}>
                  Langganan diperpanjang otomatis setelah pembayaran diterima. Halaman ini akan
                  diperbarui sendiri — tidak perlu konfirmasi manual.
                </p>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <Card glass>
        <CardHeader icon={<Icon name="tag" aria-hidden />} title="Pilih Paket" />
        <CardBody>
          <p className={styles.hint}>
            Harga per organisasi. Solo untuk 1 pengguna; Pro pengguna tak terbatas. Pro menyesuaikan
            jumlah outlet (kamu punya {outletCount}). {suggested && `Rekomendasi: ${PLANS[suggested].name}.`}
          </p>
          <div className={styles.planGrid}>
            {PAID_TIERS.map((tier) => {
              const def = PLANS[tier];
              const fits = withinOutletQuota(tier, outletCount);
              const isRec = suggested === tier;
              return (
                <div
                  key={tier}
                  className={[styles.planCard, isRec ? styles.planCardRec : ''].join(' ')}
                >
                  <span className={styles.planSpine} aria-hidden />
                  {isRec && <span className={styles.planRecTag}>Disarankan</span>}
                  <strong className={styles.planCardName}>{def.name}</strong>
                  <span className={styles.planPrice}>
                    {tier === 'enterprise'
                      ? `${fmtRp(priceForOutlets(outletCount))}/bln`
                      : def.priceLabel}
                  </span>
                  <small className={styles.planQuota}>
                    {def.maxOutlets < 0 ? 'Outlet tanpa batas' : `s/d ${def.maxOutlets} outlet`} ·{' '}
                    {def.maxUsers < 0 ? 'user tak terbatas' : `${def.maxUsers} pengguna`}
                  </small>
                  <Button
                    variant={isRec ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={!fits || busy}
                    onClick={() => void subscribe(tier)}
                  >
                    {fits ? 'Pilih' : 'Outlet melebihi'}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {invoices.length > 0 && (
        <Card glass>
          <CardHeader icon={<Icon name="receipt" aria-hidden />} title="Riwayat Invoice" />
          <CardBody className={styles.noPad}>
            {/* Receipt tape — thermal-print language, shared with POS/Keuangan. */}
            <div className={styles.tape}>
              {invoices.map((inv) => (
                <div key={inv.id} className={[styles.tapeRow, invoiceTone(inv.status)].join(' ')}>
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
                    <span className={[styles.tapeStatus, invoiceTone(inv.status)].join(' ')}>
                      {inv.status}
                    </span>
                    {inv.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void cancelPay(inv.id)}
                        loading={busy}
                        iconLeft={<Icon name="xmark" aria-hidden />}
                      >
                        Batalkan
                      </Button>
                    )}
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

/** Parse "Rp 49.000/bln" → 49000 for the invoice amount. */
function parseAmount(priceLabel: string): number {
  const digits = priceLabel.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function WalletTab({ wallets, outlets }: { wallets: Wallet[]; outlets: Outlet[] }) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  // Hybrid wallet (OQ Q2): a wallet is either shared org-wide (null) or tied
  // to a specific branch. '' = Bersama (shared).
  const [outletId, setOutletId] = useState('');

  const outletName = (id: string | null) =>
    id ? (outlets.find((o) => o.id === id)?.name ?? 'Cabang') : 'Bersama';

  const add = async () => {
    if (!name.trim()) return toast.error('Nama wallet wajib diisi');
    const now = new Date().toISOString();
    await repository.put('wallets', {
      id: newId(), orgId, outletId: outletId || null, name: name.trim(),
      balance: parseRpInput(balance), sortOrder: wallets.length,
      createdAt: now, updatedAt: now, deletedAt: null,
    });
    toast.success('Wallet ditambahkan');
    setName('');
    setBalance('');
    setOutletId('');
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="wallet" aria-hidden />} title="Wallet / Kas" />
      <CardBody>
        <p className={styles.hint}>
          Kas bisa <strong>Bersama</strong> (dipakai semua cabang) atau dikhususkan ke satu
          cabang. Saat transaksi, hanya kas bersama + kas cabang aktif yang tampil.
        </p>
        <ul className={styles.walletList}>
          {wallets.map((w) => (
            <li key={w.id} className={styles.walletItem}>
              <span>
                {w.name}
                <Badge tone={w.outletId ? 'info' : 'neutral'}>{outletName(w.outletId)}</Badge>
              </span>
              <strong>{fmtRp(w.balance)}</strong>
            </li>
          ))}
        </ul>
        <div className={styles.addRow}>
          <Input placeholder="Nama wallet" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Saldo awal" value={balance} onChange={(e) => setBalance(fmtRpInput(e.target.value))} />
          {outlets.length > 0 && (
            <Select
              aria-label="Cabang wallet"
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              options={[
                { value: '', label: 'Bersama (semua cabang)' },
                ...outlets.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          )}
          <Button onClick={add} iconLeft={<Icon name="plus" aria-hidden />}>Tambah</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function OutletTab({ outlets }: { outlets: Outlet[] }) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const add = async () => {
    if (!name.trim()) return toast.error('Nama outlet wajib diisi');
    const now = new Date().toISOString();
    await repository.put('outlets', {
      id: newId(), orgId, outletId: null, name: name.trim(), address: address.trim(),
      isPrimary: outlets.length === 0, createdAt: now, updatedAt: now, deletedAt: null,
    });
    toast.success('Outlet ditambahkan');
    setName('');
    setAddress('');
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="shop" aria-hidden />} title="Outlet / Cabang" />
      <CardBody>
        {outlets.length === 0 ? (
          <EmptyState
            icon={<Icon name="shop" aria-hidden />}
            title="Belum ada outlet tambahan"
            description="Outlet utama digunakan secara default. Tambahkan cabang untuk multi-outlet."
          />
        ) : (
          <ul className={styles.list}>
            {outlets.map((o) => (
              <OutletRow key={o.id} outlet={o} />
            ))}
          </ul>
        )}
        <div className={styles.addRow}>
          <Input placeholder="Nama outlet" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Alamat" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button onClick={add} iconLeft={<Icon name="plus" aria-hidden />}>Tambah</Button>
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
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(outlet.lat != null ? String(outlet.lat) : '');
  const [lng, setLng] = useState(outlet.lng != null ? String(outlet.lng) : '');
  const [radius, setRadius] = useState(
    outlet.geofenceRadiusM != null ? String(outlet.geofenceRadiusM) : '100',
  );
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const geofenceOn = outlet.lat != null && outlet.lng != null && (outlet.geofenceRadiusM ?? 0) > 0;

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      setLat(pos.lat.toFixed(6));
      setLng(pos.lng.toFixed(6));
      toast.success(`Lokasi terdeteksi (akurasi ±${Math.round(pos.accuracyM)}m)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengambil lokasi');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    const latN = lat.trim() === '' ? null : Number(lat);
    const lngN = lng.trim() === '' ? null : Number(lng);
    const radN = radius.trim() === '' ? null : Math.round(Number(radius));
    if (latN != null && (Number.isNaN(latN) || latN < -90 || latN > 90)) {
      return toast.error('Latitude tidak valid (-90..90)');
    }
    if (lngN != null && (Number.isNaN(lngN) || lngN < -180 || lngN > 180)) {
      return toast.error('Longitude tidak valid (-180..180)');
    }
    if (radN != null && (Number.isNaN(radN) || radN <= 0)) {
      return toast.error('Radius harus lebih dari 0 meter');
    }
    setBusy(true);
    try {
      await repository.put('outlets', {
        ...outlet,
        lat: latN,
        lng: lngN,
        geofenceRadiusM: radN,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Geofence outlet disimpan');
      setOpen(false);
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
      toast.success('Geofence dimatikan (absensi bebas lokasi)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.outletItem}>
      <div className={styles.listItem}>
        <span className={styles.avatar}><Icon name="shop" aria-hidden /></span>
        <div className={styles.itemInfo}>
          <strong>{outlet.name}</strong>
          <small>{outlet.address || '—'}</small>
        </div>
        {geofenceOn && (
          <Badge tone="success">
            <Icon name="map-pin" aria-hidden /> {outlet.geofenceRadiusM}m
          </Badge>
        )}
        {outlet.isPrimary && <Badge tone="brand">Utama</Badge>}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          iconLeft={<Icon name="map-pin" aria-hidden />}
        >
          {open ? 'Tutup' : 'Geofence'}
        </Button>
      </div>

      {open && (
        <div className={styles.geofenceBox}>
          <p className={styles.geofenceHint}>
            <Icon name="info-circle" aria-hidden /> Isi koordinat + radius untuk mewajibkan
            absensi dari lokasi outlet. Kosongkan untuk absensi bebas lokasi. Set saat Anda
            sedang berada di outlet.
          </p>
          <div className={styles.geofenceRow}>
            <Input label="Latitude" placeholder="-6.200000" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input label="Longitude" placeholder="106.816666" value={lng} onChange={(e) => setLng(e.target.value)} />
            <Input label="Radius (m)" type="number" placeholder="100" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          <div className={styles.geofenceActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={useMyLocation}
              loading={locating}
              iconLeft={<Icon name="map-pin" aria-hidden />}
            >
              Gunakan lokasi saya
            </Button>
            <span className={styles.geofenceSpacer} />
            {geofenceOn && (
              <Button variant="ghost" size="sm" onClick={clear} disabled={busy}>
                Matikan
              </Button>
            )}
            <Button size="sm" onClick={save} loading={busy} iconLeft={<Icon name="check" aria-hidden />}>
              Simpan
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** CSV export of each major dataset. Owner-only (includes finance + PII). */
function ExportDataCard() {
  const [busy, setBusy] = useState<string | null>(null);

  const onExport = async (key: string, label: string) => {
    setBusy(key);
    try {
      const def = DATASETS.find((d) => d.key === key);
      if (!def) return;
      const csv = await def.toCsv();
      downloadCsv(def.label, csv);
      toast.success(`Data ${label} diekspor`);
    } catch {
      toast.error('Gagal mengekspor data');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="download" aria-hidden />} title="Export Data" />
      <CardBody>
        <p className={styles.dangerNote}>
          Unduh data sebagai CSV (bisa dibuka di Excel/Spreadsheet) — untuk cadangan, laporan, atau pindah sistem.
        </p>
        <div className={styles.exportGrid}>
          {DATASETS.map((d) => (
            <button
              key={d.key}
              className={styles.exportBtn}
              onClick={() => onExport(d.key, d.label)}
              disabled={busy !== null}
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
  const org = useSessionStore((s) => s.org);
  const cloud = isSupabaseConfigured;
  const isDemo = Boolean(org?.isDemo);
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
  const [restoring, setRestoring] = useState(false);

  const handleBackup = async () => {
    if (demoGuard('Backup tersedia di FixMaster versi penuh — daftar gratis.')) return;
    setBusy(true);
    try {
      const backup = await createBackup(org?.id ?? null);
      downloadBackup(backup);
      markBackedUp();
      toast.success('Backup berhasil diunduh');
    } catch {
      toast.error('Gagal membuat backup');
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
      setPendingText(await file.text());
    } catch {
      toast.error('Gagal membaca file');
    }
  };

  const handleRestore = async () => {
    if (demoGuard('Pulihkan data tersedia di FixMaster versi penuh — daftar gratis.')) return;
    if (pendingText === null) return;
    setRestoring(true);
    try {
      const res = await restoreBackup(pendingText);
      if (res.ok) {
        toast.success(`Berhasil memulihkan ${res.restored} data. Memuat ulang\u2026`);
        setTimeout(() => window.location.reload(), 900);
      } else {
        toast.error(res.error);
      }
    } finally {
      setRestoring(false);
      setPendingText(null);
    }
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="clock-rotate-left" aria-hidden />} title="Backup & Restore" />
      <CardBody>
        <p className={styles.dangerNote}>
          Backup menyimpan SELURUH data sebagai satu file JSON yang bisa dipulihkan utuh
          (berbeda dari Export CSV yang untuk laporan). Simpan file di tempat aman.
        </p>
        <div className={styles.backupRow}>
          <Button onClick={handleBackup} loading={busy} iconLeft={<Icon name="download" aria-hidden />}>
            Backup Sekarang
          </Button>
          {canRestore && (
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              iconLeft={<Icon name="clock-rotate-left" aria-hidden />}
            >
              Pulihkan dari File
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
            <Icon name="info-circle" aria-hidden /> Restore mengganti SELURUH data operasional
            org ini dengan isi file. Tim, langganan, dan profil org TIDAK ikut diganti. Disarankan
            backup dulu sebelum memulihkan.{isDemo ? ' (Akun demo)' : ''}
          </p>
        )}
        <hr className={styles.dangerDivider} />
        <Select
          label="Pengingat backup"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as BackupFrequency)}
          options={[
            { value: 'off', label: 'Nonaktif' },
            { value: 'daily', label: 'Harian' },
            { value: 'weekly', label: 'Mingguan' },
            { value: 'monthly', label: 'Bulanan' },
          ]}
          hint={
            lastBackupAt
              ? `Backup terakhir: ${new Date(lastBackupAt).toLocaleString('id-ID')}`
              : 'Belum pernah backup di perangkat ini'
          }
        />
      </CardBody>

      <ConfirmDialog
        open={pendingText !== null}
        title="Pulihkan dari Backup?"
        message="SEMUA data saat ini akan DIGANTI dengan isi file backup. Tindakan ini tidak dapat dibatalkan. Disarankan backup data saat ini lebih dulu."
        confirmLabel={restoring ? 'Memulihkan\u2026' : 'Ya, Ganti & Pulihkan'}
        danger
        onConfirm={handleRestore}
        onCancel={() => setPendingText(null)}
      />
    </Card>
  );
}

function SystemTab({
  onReset,
  isOwner,
}: {
  onReset: () => void;
  isOwner: boolean;
}) {
  const cloud = isSupabaseConfigured;
  const isDemo = Boolean(useSessionStore((s) => s.org)?.isDemo);
  const signOut = useAuthStore((s) => s.signOut);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (demoGuard('Hapus akun dinonaktifkan di demo.')) return;
    setDeleting(true);
    try {
      // 1. Erase all tenant data reachable from the client.
      await repository.clearAll();

      // 2. Delete the auth credential itself (email + password) via the
      //    privileged Edge Function. If it isn't deployed/reachable, fall back
      //    honestly: data is already gone, so still sign out and tell the user
      //    the login credential needs support to remove.
      let credentialDeleted = true;
      try {
        await deleteAccountCredential();
      } catch {
        credentialDeleted = false;
      }

      await signOut();
      if (credentialDeleted) {
        toast.success('Akun & seluruh data dihapus permanen');
      } else {
        toast.success('Data dihapus & keluar. Kredensial login perlu dihapus via dukungan.');
      }
    } catch {
      toast.error('Gagal menghapus data');
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
          <CardHeader icon={<Icon name="triangle-exclamation" aria-hidden />} title="Zona Berbahaya" />
          <CardBody>
            <p className={styles.dangerNote}>
              {cloud
                ? 'Reset mengosongkan seluruh data operasional org ini (servis, transaksi, stok, keuangan). Tim, langganan, dan profil usaha tetap.'
                : 'Reset menghapus seluruh data dan mengembalikan ke setup awal.'}
            </p>
            <Button variant="danger" onClick={onReset} iconLeft={<Icon name="trash" aria-hidden />}>
              Reset Seluruh Data
            </Button>

            {cloud && !isDemo && (
              <>
                <hr className={styles.dangerDivider} />
                <p className={styles.dangerNote}>
                  Hapus akun permanen: seluruh data usaha dihapus, kredensial login
                  (email &amp; sandi) dihapus dari server, lalu kamu keluar. Tindakan ini
                  tidak dapat dibatalkan — export data lebih dulu bila perlu.
                </p>
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  iconLeft={<Icon name="trash" aria-hidden />}
                >
                  Hapus Akun Permanen
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus Akun Permanen?"
        message="SEMUA data usaha (servis, transaksi, pelanggan, stok, keuangan) akan dihapus permanen, akun login (email & sandi) dihapus dari server, dan kamu akan keluar. Tindakan ini TIDAK dapat dibatalkan. Pertimbangkan export data lebih dulu."
        confirmLabel={deleting ? 'Menghapus…' : 'Ya, Hapus Permanen'}
        danger
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
