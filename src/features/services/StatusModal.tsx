import { useState } from 'react';
import { Modal, Select, Input, Button, Badge } from '@/components/ui';
import { repository } from '@/data';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { fmtDate, addDays, localDateStr } from '@/lib/time';
import {
  nextStatuses,
  canSetStatus,
  computeStockDeduction,
  STATUS_LABELS,
  STATUS_TONE,
  outstandingBalance,
} from '@/lib/business/services';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { getWarrantyServiceDays, getWarrantyPartsDays, getWarrantyPresets } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './StatusModal.module.css';

interface StatusModalProps {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  onSaved: () => void;
}

export function StatusModal({ open, onClose, service, onSaved }: StatusModalProps) {
  const me = useSessionStore((s) => s.currentEmployee);
  const role = me?.role ?? 'karyawan';

  const [target, setTarget] = useState<ServiceStatus | ''>('');
  const [finalCost, setFinalCost] = useState('');
  const [note, setNote] = useState('');
  // Warranty lengths (days) captured when finishing a job ("selesai").
  const [warrantyService, setWarrantyService] = useState('');
  const [warrantyParts, setWarrantyParts] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && service && lastKey !== service.id) {
    setLastKey(service.id);
    setTarget('');
    setFinalCost(service.finalCost ? fmtRpInput(String(service.finalCost)) : '');
    setNote('');
    setWarrantyService('');
    setWarrantyParts('');
  }

  if (!service) return null;

  const allowed = nextStatuses(service.status).filter((s) => canSetStatus(role, s));
  const needsCost = target === 'konfirmasi' || target === 'selesai' || target === 'lunas';
  const needsWarranty = target === 'selesai';
  const warrantyPresets = getWarrantyPresets();

  // Prefill warranty lengths from org defaults the first time "selesai" is picked.
  const onTargetChange = (next: ServiceStatus | '') => {
    setTarget(next);
    if (next === 'selesai') {
      setWarrantyService((v) => (v === '' ? String(getWarrantyServiceDays()) : v));
      setWarrantyParts((v) => (v === '' ? String(getWarrantyPartsDays()) : v));
    }
  };

  const apply = async () => {
    if (!target) {
      toast.warning('Pilih status tujuan');
      return;
    }
    const svcDays = Math.max(0, Math.round(Number(warrantyService) || 0));
    const partsDays = Math.max(0, Math.round(Number(warrantyParts) || 0));
    if (needsWarranty && svcDays <= 0 && partsDays <= 0) {
      toast.warning('Isi minimal salah satu garansi (jasa atau sparepart)');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const cost = needsCost ? parseRpInput(finalCost) : service.finalCost;

    try {
      // Deferred stock deduction when entering "pengerjaan".
      const { deductions, updated } = computeStockDeduction(service.spareparts, target);
      if (deductions.length) {
        const inventory = await repository.list('inventory');
        const toUpdate = inventory
          .filter((item) => deductions.some((d) => d.itemId === item.id))
          .map((item) => {
            const d = deductions.find((x) => x.itemId === item.id)!;
            return { ...item, stock: Math.max(0, item.stock - d.qty) };
          });
        if (toUpdate.length) await repository.putMany('inventory', toUpdate);
      }

      // Warranty is captured when finishing the job ("selesai"): compute expiry
      // from today + the entered lengths. Preserve existing values otherwise.
      const finishDate = localDateStr();
      const warrantyServiceUntil =
        target === 'selesai'
          ? svcDays > 0
            ? addDays(finishDate, svcDays)
            : null
          : service.warrantyServiceUntil;
      const warrantyPartsUntil =
        target === 'selesai'
          ? partsDays > 0
            ? addDays(finishDate, partsDays)
            : null
          : service.warrantyPartsUntil;

      const updatedService: Service = {
        ...service,
        status: target,
        finalCost: cost,
        warrantyServiceUntil,
        warrantyPartsUntil,
        spareparts: updated,
        updatedAt: now,
        history: [
          ...service.history,
          {
            at: now,
            status: target,
            by: me?.id ?? '',
            byName: me?.name ?? '',
            note: note.trim() || STATUS_LABELS[target],
            internal: false,
          },
        ],
      };
      await repository.put('services', updatedService);

      // On settle ("lunas"), record income + credit the first wallet.
      if (target === 'lunas') {
        const wallets = await repository.list('wallets');
        const wallet = wallets[0];
        if (wallet) {
          const amount = outstandingBalance(updatedService) || cost;
          await repository.put('incomes', {
            id: crypto.randomUUID(),
            orgId: service.orgId,
            outletId: service.outletId,
            date: now.slice(0, 10),
            category: 'Servis',
            amount,
            walletId: wallet.id,
            description: `Pelunasan servis ${service.serviceNo}`,
            serviceId: service.id,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          await repository.put('wallets', { ...wallet, balance: wallet.balance + amount });
        }
      }

      toast.success(`Status → ${STATUS_LABELS[target]}`);
      logActivity({
        action: 'service.status',
        entityType: 'service',
        entityId: service.id,
        entityLabel: service.serviceNo,
        meta: { from: service.status, to: target },
      });
      onSaved();
      onClose();
    } catch {
      toast.error('Gagal memperbarui status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Update Status — ${service.serviceNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={apply} loading={busy} disabled={allowed.length === 0}>
            Terapkan
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.current}>
          <span className={styles.label}>Status saat ini</span>
          <Badge tone={STATUS_TONE[service.status] as 'brand'}>
            {STATUS_LABELS[service.status]}
          </Badge>
        </div>

        {allowed.length === 0 ? (
          <p className={styles.terminal}>
            Status ini final, tidak ada transisi lanjutan
            {!canSetStatus(role, 'lunas') && ' (sebagian aksi butuh peran owner/admin)'}.
          </p>
        ) : (
          <>
            <Select
              label="Status Tujuan"
              value={target}
              onChange={(e) => onTargetChange(e.target.value as ServiceStatus)}
              options={allowed.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              placeholder="Pilih status…"
            />
            {needsCost && (
              <Input
                label="Biaya Final"
                value={finalCost}
                onChange={(e) => setFinalCost(fmtRpInput(e.target.value))}
                placeholder="250.000"
              />
            )}
            {needsWarranty && (
              <div className={styles.warranty}>
                <span className={styles.warrantyLabel}>Garansi (isi minimal salah satu)</span>
                <div className={styles.warrantyRow}>
                  <Input
                    label="Garansi Jasa (hari)"
                    type="number"
                    inputMode="numeric"
                    value={warrantyService}
                    onChange={(e) => setWarrantyService(e.target.value)}
                    placeholder="30"
                  />
                  <Input
                    label="Garansi Sparepart (hari)"
                    type="number"
                    inputMode="numeric"
                    value={warrantyParts}
                    onChange={(e) => setWarrantyParts(e.target.value)}
                    placeholder="7"
                  />
                </div>
                {warrantyPresets.length > 0 && (
                  <div className={styles.presetRow}>
                    <span className={styles.presetHint}>Cepat:</span>
                    {warrantyPresets.map((d) => (
                      <span key={d} className={styles.presetChips}>
                        <button
                          type="button"
                          className={styles.presetChip}
                          onClick={() => setWarrantyService(String(d))}
                          title={`Garansi jasa ${d} hari`}
                        >
                          Jasa {d}h
                        </button>
                        <button
                          type="button"
                          className={styles.presetChip}
                          onClick={() => setWarrantyParts(String(d))}
                          title={`Garansi sparepart ${d} hari`}
                        >
                          Part {d}h
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Input
              label="Catatan (opsional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {service.downPayment > 0 && (
              <p className={styles.dp}>
                DP diterima: {fmtRp(service.downPayment)} · Sisa:{' '}
                {fmtRp(outstandingBalance({ ...service, finalCost: parseRpInput(finalCost) || service.finalCost }))}
              </p>
            )}
          </>
        )}

        <div className={styles.history}>
          <span className={styles.label}>Riwayat</span>
          <ul className={styles.timeline}>
            {[...service.history].reverse().map((h, i) => (
              <li key={i} className={styles.timelineItem}>
                <span
                  className={styles.dot}
                  data-tone={h.status === 'edit' ? 'neutral' : STATUS_TONE[h.status as ServiceStatus]}
                />
                <div>
                  <strong>{h.status === 'edit' ? 'Edit' : STATUS_LABELS[h.status as ServiceStatus]}</strong>
                  <small>
                    {fmtDate(h.at.slice(0, 10))} · {h.byName || '—'}
                    {h.note ? ` · ${h.note}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
