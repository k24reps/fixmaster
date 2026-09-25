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
import type { Service, Customer, Employee } from '@/data/types';
import styles from './ServiceModal.module.css';

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  editing: Service | null;
  services: Service[];
  employees: Employee[];
  onSaved: () => void;
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
  const [category, setCategory] = useState(categories[0] ?? '');
  const [device, setDevice] = useState('');
  const [complaint, setComplaint] = useState('');
  const [accessories, setAccessories] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [estimateCost, setEstimateCost] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Quick-suggest: which customer field is active (drives the dropdown). Only
  // for NEW services — picking an existing customer here is the main way to
  // avoid near-duplicate records from re-typing a slightly different name.
  const [suggestField, setSuggestField] = useState<'name' | 'phone' | null>(null);

  // Servis baru selalu mulai kosong; mode edit mencerminkan recordnya.
  useResetOnOpen(open, editing?.id ?? 'new', () => {
    setCustomerName(editing?.customerName ?? '');
    setCustomerPhone(editing?.customerPhone ?? '');
    setCategory(editing?.category ?? categories[0] ?? '');
    setDevice(editing?.device ?? '');
    setComplaint(editing?.complaint ?? '');
    setAccessories(editing?.accessories ?? '');
    setTechnicianId(editing?.technicianId ?? '');
    setEstimateCost(editing?.estimateCost ? fmtRpInput(String(editing.estimateCost)) : '');
    setError('');
    setSuggestField(null);
  });

  const technicianOptions = [
    { value: '', label: '— Belum ditentukan —' },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

  const suggestTerm = suggestField === 'name' ? customerName : customerPhone;
  const remoteMatches = useCustomerSearch({
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
      <span className={styles.suggestHint}>Pelanggan terdaftar — klik untuk pakai:</span>
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
    if (!customerName.trim()) return setError('Nama pelanggan wajib diisi');
    if (!customerPhone.trim()) return setError('No. HP pelanggan wajib diisi');
    if (!device.trim()) return setError('Nama perangkat wajib diisi');
    // OQ-C (same guard as PosPage/EntryModal): a multi-outlet user must pick a
    // branch first so the ticket isn't silently stamped to the primary outlet.
    if (!editing && mustPickOutlet(outlets.length)) {
      return setError('Pilih cabang dulu di selektor cabang (sidebar) sebelum membuat servis');
    }

    setBusy(true);
    const now = new Date().toISOString();
    const orgId = org?.id ?? '';

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
        toast.success('Servis diperbarui');
      } else {
        const serviceNo = nextDocNumber(
          org?.servicePrefix ?? 'FM',
          services.map((s) => s.serviceNo),
        );
        const record: Service = {
          id: newId(),
          orgId,
          outletId: resolveCreateOutlet(outlets),
          serviceNo,
          customerId: customer.id,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          category,
          device: device.trim(),
          complaint: complaint.trim(),
          accessories: accessories.trim(),
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
        toast.success(`Servis ${saved.serviceNo} dibuat`);
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan servis');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.serviceNo}` : 'Servis Baru'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <FormRow>
          <div className={styles.suggestWrap}>
            <Input
              label="Nama Pelanggan"
              value={customerName}
              autoCapWords
              onChange={(e) => {
                setCustomerName(e.target.value);
                setSuggestField('name');
              }}
              onFocus={() => setSuggestField('name')}
              onBlur={() => hideSuggest('name')}
              autoFocus
            />
            {suggestField === 'name' && suggestList}
          </div>
          <div className={styles.suggestWrap}>
            <Input
              label="No. HP Pelanggan"
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
            label="Kategori Perangkat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categories.map((c) => ({ value: c, label: c }))}
            placeholder={categories.length ? undefined : 'Belum ada kategori'}
          />
          <Input
            label="Perangkat"
            placeholder="Contoh: MacBook Pro 2019"
            value={device}
            autoCapWords
            onChange={(e) => setDevice(e.target.value)}
          />
        </FormRow>
        <Input
          label="Keluhan"
          placeholder="Contoh: Mati total, tidak mengisi daya"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
        />
        {complaintTemplates.length > 0 && (
          <div className={styles.chips}>
            <span className={styles.chipsLabel}>Pilihan cepat keluhan:</span>
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
          label="Kelengkapan (opsional)"
          placeholder="Contoh: Charger, tas"
          value={accessories}
          onChange={(e) => setAccessories(e.target.value)}
        />
        {accessoryTemplates.length > 0 && (
          <div className={styles.chips}>
            <span className={styles.chipsLabel}>Pilihan cepat kelengkapan:</span>
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
        <FormRow>
          <Select
            label="Teknisi"
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            options={technicianOptions}
          />
          <Input
            label="Estimasi Biaya (opsional)"
            placeholder="150.000"
            value={estimateCost}
            onChange={(e) => setEstimateCost(fmtRpInput(e.target.value))}
          />
        </FormRow>
      </FormFields>
    </Modal>
  );
}
