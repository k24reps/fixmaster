import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError, Icon } from '@/components/ui';
import { repository } from '@/data';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { findByPhone } from '@/lib/business/customers';
import { getCategories, getComplaintTemplates, getAccessoryTemplates } from '@/config/orgConfig';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { Service, Customer, Employee } from '@/data/types';
import styles from './ServiceModal.module.css';

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  editing: Service | null;
  services: Service[];
  customers: Customer[];
  employees: Employee[];
  onSaved: () => void;
}

export function ServiceModal({
  open,
  onClose,
  editing,
  services,
  customers,
  employees,
  onSaved,
}: ServiceModalProps) {
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
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

  const [lastKey, setLastKey] = useState<string | null>(null);
  const currentKey = editing?.id ?? 'new';
  if (open && lastKey !== currentKey) {
    setLastKey(currentKey);
    setCustomerName(editing?.customerName ?? '');
    setCustomerPhone(editing?.customerPhone ?? '');
    setCategory(editing?.category ?? categories[0] ?? '');
    setDevice(editing?.device ?? '');
    setComplaint(editing?.complaint ?? '');
    setAccessories(editing?.accessories ?? '');
    setTechnicianId(editing?.technicianId ?? '');
    setEstimateCost(editing?.estimateCost ? fmtRpInput(String(editing.estimateCost)) : '');
    setError('');
  }

  const technicianOptions = [
    { value: '', label: '— Belum ditentukan —' },
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

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

    setBusy(true);
    const now = new Date().toISOString();
    const orgId = org?.id ?? '';

    try {
      // Link or create the customer by phone.
      let customer = findByPhone(customers, customerPhone);
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
      }

      const tech = employees.find((e) => e.id === technicianId);

      if (editing) {
        const updated: Service = {
          ...editing,
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
            ...editing.history,
            {
              at: now,
              status: 'edit',
              by: me?.id ?? '',
              byName: me?.name ?? '',
              note: 'Data servis diperbarui',
              internal: true,
            },
          ],
        };
        await repository.put('services', updated);
        toast.success('Servis diperbarui');
      } else {
        const serviceNo = nextDocNumber(
          org?.servicePrefix ?? 'FM',
          services.map((s) => s.serviceNo),
        );
        const record: Service = {
          id: newId(),
          orgId,
          outletId: null,
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
        await repository.put('services', record);
        toast.success(`Servis ${serviceNo} dibuat`);
      }
      onSaved();
      onClose();
    } catch {
      toast.error('Gagal menyimpan servis');
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
          <Input
            label="Nama Pelanggan"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            autoFocus
          />
          <Input
            label="No. HP Pelanggan"
            value={customerPhone}
            inputMode="tel"
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
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
