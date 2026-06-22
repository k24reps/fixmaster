import { useState } from 'react';
import { Modal, Input, Button, FormFields, FormError } from '@/components/ui';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { checkDuplicate } from '@/lib/business/customers';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { Customer } from '@/data/types';

interface CustomerModalProps {
  open: boolean;
  onClose: () => void;
  editing: Customer | null;
  customers: Customer[];
  onSaved: () => void;
}

export function CustomerModal({ open, onClose, editing, customers, onSaved }: CustomerModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Sync form state when the modal opens for a new target.
  const [lastId, setLastId] = useState<string | null>(null);
  const currentKey = editing?.id ?? 'new';
  if (open && lastId !== currentKey) {
    setLastId(currentKey);
    setName(editing?.name ?? '');
    setPhone(editing?.phone ?? '');
    setEmail(editing?.email ?? '');
    setAddress(editing?.address ?? '');
    setNote(editing?.note ?? '');
    setError('');
  }

  const save = async () => {
    if (!name.trim()) return setError('Nama wajib diisi');
    if (!phone.trim()) return setError('No. HP wajib diisi');

    const dup = checkDuplicate(customers, { id: editing?.id, name, phone });
    if (!dup.ok) return setError(dup.reason ?? 'Duplikat');

    setBusy(true);
    const now = new Date().toISOString();
    const record: Customer = {
      id: editing?.id ?? newId(),
      orgId,
      outletId: editing?.outletId ?? null,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      note: note.trim(),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };

    try {
      await repository.put('customers', record);
      // Back-sync: update customer name/phone on related services.
      if (editing && (editing.name !== record.name || editing.phone !== record.phone)) {
        const services = await repository.list('services');
        const related = services.filter((s) => s.customerId === editing.id);
        if (related.length) {
          await repository.putMany(
            'services',
            related.map((s) => ({
              ...s,
              customerName: record.name,
              customerPhone: record.phone,
            })),
          );
        }
      }
      toast.success(editing ? 'Pelanggan diperbarui' : 'Pelanggan ditambahkan');
      logActivity({
        action: editing ? 'customer.update' : 'customer.create',
        entityType: 'customer',
        entityId: record.id,
        entityLabel: record.name,
        meta: { phone: record.phone },
      });
      onSaved();
      onClose();
    } catch {
      toast.error('Gagal menyimpan pelanggan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Pelanggan' : 'Pelanggan Baru'}
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
        <Input label="Nama" value={name} autoCapWords onChange={(e) => setName(e.target.value)} autoFocus />
        <Input
          label="No. HP / WhatsApp"
          value={phone}
          inputMode="tel"
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label="Email (opsional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Alamat (opsional)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Input label="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </FormFields>
    </Modal>
  );
}
