import { useState } from 'react';
import { Modal, Input, Button, FormFields, FormError } from '@/components/ui';
import { repository } from '@/data';
import { syncCustomerToServices } from '@/data/supabase-client';
import { newId } from '@/lib/id';
import { checkDuplicate } from '@/lib/business/customers';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import type { Customer } from '@/data/types';

interface CustomerModalProps {
  open: boolean;
  onClose: () => void;
  editing: Customer | null;
  customers: Customer[];
  onSaved: (customer: Customer) => void;
  /** Isian awal untuk pelanggan baru — mis. yang sudah diketik di kolom cari Kasir. */
  initialQuery?: string;
}

export function CustomerModal({ open, onClose, editing, customers, onSaved, initialQuery = '' }: CustomerModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Isi ulang setiap kali jendela DIBUKA. Dulu hanya saat targetnya berganti,
  // jadi "Pelanggan Baru" kedua kali masih membawa isian yang lama.
  const [wasOpen, setWasOpen] = useState(false);
  if (!open && wasOpen) setWasOpen(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    // Kueri berupa angka = nomor HP, selain itu nama.
    const q = initialQuery.trim();
    const qIsPhone = /^[+\d][\d\s-]*$/.test(q);
    setName(editing?.name ?? (qIsPhone ? '' : q));
    setPhone(editing?.phone ?? (qIsPhone ? q : ''));
    setNote(editing?.note ?? '');
    setError('');
  }

  const save = async () => {
    if (!name.trim()) return setError('Nama wajib diisi');
    if (!phone.trim()) return setError('No. HP wajib diisi');

    setBusy(true);
    // Cloud: daftar di tangan hanya potongan (hasil cari/halaman), jadi nomor
    // dicek ke server — kalau tidak, pelanggan GANDA lolos.
    const candidates = repository.queryCustomers
      ? [...customers, ...(await repository.queryCustomers({ phone, limit: 50 }).catch(() => []))]
      : customers;
    const dup = checkDuplicate(candidates, { id: editing?.id, name, phone });
    if (!dup.ok) {
      setBusy(false);
      return setError(dup.reason ?? 'Duplikat');
    }

    const now = new Date().toISOString();
    const record: Customer = {
      id: editing?.id ?? newId(),
      orgId,
      outletId: editing?.outletId ?? null,
      name: name.trim(),
      phone: phone.trim(),
      // Email/address are no longer collected in the UI, but existing records
      // keep their stored values so historical data isn't wiped.
      email: editing?.email ?? '',
      address: editing?.address ?? '',
      note: note.trim(),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };

    try {
      await repository.put('customers', record);
      // Back-sync: update customer name/phone on related services.
      if (editing && (editing.name !== record.name || editing.phone !== record.phone)) {
        if (isCloudMode()) {
          // Server menyalin nama & HP ke SEMUA tiketnya — hanya dua kolom itu (0069).
          // Dulu baris tiket dari daftar (maks 1000, bisa basi) ditulis ulang utuh,
          // sehingga status yang baru berubah bisa tertimpa.
          await syncCustomerToServices({ orgId: record.orgId, customerId: record.id });
        } else {
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
      }
      toast.success(editing ? 'Pelanggan diperbarui' : 'Pelanggan ditambahkan');
      logActivity({
        action: editing ? 'customer.update' : 'customer.create',
        entityType: 'customer',
        entityId: record.id,
        entityLabel: record.name,
        meta: { phone: record.phone },
      });
      onSaved(record);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan pelanggan');
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
        <Input label="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </FormFields>
    </Modal>
  );
}
