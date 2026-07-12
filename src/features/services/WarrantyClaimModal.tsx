import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { applyBalance } from '@/lib/business/finance';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { useCollection } from '@/hooks/useCollection';
import type { Service } from '@/data/types';

interface WarrantyClaimModalProps {
  open: boolean;
  onClose: () => void;
  /** The original (settled, in-warranty) ticket being claimed against. */
  origin: Service | null;
  /** All services, used to generate the next ticket number. */
  services: Service[];
  onSaved: () => void;
}

/**
 * Opens a warranty claim as a NEW ticket linked to the original via
 * `warrantyClaimOf`. The original stays settled & untouched (its finances are
 * preserved). The claim ticket is free (finalCost 0). Optionally records a
 * manually-entered "Garansi" expense to keep profit accurate — the amount is
 * typed by the user, not derived from inventory/POS.
 */
export function WarrantyClaimModal({ open, onClose, origin, services, onSaved }: WarrantyClaimModalProps) {
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const { data: wallets } = useCollection('wallets');

  const [complaint, setComplaint] = useState('');
  const [recordLoss, setRecordLoss] = useState(false);
  const [lossAmount, setLossAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && origin && lastKey !== origin.id) {
    setLastKey(origin.id);
    setComplaint('');
    setRecordLoss(false);
    setLossAmount('');
    setWalletId(wallets[0]?.id ?? '');
    setError('');
  }
  if (!open && lastKey !== null) setLastKey(null);

  if (!origin) return null;

  const save = async () => {
    if (!complaint.trim()) return setError('Jelaskan keluhan klaim garansi');
    const loss = recordLoss ? parseRpInput(lossAmount) : 0;
    if (recordLoss) {
      if (loss <= 0) return setError('Nominal kerugian garansi harus lebih dari 0');
      if (!walletId) return setError('Pilih wallet sumber biaya garansi');
    }

    setBusy(true);
    const now = new Date().toISOString();
    const orgId = org?.id ?? '';

    try {
      const serviceNo = nextDocNumber(
        org?.servicePrefix ?? 'FM',
        services.map((s) => s.serviceNo),
      );
      const claim: Service = {
        id: newId(),
        orgId,
        outletId: origin.outletId,
        serviceNo,
        customerId: origin.customerId,
        customerName: origin.customerName,
        customerPhone: origin.customerPhone,
        category: origin.category,
        device: origin.device,
        complaint: complaint.trim(),
        accessories: origin.accessories,
        status: 'diterima',
        technicianId: origin.technicianId,
        technicianName: origin.technicianName,
        estimateCost: 0,
        finalCost: 0,
        downPayment: 0,
        spareparts: [],
        warrantyServiceUntil: null,
        warrantyPartsUntil: null,
        pickedUp: false,
        pickedUpAt: null,
        warrantyClaimOf: origin.id,
        history: [
          {
            at: now,
            status: 'diterima',
            by: me?.id ?? '',
            byName: me?.name ?? '',
            note: `Klaim garansi dari ${origin.serviceNo}`,
            internal: false,
          },
        ],
        archived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await repository.put('services', claim);

      // Annotate the original ticket's history so the link is visible there too.
      await repository.put('services', {
        ...origin,
        updatedAt: now,
        history: [
          ...origin.history,
          {
            at: now,
            status: 'edit',
            by: me?.id ?? '',
            byName: me?.name ?? '',
            note: `Klaim garansi dibuka → ${serviceNo}`,
            internal: false,
          },
        ],
      });

      // Optional manual warranty-loss expense.
      if (recordLoss) {
        const wallet = wallets.find((w) => w.id === walletId);
        await repository.put('expenses', {
          id: newId(),
          orgId,
          outletId: origin.outletId,
          date: localDateStr(),
          category: 'Garansi',
          amount: loss,
          walletId,
          description: `Kerugian garansi ${serviceNo} (asli ${origin.serviceNo})`,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        if (wallet) await repository.put('wallets', applyBalance(wallet, -loss));
      }

      toast.success(`Klaim garansi ${serviceNo} dibuat`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat klaim garansi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Klaim Garansi — ${origin.serviceNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Buat Tiket Klaim
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Tiket servis <strong>baru &amp; gratis</strong> akan dibuat untuk{' '}
          <strong>{origin.device}</strong> ({origin.customerName}). Tiket asli tetap lunas dan tidak berubah.
        </p>
        <Input
          label="Keluhan klaim"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="mis. Masalah yang sama muncul lagi"
          autoFocus
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)' }}>
          <input
            type="checkbox"
            checked={recordLoss}
            onChange={(e) => setRecordLoss(e.target.checked)}
          />
          Catat kerugian garansi (biaya part/jasa yang ditanggung toko)
        </label>
        {recordLoss && (
          <FormRow>
            <Input
              label="Nominal kerugian"
              value={lossAmount}
              onChange={(e) => setLossAmount(fmtRpInput(e.target.value))}
              placeholder="100.000"
            />
            <Select
              label="Sumber wallet"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              options={wallets.map((w) => ({ value: w.id, label: w.name }))}
            />
          </FormRow>
        )}
      </FormFields>
    </Modal>
  );
}
