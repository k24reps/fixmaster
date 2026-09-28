import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError, Icon } from '@/components/ui';
import { repository } from '@/data';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { findByPhone, searchCustomers } from '@/lib/business/customers';
import { logActivity } from '@/lib/activity';
import { getCategories, getComplaintTemplates, getAccessoryTemplates } from '@/config/orgConfig';
import { toast } from '@/stores/toast';
import { useSessionStore, resolveCreateOutlet, mustPickOutlet } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import { useCustomerSearch } from '@/hooks/useCustomerSearch';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { trackEvent } from '@/lib/analytics';
import { useDemoStore } from '@/stores/demo';
import type { Service, Customer, Employee, ScreenLockKind } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { saveScreenLock } from '@/data/serviceSecret';
import { useT } from '@/i18n';
import styles from './ServiceModal.module.css';
import { interpolate } from '@/lib/business/notify';

interface IntakeDraft {
  customerName: string;
  customerPhone: string;
  category: string;
  device: string;
  complaint: string;
  accessories: string;
  technicianId: string;
  estimateCost: string;
  outletId: string;
  deviceSerial: string;
  deviceCondition: string;
  // Jenis saja — isi kunci layar sengaja TIDAK ikut draf.
  lockKind: ScreenLockKind | '';
}

/** Pilihan cepat kondisi fisik; teksnya ikut tersimpan di tiket (data, bukan label UI). */
const CONDITION_CHIPS: TranslationKey[] = [
  'serviceForm.condNormal',
  'serviceForm.condScratch',
  'serviceForm.condCracked',
  'serviceForm.condDent',
  'serviceForm.condWater',
];

// Isian tiket BARU yang ditutup tanpa disimpan (Esc, ketuk latar, Batal). Dulu
// hilang seketika — di meja konter itu berarti mengetik ulang semuanya sementara
// pelanggan menunggu. Hanya di memori: hilang saat halaman dimuat ulang.
let intakeDraft: IntakeDraft | null = null;

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  editing: Service | null;
  services: Service[];
  employees: Employee[];
  /** `created` terisi hanya saat tiket BARU dibuat (panel tanda terima). */
  onSaved: (created?: Service) => void;
}

