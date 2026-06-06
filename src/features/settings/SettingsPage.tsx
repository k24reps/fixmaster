import { useState, useRef } from 'react';
import { Card, CardHeader, CardBody, Button, Input, Badge, EmptyState, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { PLANS } from '@/config/plans';
import { roleAllows } from '@/config/plans';
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
import { useSessionStore } from '@/stores/session';
import type { Wallet, Outlet } from '@/data/types';
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

type Tab = 'usaha' | 'operasional' | 'tim' | 'keuangan' | 'outlet' | 'sistem';

export function SettingsPage() {
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const resetWorkspace = useSessionStore((s) => s.resetWorkspace);
  const isOwner = me ? roleAllows(me.role, '*') : false;

  const { data: wallets } = useCollection('wallets');
  const { data: outlets } = useCollection('outlets');
  const { data: employees } = useCollection('employees');

  const [tab, setTab] = useState<Tab>('usaha');
  const [confirmReset, setConfirmReset] = useState(false);

  const TABS: { id: Tab; label: string; icon: string; ownerOnly?: boolean }[] = [
    { id: 'usaha', label: 'Usaha', icon: 'fa-store' },
    { id: 'operasional', label: 'Operasional', icon: 'fa-sliders' },
    { id: 'tim', label: 'Tim', icon: 'fa-users', ownerOnly: true },
    { id: 'keuangan', label: 'Wallet', icon: 'fa-wallet', ownerOnly: true },
    { id: 'outlet', label: 'Outlet', icon: 'fa-shop', ownerOnly: true },
    { id: 'sistem', label: 'Sistem', icon: 'fa-gear' },
  ];
  const visibleTabs = TABS.filter((t) => !t.ownerOnly || isOwner);

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
      {tab === 'tim' && isOwner && <TeamTab employees={employees} />}
      {tab === 'keuangan' && isOwner && <WalletTab wallets={wallets} />}
      {tab === 'outlet' && isOwner && <OutletTab outlets={outlets} />}
      {tab === 'sistem' && (
        <SystemTab
          plan={org?.planType ?? 'trial'}
          onReset={() => setConfirmReset(true)}
          isOwner={isOwner}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset Seluruh Data?"
        message="SEMUA data (servis, transaksi, stok, dll) akan dihapus permanen dan Anda kembali ke setup awal. Tindakan ini tidak dapat dibatalkan."
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
      const logoDataUrl = await fileToLogoDataUrl(file);
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

function TeamTab({ employees }: { employees: ReturnType<typeof useCollection<'employees'>>['data'] }) {
  const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', karyawan: 'Karyawan' };
  return (
    <Card glass>
      <CardHeader icon={<Icon name="users" aria-hidden />} title="Anggota Tim" />
      <CardBody className={styles.noPad}>
        <ul className={styles.list}>
          {employees.map((e) => (
            <li key={e.id} className={styles.listItem}>
              <span className={styles.avatar}>{e.name.charAt(0).toUpperCase()}</span>
              <div className={styles.itemInfo}>
                <strong>{e.name}</strong>
                <small>{ROLE_LABEL[e.role]}</small>
              </div>
              <Badge tone={e.active ? 'success' : 'neutral'}>{e.active ? 'Aktif' : 'Nonaktif'}</Badge>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function WalletTab({ wallets }: { wallets: Wallet[] }) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');

  const add = async () => {
    if (!name.trim()) return toast.error('Nama wallet wajib diisi');
    const now = new Date().toISOString();
    await repository.put('wallets', {
      id: newId(), orgId, outletId: null, name: name.trim(),
      balance: parseRpInput(balance), sortOrder: wallets.length,
      createdAt: now, updatedAt: now, deletedAt: null,
    });
    toast.success('Wallet ditambahkan');
    setName('');
    setBalance('');
  };

  return (
    <Card glass>
      <CardHeader icon={<Icon name="wallet" aria-hidden />} title="Wallet / Kas" />
      <CardBody>
        <ul className={styles.walletList}>
          {wallets.map((w) => (
            <li key={w.id} className={styles.walletItem}>
              <span>{w.name}</span>
              <strong>{fmtRp(w.balance)}</strong>
            </li>
          ))}
        </ul>
        <div className={styles.addRow}>
          <Input placeholder="Nama wallet" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Saldo awal" value={balance} onChange={(e) => setBalance(fmtRpInput(e.target.value))} />
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
              <li key={o.id} className={styles.listItem}>
                <span className={styles.avatar}><Icon name="shop" aria-hidden /></span>
                <div className={styles.itemInfo}>
                  <strong>{o.name}</strong>
                  <small>{o.address || '—'}</small>
                </div>
                {o.isPrimary && <Badge tone="brand">Utama</Badge>}
              </li>
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

function SystemTab({
  plan,
  onReset,
  isOwner,
}: {
  plan: keyof typeof PLANS;
  onReset: () => void;
  isOwner: boolean;
}) {
  const planDef = PLANS[plan];
  return (
    <div className={styles.systemGrid}>
      <Card glass>
        <CardHeader icon={<Icon name="crown" aria-hidden />} title="Paket Langganan" />
        <CardBody>
          <div className={styles.planRow}>
            <div>
              <strong className={styles.planName}>{planDef.name}</strong>
              <p className={styles.planPrice}>{planDef.priceLabel}</p>
            </div>
            <Badge tone="brand">{planDef.features.length} fitur</Badge>
          </div>
          <p className={styles.planNote}>
            <Icon name="info-circle" aria-hidden /> Upgrade paket via WhatsApp admin (integrasi billing menyusul).
          </p>
        </CardBody>
      </Card>

      {isOwner && (
        <Card glass accent="danger">
          <CardHeader icon={<Icon name="triangle-exclamation" aria-hidden />} title="Zona Berbahaya" />
          <CardBody>
            <p className={styles.dangerNote}>
              Reset menghapus seluruh data dan mengembalikan ke setup awal.
            </p>
            <Button variant="danger" onClick={onReset} iconLeft={<Icon name="trash" aria-hidden />}>
              Reset Seluruh Data
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
