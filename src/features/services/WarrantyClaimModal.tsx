import { useState } from 'react';
import { Modal, Input, Select, Button, FormFields, FormRow, FormError } from '@/components/ui';
import { repository } from '@/data';
import { createWarrantyClaim } from '@/data/supabase-client';
import { newId, nextDocNumber } from '@/lib/id';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { fmtDate, localDateStr } from '@/lib/time';
import { applyBalance } from '@/lib/business/finance';
import { claimableItems, openClaimFor } from '@/lib/business/services';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import { useCollection } from '@/hooks/useCollection';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import type { ClaimItem, Service } from '@/data/types';
import { useT } from '@/i18n';
import { interpolate } from '@/lib/business/notify';

const itemKey = (item: ClaimItem) => `${item.kind}:${item.name}`;

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
 *
 * Cloud: satu transaksi server (create_warranty_claim, 0064), jadi karyawan tak
 * lagi meninggalkan tiket klaim tanpa pengeluaran kerugiannya, dan klaim kedua
 * ditolak selama klaim sebelumnya belum Lunas/Batal.
 */
export function WarrantyClaimModal({ open, onClose, origin, services, onSaved }: WarrantyClaimModalProps) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const { data: wallets } = useCollection('wallets');

  const [complaint, setComplaint] = useState('');
  const [recordLoss, setRecordLoss] = useState(false);
  const [lossAmount, setLossAmount] = useState('');
  const [walletId, setWalletId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Kunci bagian yang dicentang (`kind:name`).
  const [picked, setPicked] = useState<string[]>([]);

  useResetOnOpen(open, origin?.id ?? null, () => {
    const available = origin ? claimableItems(origin, localDateStr()) : [];
    // Satu-satunya bagian yang masih bergaransi langsung terpilih.
    setPicked(available.length === 1 ? [itemKey(available[0])] : []);
    setComplaint('');
    setRecordLoss(false);
    setLossAmount('');
    setWalletId(wallets[0]?.id ?? '');
    setError('');
  });

  if (!origin) return null;

  const items = claimableItems(origin, localDateStr());

  const save = async () => {
    const chosen = items.filter((i) => picked.includes(itemKey(i)));
    if (chosen.length === 0) return setError(t('warrantyClaim.pickItems'));
    if (!complaint.trim()) return setError(t('warrantyClaim.complaintRequired'));
    const running = openClaimFor(services, origin.id);
    if (running) return setError(interpolate(t('warrantyClaim.running'), { no: running.serviceNo }));
    const loss = recordLoss ? parseRpInput(lossAmount) : 0;
    const wallet = wallets.find((w) => w.id === walletId);
    if (recordLoss) {
      if (loss <= 0) return setError(t('warrantyClaim.lossRequired'));
      if (!wallet) return setError(t('warrantyClaim.walletRequired'));
      if (wallet.balance < loss) return setError(interpolate(t('warrantyClaim.walletShort'), { wallet: wallet.name, amount: fmtRp(wallet.balance) }));
    }

    setBusy(true);
    const now = new Date().toISOString();
    const orgId = org?.id ?? '';

    try {
      const serviceNo = nextDocNumber(
        org?.servicePrefix ?? 'FM',
        services.map((s) => s.serviceNo),
      );
      let claimNo: string;

      if (isCloudMode()) {
        ({ serviceNo: claimNo } = await createWarrantyClaim({
          orgId,
          originId: origin.id,
          serviceNo,
          complaint: complaint.trim(),
          by: me?.id ?? '',
          byName: me?.name ?? '',
          lossAmount: loss,
          lossWalletId: recordLoss ? walletId : null,
          claimedItems: chosen.map(({ kind, name }) => ({ kind, name })),
        }));
      } else {
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
          claimedItems: chosen,
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
        ({ serviceNo: claimNo } = await repository.put('services', claim));

        // Annotate the original ticket's history so the link is visible there too.
        await repository.put('services', {
          ...origin,
          updatedAt: now,
          history: [
            ...(origin.history ?? []),
            {
              at: now,
              status: 'edit',
              by: me?.id ?? '',
              byName: me?.name ?? '',
              note: `Klaim garansi dibuka → ${claimNo}`,
              internal: false,
            },
          ],
        });

        // Optional manual warranty-loss expense.
        if (recordLoss && wallet) {
          await repository.put('expenses', {
            id: newId(),
            orgId,
            outletId: origin.outletId,
            date: localDateStr(),
            category: 'Garansi',
            amount: loss,
            walletId,
            description: `Kerugian garansi ${claimNo} (asli ${origin.serviceNo})`,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          await repository.put('wallets', applyBalance(wallet, -loss));
        }
      }

      toast.success(interpolate(t('warrantyClaim.created'), { no: claimNo }));
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('warrantyClaim.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={interpolate(t('warrantyClaim.title'), { no: origin.serviceNo })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('warrantyClaim.create')}
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {t('warrantyClaim.introA')} <strong>{t('warrantyClaim.introStrong')}</strong> {t('warrantyClaim.introB')}{' '}
          <strong>{origin.device}</strong> ({origin.customerName}). {t('warrantyClaim.introC')}
        </p>
        <div role="group" aria-label={t('warrantyClaim.items')} style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{t('warrantyClaim.items')}</span>
          {items.map((item) => {
            const key = itemKey(item);
            return (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)' }}>
                <input
                  type="checkbox"
                  checked={picked.includes(key)}
                  onChange={(e) =>
                    setPicked((prev) => (e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)))
                  }
                />
                <span>{item.name}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {interpolate(t('warrantyClaim.until'), { date: fmtDate(item.until) })}
                </span>
              </label>
            );
          })}
        </div>
        <Input
          label={t('warrantyClaim.complaint')}
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder={t('warrantyClaim.complaintPh')}
          autoFocus
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)' }}>
          <input
            type="checkbox"
            checked={recordLoss}
            onChange={(e) => setRecordLoss(e.target.checked)}
          />
          {t('warrantyClaim.recordLoss')}
        </label>
        {recordLoss && (
          <FormRow>
            <Input
              label={t('warrantyClaim.lossAmount')}
              value={lossAmount}
              onChange={(e) => setLossAmount(fmtRpInput(e.target.value))}
              placeholder="100.000"
            />
            <Select
              label={t('warrantyClaim.wallet')}
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