export function ServiceModal({
  open,
  onClose,
  editing,
  services,
  employees,
  onSaved,
}: ServiceModalProps) {
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const { data: outlets } = useCollection('outlets');
  // Pelanggan tidak lagi dimuat utuh. Di cloud, kotak saran dan pemeriksaan
  // duplikat memakai query bertarget; adapter lokal tetap memakai daftar penuh
  // karena di sana tidak ada ongkos egress. `enabled: false` membuat hook ini
  // TIDAK memicu pengambilan di cloud, tapi tetap membaca cache bila halaman
  // lain kebetulan sudah memuatnya.
  const serverSearch = !!repository.queryCustomers;
  const { data: localCustomers } = useCollection('customers', { enabled: !serverSearch });
  const categories = getCategories();
  const complaintTemplates = getComplaintTemplates();
  const accessoryTemplates = getAccessoryTemplates();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Kosong, bukan kategori pertama: dulu "Redmi Note 12" diam-diam tersimpan sebagai Laptop.
  const [category, setCategory] = useState('');
  const [device, setDevice] = useState('');
  const [complaint, setComplaint] = useState('');
  const [accessories, setAccessories] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [deviceCondition, setDeviceCondition] = useState('');
  const [lockKind, setLockKind] = useState<ScreenLockKind | ''>('');
  const [lockSecret, setLockSecret] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [estimateCost, setEstimateCost] = useState('');
  const [outletId, setOutletId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  // Pengguna multi-cabang di "Semua Outlet" wajib memilih cabang. Dulu hanya
  // diberitahu SETELAH Simpan, dengan petunjuk ke sidebar yang tertutup jendela
  // ini — dan isiannya hilang saat jendela ditutup untuk mencarinya.
  const needOutlet = !editing && mustPickOutlet(outlets.length);
  const outletOptions = outlets
    .filter((o) => allowedOutletIds.length === 0 || allowedOutletIds.includes(o.id))
    .map((o) => ({ value: o.id, label: o.name }));

  const snapshot = (): IntakeDraft => ({
    customerName,
    customerPhone,
    category,
    device,
    complaint,
    accessories,
    technicianId,
    estimateCost,
    outletId,
    deviceSerial,
    deviceCondition,
    lockKind,
  });
  const hasContent = [customerName, customerPhone, device, complaint, accessories, estimateCost].some((v) =>
    v.trim(),
  );
  const applyDraft = (d: IntakeDraft | null) => {
    setCustomerName(d?.customerName ?? '');
    setCustomerPhone(d?.customerPhone ?? '');
    setCategory(d?.category ?? '');
    setDevice(d?.device ?? '');
    setComplaint(d?.complaint ?? '');
    setAccessories(d?.accessories ?? '');
    setTechnicianId(d?.technicianId ?? '');
    setEstimateCost(d?.estimateCost ?? '');
    setOutletId(d?.outletId ?? '');
    setDeviceSerial(d?.deviceSerial ?? '');
    setDeviceCondition(d?.deviceCondition ?? '');
    setLockKind(d?.lockKind ?? '');
    setLockSecret('');
    setError('');
  };
  const close = () => {
    if (!editing) intakeDraft = hasContent ? snapshot() : null;
    onClose();
  };
  // Quick-suggest: which customer field is active (drives the dropdown). Only
  // for NEW services — picking an existing customer here is the main way to
  // avoid near-duplicate records from re-typing a slightly different name.
  const [suggestField, setSuggestField] = useState<'name' | 'phone' | null>(null);

  // Servis baru selalu mulai kosong; mode edit mencerminkan recordnya.
  useResetOnOpen(open, editing?.id ?? 'new', () => {
    setSuggestField(null);
    if (!editing) {
      applyDraft(intakeDraft);
      return;
    }
    applyDraft({
      customerName: editing.customerName,
      customerPhone: editing.customerPhone,
      category: editing.category,
      device: editing.device,
      complaint: editing.complaint,
      accessories: editing.accessories,
      technicianId: editing.technicianId ?? '',
      estimateCost: editing.estimateCost ? fmtRpInput(String(editing.estimateCost)) : '',
      outletId: '',
      deviceSerial: editing.deviceSerial ?? '',
      deviceCondition: editing.deviceCondition ?? '',
      lockKind: editing.secretKind ?? '',
    });
  });

  const technicianOptions = [
    { value: '', label: t('serviceForm.techUnset') },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

  const suggestTerm = suggestField === 'name' ? customerName : customerPhone;
  const { results: remoteMatches } = useCustomerSearch({
    enabled: !editing && !!suggestField,
    term: suggestTerm,
  });
  // `searchCustomers` tetap yang memutuskan — server hanya mempersempit
  // kandidat, jadi aturan pencocokan tidak terduplikasi ke SQL.
  const suggestions =
    !editing && suggestField
      ? searchCustomers(serverSearch ? remoteMatches : localCustomers, suggestTerm)
      : [];

  const pickCustomer = (c: Customer) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setSuggestField(null);
  };

  // Close the dropdown on blur, but defer so a suggestion click registers first.
  // Compares against the field that blurred so moving focus name→phone is safe.
  const hideSuggest = (field: 'name' | 'phone') =>
    window.setTimeout(() => setSuggestField((f) => (f === field ? null : f)), 150);

  const suggestList = suggestions.length > 0 && (
    <div className={styles.suggest} role="listbox">
      <span className={styles.suggestHint}>{t('serviceForm.suggestHint')}</span>
      {suggestions.map((c) => (
        <button
          type="button"
          key={c.id}
          className={styles.suggestItem}
          role="option"
          aria-selected={false}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pickCustomer(c)}
        >
          <span className={styles.suggestName}>{c.name}</span>
          <span className={styles.suggestPhone}>{c.phone}</span>
        </button>
      ))}
    </div>
  );

  /** Append a template snippet to a field, comma-joining when non-empty. */
  const appendToField = (
    current: string,
    snippet: string,
    setter: (v: string) => void,
  ) => {
    const trimmed = current.trim();
    setter(trimmed ? `${trimmed}, ${snippet}` : snippet);
  };

  const save = async () => {
    if (!customerName.trim()) return setError(t('serviceForm.nameRequired'));
    if (!customerPhone.trim()) return setError(t('serviceForm.phoneRequired'));
    if (!device.trim()) return setError(t('serviceForm.deviceRequired'));
    if (categories.length && !category) return setError(t('serviceForm.categoryRequired'));
    // OQ-C (same guard as PosPage/EntryModal): a multi-outlet user must pick a
    // branch first so the ticket isn't silently stamped to the primary outlet.
    if (needOutlet && !outletId) return setError(t('serviceForm.outletRequired'));
    // Jenis dipilih tanpa isi = lupa mengetik. Saat edit, kosong berarti "tetap".
    if (lockKind && !lockSecret.trim() && !(editing?.secretKind === lockKind)) {
      return setError(t('serviceForm.lockRequired'));
    }

    setBusy(true);
    const now = new Date().toISOString();
    const orgId = org?.id ?? '';

    let created: Service | null = null;
    try {
      // Link or create the customer by phone.
      // Kandidat diambil bertarget per nomor. Filternya longgar dan mencakup
      // bentuk 0 maupun 62 (phoneLookupFilter) — kekurangan cocok di sini
      // berarti pelanggan GANDA, bug yang membuat FULL_LIST ada.
      const candidates = repository.queryCustomers
        ? await repository.queryCustomers({ phone: customerPhone, limit: 50 })
        : localCustomers;
      let customer = findByPhone(candidates, customerPhone);
      if (!customer) {
        customer = {
          id: newId(),
          orgId,
          outletId: null,
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: '',
          address: '',
          note: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await repository.put('customers', customer);
      } else if (editing && customer.id === editing.customerId && customer.name !== customerName.trim()) {
        // Nama dikoreksi dari tiket → kartu pelanggannya ikut, supaya tidak berbeda
        // dengan menu Pelanggan. Hanya pelanggan tiket ini sendiri: nomor yang
        // ternyata milik pelanggan lain tidak diganti namanya.
        customer = { ...customer, name: customerName.trim(), updatedAt: now };
        await repository.put('customers', customer);
      }

      const tech = employees.find((e) => e.id === technicianId);

      if (editing) {
        // Hanya kolom form: status, DP, biaya, dan sparepart bisa saja berubah di
        // perangkat lain selama form terbuka, dan tidak boleh tertimpa salinan ini.
        await repository.patch('services', editing.id, {
          customerId: customer.id,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          category,
          device: device.trim(),
          complaint: complaint.trim(),
          accessories: accessories.trim(),
          deviceSerial: deviceSerial.trim(),
          deviceCondition: deviceCondition.trim(),
          technicianId: technicianId || null,
          technicianName: tech?.name ?? '',
          estimateCost: parseRpInput(estimateCost),
          updatedAt: now,
          history: [
            ...(editing.history ?? []),
            {
              at: now,
              status: 'edit',
              by: me?.id ?? '',
              byName: me?.name ?? '',
              note: 'Data servis diperbarui',
              internal: true,
            },
          ],
        });
        if (!editing.pickedUp) {
          if (!lockKind && editing.secretKind) await saveScreenLock(editing, editing.secretKind, '');
          else if (lockKind && lockSecret.trim()) await saveScreenLock(editing, lockKind, lockSecret);
        }
        toast.success(t('serviceForm.updated'));
      } else {
        const serviceNo = nextDocNumber(
          org?.servicePrefix ?? 'FM',
          services.map((s) => s.serviceNo),
        );
        const record: Service = {
          id: newId(),
          orgId,
          outletId: needOutlet ? outletId : resolveCreateOutlet(outlets),
          serviceNo,
          customerId: customer.id,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          category,
          device: device.trim(),
          complaint: complaint.trim(),
          accessories: accessories.trim(),
          deviceSerial: deviceSerial.trim(),
          deviceCondition: deviceCondition.trim(),
          secretKind: null,
          status: 'diterima',
          technicianId: technicianId || null,
          technicianName: tech?.name ?? '',
          estimateCost: parseRpInput(estimateCost),
          finalCost: 0,
          downPayment: 0,
          spareparts: [],
          warrantyServiceUntil: null,
          warrantyPartsUntil: null,
          pickedUp: false,
          pickedUpAt: null,
          warrantyClaimOf: null,
          history: [
            {
              at: now,
              status: 'diterima',
              by: me?.id ?? '',
              byName: me?.name ?? '',
              note: 'Unit diterima',
              internal: false,
            },
          ],
          archived: false,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        // Nomor usulan bisa diganti server bila bentrok (0061), jadi pesan & log
        // memakai nomor yang benar-benar tersimpan.
        const saved = await repository.put('services', record);
        created = saved;
        // Kunci layar disimpan terpisah (0094). Gagal di sini tidak membatalkan
        // tiket yang sudah tersimpan — cukup diberi tahu, bisa diulang dari Edit.
        if (lockKind && lockSecret.trim()) {
          try {
            await saveScreenLock(saved, lockKind, lockSecret);
            created = { ...saved, secretKind: lockKind };
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t('serviceForm.lockFailed'));
          }
        }
        if (services.length === 0 && !useDemoStore.getState().isDemo) {
          trackEvent('first_service_created', {
            workspace_mode: isSupabaseConfigured ? 'cloud' : 'local',
          });
        }
        logActivity({
          action: 'service.create',
          entityType: 'service',
          entityId: record.id,
          entityLabel: saved.serviceNo,
          meta: { device: record.device, customer: record.customerName },
        });
        toast.success(interpolate(t('serviceForm.created'), { no: saved.serviceNo }));
        intakeDraft = null;
      }
      onSaved(created ?? undefined);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('serviceForm.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? interpolate(t('serviceForm.editTitle'), { no: editing.serviceNo }) : t('serviceForm.newTitle')}
      size="lg"
      footer={
        <>
          {!editing && hasContent && (
            <Button
              variant="ghost"
              className={styles.clearBtn}
              onClick={() => {
                intakeDraft = null;
                applyDraft(null);
              }}
            >
              {t('serviceForm.clear')}
            </Button>
          )}
          <Button variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="service-intake" loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {/* <form>: Enter di field satu baris menyimpan (Keluhan tetap baris baru). */}
      <form
        id="service-intake"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
      <FormFields>
        <FormError>{error}</FormError>
        {needOutlet && (
          <Select
            label={t('serviceForm.outlet')}
            value={outletId}
            onChange={(e) => {
              setOutletId(e.target.value);
              setError('');
            }}
            options={outletOptions}
            placeholder={t('serviceForm.outletPlaceholder')}
            autoFocus
          />
        )}
        <FormRow>
          <div className={styles.suggestWrap}>
            <Input
              label={t('serviceForm.customerName')}
              value={customerName}
              autoCapWords
              onChange={(e) => {
                setCustomerName(e.target.value);
                setSuggestField('name');
              }}
              onFocus={() => setSuggestField('name')}
              onBlur={() => hideSuggest('name')}
              autoFocus={!needOutlet}
            />
            {suggestField === 'name' && suggestList}
          </div>
          <div className={styles.suggestWrap}>
            <Input
              label={t('serviceForm.customerPhone')}
              value={customerPhone}
              inputMode="tel"
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setSuggestField('phone');
              }}
              onFocus={() => setSuggestField('phone')}
              onBlur={() => hideSuggest('phone')}
            />
            {suggestField === 'phone' && suggestList}
          </div>
        </FormRow>
        <FormRow>
          <Select
            label={t('serviceForm.category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c }))}
            placeholder={t(categories.length ? 'serviceForm.categoryPh' : 'serviceForm.noCategory')}
          />
          <Input
            label={t('serviceForm.device')}
            placeholder={t('serviceForm.devicePh')}
            value={device}
            autoCapWords
            onChange={(e) => setDevice(e.target.value)}
          />
        </FormRow>
        <Input
          label={t('serviceForm.serial')}
          placeholder={t('serviceForm.serialPh')}
          value={deviceSerial}
          noAutoCap
          spellCheck={false}
          onChange={(e) => setDeviceSerial(e.target.value)}
        />
        <Input
          label={t('serviceForm.complaint')}
          placeholder={t('serviceForm.complaintPh')}
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
        />
        {complaintTemplates.length > 0 && (
          <div className={styles.chips}>
            <span className={styles.chipsLabel}>{t('serviceForm.complaintQuick')}</span>
            {complaintTemplates.map((tpl) => (
              <button
                type="button"
                key={tpl}
                className={styles.chip}
                onClick={() => appendToField(complaint, tpl, setComplaint)}
              >
                <Icon name="plus" aria-hidden /> {tpl}
              </button>
            ))}
          </div>
        )}
        <Input
          label={t('serviceForm.accessories')}
          placeholder={t('serviceForm.accessoriesPh')}
          value={accessories}
          onChange={(e) => setAccessories(e.target.value)}
        />
        {accessoryTemplates.length > 0 && (
          <div className={styles.chips}>
            <span className={styles.chipsLabel}>{t('serviceForm.accessoriesQuick')}</span>
            {accessoryTemplates.map((tpl) => (
              <button
                type="button"
                key={tpl}
                className={styles.chip}
                onClick={() => appendToField(accessories, tpl, setAccessories)}
              >
                <Icon name="plus" aria-hidden /> {tpl}
              </button>
            ))}
          </div>
        )}
        <Input
          label={t('serviceForm.condition')}
          placeholder={t('serviceForm.conditionPh')}
          value={deviceCondition}
          onChange={(e) => setDeviceCondition(e.target.value)}
        />
        <div className={styles.chips}>
          <span className={styles.chipsLabel}>{t('serviceForm.conditionQuick')}</span>
          {CONDITION_CHIPS.map((k) => (
            <button
              type="button"
              key={k}
              className={styles.chip}
              onClick={() => appendToField(deviceCondition, t(k), setDeviceCondition)}
            >
              <Icon name="plus" aria-hidden /> {t(k)}
            </button>
          ))}
        </div>
        {/* Kunci layar: tidak ditawarkan lagi setelah unit diambil (sudah dihapus server). */}
        {!editing?.pickedUp && (
          <FormRow>
            <Select
              label={t('serviceForm.lockKind')}
              value={lockKind}
              onChange={(e) => {
                setLockKind(e.target.value as ScreenLockKind | '');
                setLockSecret('');
              }}
              options={[
                { value: '', label: t('serviceForm.lockNone') },
                { value: 'pin', label: t('serviceForm.lock_pin') },
                { value: 'pola', label: t('serviceForm.lock_pola') },
                { value: 'sandi', label: t('serviceForm.lock_sandi') },
              ]}
            />
            {lockKind && (
              <Input
                label={t('serviceForm.lockValue')}
                value={lockSecret}
                onChange={(e) => setLockSecret(e.target.value)}
                inputMode={lockKind === 'sandi' ? 'text' : 'numeric'}
                autoComplete="off"
                spellCheck={false}
                noAutoCap
                maxLength={64}
                data-1p-ignore
                data-lpignore="true"
                placeholder={
                  editing?.secretKind === lockKind
                    ? t('serviceForm.lockKeep')
                    : lockKind === 'pola'
                      ? t('serviceForm.lockPolaPh')
                      : ''
                }
                hint={t('serviceForm.lockHint')}
              />
            )}
          </FormRow>
        )}
        <FormRow>
          <Select
            label={t('serviceForm.technician')}
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            options={technicianOptions}
          />
          <Input
            label={t('serviceForm.estimate')}
            placeholder="150.000"
            value={estimateCost}
            onChange={(e) => setEstimateCost(fmtRpInput(e.target.value))}
          />
        </FormRow>
      </FormFields>
      </form>
    </Modal>
  );
}
