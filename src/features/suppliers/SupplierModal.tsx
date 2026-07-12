import { useState } from 'react';
import { Modal, Input, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type { Supplier } from '@/data/types';

interface SupplierModalProps {
  open: boolean;
  onClose: () => void;
  editing: Supplier | null;
}

export function SupplierModal({ open, onClose, editing }: SupplierModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const currentKey = editing?.id ?? 'new';
  if (open && lastKey !== currentKey) {
    setLastKey(currentKey);
    setName(editing?.name ?? '');
    setPhone(editing?.phone ?? '');
    setEmail(editing?.email ?? '');
    setAddress(editing?.address ?? '');
    setNote(editing?.note ?? '');
    setError('');
  }

  const save = async () => {
    if (!name.trim()) return setError('Nama supplier wajib diisi');
    setBusy(true);
    const now = new Date().toISOString();
    const record: Supplier = {
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
      await repository.put('suppliers', record);
      toast.success(editing ? 'Supplier diperbarui' : 'Supplier ditambahkan');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan supplier');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Supplier' : 'Supplier Baru'}
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
        <Input label="Nama Supplier" value={name} autoCapWords onChange={(e) => setName(e.target.value)} autoFocus />
        <FormRow>
          <Input label="No. Telepon" value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormRow>
        <Input label="Alamat" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="Catatan" value={note} onChange={(e) => setNote(e.target.value)} />
      </FormFields>
    </Modal>
  );
}
