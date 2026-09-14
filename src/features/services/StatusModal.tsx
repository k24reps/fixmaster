import { useState } from 'react';
import { Modal, Select, Input, Button, Badge } from '@/components/ui';
import { repository } from '@/data';
import { useCollection } from '@/hooks/useCollection';
import { useServiceHistory } from '@/hooks/useServiceHistory';
import { settleService, cancelService, recordDownPayment, isSupabaseConfigured } from '@/data/supabase-client';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { fmtDate, addDays, localDateStr, localDateOf } from '@/lib/time';
import { newId } from '@/lib/id';
import {
  nextStatuses,
  canSetStatus,
  computeStockDeduction,
  computeStockRestore,
  isTerminal,
  STATUS_LABELS,
  STATUS_TONE,
  outstandingBalance,
  settlementAmount,
  normalizeSplits,
  validateSplit,
  settlementIncomeDescription,
  dpIncomeDescription,
} from '@/lib/business/services';
import type { PaymentSplit } from '@/lib/business/services';
import { applyBalance } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { getWarrantyServiceDays, getWarrantyPartsDays, getWarrantyPresets } from '@/config/orgConfig';
import { getLastExpenseWallet, setLastExpenseWallet } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './StatusModal.module.css';

/** Sub-actions this modal hosts. It is the single hub for all financial input. */
type Mode = 'status' | 'dp' | 'koreksi';

interface StatusModalProps {
  open: boolean;
  onClose: () => void;
  service: Service | null;
  onSaved: () => void;
  /** Which sub-action to open on. Falls back to the first available. */
  initialMode?: Mode;
}

const MODE_LABELS: Record<Mode, string> = {
  status: 'Ubah Status',
  dp: 'Terima DP',
  koreksi: 'Koreksi Biaya',
};

export function StatusModal({ open, onClose, service, onSaved, initialMode = 'status' }: StatusModalProps) {
  const me = useSessionStore((s) => s.currentEmployee);
  const role = me?.role ?? 'karyawan';
  const isManager = role === 'owner' || role === 'admin';
  const { data: wallets } = useCollection('wallets');
  const history = useServiceHistory(service);

  const [mode, setMode] = useState<Mode>('status');
  // Status sub-action
  const [target, setTarget] = useState<ServiceStatus | ''>('');
  const [finalCost, setFinalCost] = useState('');
  const [note, setNote] = useState('');
  // Penanganan: tindakan perbaikan, wajib saat Selesai; tampil di daftar Servis.
  const [handling, setHandling] = useState('');
  const [warrantyService, setWarrantyService] = useState('');
  const [warrantyParts, setWarrantyParts] = useState('');
  // Settlement payment legs ("split payment"): each leg = wallet + amount.
  // A single-wallet payment is just one leg.
  const [splits, setSplits] = useState<{ walletId: string; amount: string }[]>([]);
  // DP sub-action
  const [dpAmount, setDpAmount] = useState('');
  const [dpWalletId, setDpWalletId] = useState('');
  // Cancel ("batal") sub-action: optional partial DP refund.
  const [refundAmount, setRefundAmount] = useState('');
  const [refundWalletId, setRefundWalletId] = useState('');
  // Koreksi sub-action
  const [correctAmount, setCorrectAmount] = useState('');

  const [busy, setBusy] = useState(false);

  // Available sub-actions depend on status + role.
  const allowed = service ? nextStatuses(service.status).filter((s) => canSetStatus(role, s)) : [];
  const canDp = service ? !isTerminal(service.status) : false;
  const canKoreksi = service ? service.status === 'lunas' && isManager : false;
  const modes: Mode[] = [];
  if (allowed.length > 0) modes.push('status');
  if (canDp) modes.push('dp');
  if (canKoreksi) modes.push('koreksi');
  // Staff on a closed-but-unpaid unit (e.g. "selesai") can't change status —
  // settlement is owner/admin-only — so the modal lands on DP-only. Surface a
  // note so the DP form doesn't feel like a wrong turn from "Update Status".
  const staffDpOnly = !isManager && allowed.length === 0 && canDp;

  const defaultWallet = () => {
    const last = getLastExpenseWallet();
    return wallets.some((w) => w.id === last) ? last : wallets[0]?.id ?? '';
  };

  // Reset once per open (edge-triggered) so reopening always starts fresh.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && service) {
      const startMode = modes.includes(initialMode) ? initialMode : modes[0] ?? 'status';
      setMode(startMode);
      setTarget('');
      setFinalCost(service.finalCost ? fmtRpInput(String(service.finalCost)) : '');
      setNote('');
      setHandling('');
      setWarrantyService('');
      setWarrantyParts('');
      setSplits([]);
      setDpAmount('');
      setDpWalletId(defaultWallet());
      setRefundAmount('');
      setRefundWalletId(defaultWallet());
      setCorrectAmount(service.finalCost ? fmtRpInput(String(service.finalCost)) : '');
    }
  }

  if (!service) return null;

  const needsCost = target === 'konfirmasi' || target === 'selesai' || target === 'lunas';
  const needsWarranty = target === 'selesai';
  // Cancellation must say why. Completion documents what was done in its own
  // required "Penanganan" field, so its note is optional like everywhere else.
  const noteRequired = target === 'batal';
  const needsHandling = target === 'selesai';
  const warrantyPresets = getWarrantyPresets();
  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));

  // Amount still owed at settlement given the (possibly edited) final cost.
  const settleDue = settlementAmount(parseRpInput(finalCost) || service.finalCost, service.downPayment);

  const onTargetChange = (next: ServiceStatus | '') => {
    setTarget(next);
    if (next === 'selesai') {
      setWarrantyService((v) => (v === '' ? String(getWarrantyServiceDays()) : v));
      setWarrantyParts((v) => (v === '' ? String(getWarrantyPartsDays()) : v));
    }
    if (next === 'lunas') {
      // Seed a single payment leg covering the full balance (the common case);
      // the user can split it across wallets from there.
      const due = settlementAmount(parseRpInput(finalCost) || service.finalCost, service.downPayment);
      setSplits([{ walletId: defaultWallet(), amount: due > 0 ? fmtRpInput(String(due)) : '' }]);
    }
    if (next === 'batal' && service.downPayment > 0) {
      // Default to refunding the full DP; the owner can lower it (the shop keeps
      // the difference, e.g. a diagnosis fee) or zero it out.
      setRefundAmount(fmtRpInput(String(service.downPayment)));
    }
  };

  // --- Split payment editing helpers (UI-local) ---
  const setSplitWallet = (i: number, walletId: string) =>
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, walletId } : s)));
  const setSplitAmount = (i: number, amount: string) =>
    setSplits((prev) => prev.map((s, idx) => (idx === i ? { ...s, amount: fmtRpInput(amount) } : s)));
  const addSplit = () => setSplits((prev) => [...prev, { walletId: defaultWallet(), amount: '' }]);
  const removeSplit = (i: number) => setSplits((prev) => prev.filter((_, idx) => idx !== i));
  const splitsAsNumbers = (): PaymentSplit[] =>
    splits.map((s) => ({ walletId: s.walletId, amount: parseRpInput(s.amount) }));
  const splitPaid = splitsAsNumbers().reduce((sum, s) => sum + s.amount, 0);

  // ---- Sub-action: change status ----
  const applyStatus = async () => {
    if (!target) return toast.warning('Pilih status tujuan');
    if (noteRequired && !note.trim()) {
      return toast.warning(`Catatan wajib diisi untuk status ${STATUS_LABELS[target]}`);
    }
    if (needsHandling && !handling.trim()) {
      return toast.warning('Penanganan wajib diisi untuk status Selesai');
    }
    const svcDays = Math.max(0, Math.round(Number(warrantyService) || 0));
    const partsDays = Math.max(0, Math.round(Number(warrantyParts) || 0));
    if (needsWarranty && svcDays <= 0 && partsDays <= 0) {
      return toast.warning('Isi minimal salah satu garansi (jasa atau sparepart)');
    }
    const cost = needsCost ? parseRpInput(finalCost) : service.finalCost;
    const settle = settlementAmount(cost, service.downPayment);
    if (target === 'lunas' && settle > 0) {
      const err = validateSplit(splitsAsNumbers(), settle);
      if (err === 'empty') return toast.warning('Isi minimal satu pembayaran');
      if (err === 'mismatch')
        return toast.warning(`Total pembayaran (${fmtRp(splitPaid)}) harus sama dengan sisa tagihan (${fmtRp(settle)})`);
    }
    setBusy(true);
    const now = new Date().toISOString();
    try {
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

      const finishDate = localDateStr();
      const warrantyServiceUntil =
        target === 'selesai' ? (svcDays > 0 ? addDays(finishDate, svcDays) : null) : service.warrantyServiceUntil;
      const warrantyPartsUntil =
        target === 'selesai' ? (partsDays > 0 ? addDays(finishDate, partsDays) : null) : service.warrantyPartsUntil;

      const updatedService: Service = {
        ...service,
        status: target,
        finalCost: cost,
        warrantyServiceUntil,
        warrantyPartsUntil,
        spareparts: updated,
        updatedAt: now,
        // Penanganan disimpan di kolomnya sendiri (0059, `completion_note`), supaya
        // tabel Servis bisa menampilkannya tanpa memuat riwayat.
        completionNote: needsHandling ? handling.trim() : service.completionNote,
        history: [
          ...(service.history ?? []),
          {
            at: now,
            status: target,
            by: me?.id ?? '',
            byName: me?.name ?? '',
            // Riwayat (juga tampil di halaman lacak pelanggan) tetap memuat penanganannya.
            note: [needsHandling ? handling.trim() : '', note.trim()].filter(Boolean).join(' · ') || STATUS_LABELS[target],
            internal: false,
          },
        ],
      };
      await repository.put('services', updatedService);

      // Settle ("lunas"): book income for the bill still owed after DP, split
      // across one or more wallets. Cloud uses the atomic settle_service RPC
      // (member-allowed; direct wallet/income writes are manager-only under RLS
      // 0028) with ALL legs; local mirrors it per-leg directly. DP-covered
      // (settle 0) → nothing booked. Income tagged to the service's outlet.
      if (target === 'lunas' && settle > 0) {
        const legs = normalizeSplits(splitsAsNumbers());
        if (isSupabaseConfigured) {
          await settleService({
            orgId: service.orgId,
            serviceId: service.id,
            payments: legs,
            history: updatedService.history ?? [],
            outletId: service.outletId,
          });
        } else {
          for (const leg of legs) {
            const wallet = wallets.find((w) => w.id === leg.walletId);
            if (!wallet) continue;
            await repository.put('incomes', {
              id: newId(),
              orgId: service.orgId,
              outletId: service.outletId,
              date: localDateStr(),
              category: 'Servis',
              amount: leg.amount,
              walletId: wallet.id,
              description: settlementIncomeDescription(service.serviceNo),
              serviceId: service.id,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
            await repository.put('wallets', applyBalance(wallet, leg.amount));
          }
        }
        if (legs[0]) setLastExpenseWallet(legs[0].walletId);
      }

      // Cancel ("batal"): give back deducted stock AND optionally refund a CHOSEN
      // part of the DP. Cloud uses the atomic cancel_service RPC (member-allowed).
      // Refund model (0031): the DP income is KEPT; the refunded portion is booked
      // as an expense — local mirrors that so reports match across modes.
      if (target === 'batal') {
        const refund = service.downPayment > 0 ? Math.min(parseRpInput(refundAmount), service.downPayment) : 0;
        if (isSupabaseConfigured) {
          await cancelService({
            orgId: service.orgId,
            serviceId: service.id,
            history: updatedService.history ?? [],
            outletId: service.outletId,
            refundAmount: refund,
            refundWalletId: refund > 0 ? refundWalletId : null,
          });
        } else {
          const { restorations, updated: restoredParts } = computeStockRestore(service.spareparts);
          if (restorations.length) {
            const inventory = await repository.list('inventory');
            const toRestore = inventory
              .filter((item) => restorations.some((r) => r.itemId === item.id))
              .map((item) => {
                const r = restorations.find((x) => x.itemId === item.id)!;
                return { ...item, stock: item.stock + r.qty };
              });
            if (toRestore.length) await repository.putMany('inventory', toRestore);
          }

          // Refund a chosen amount: book it as an expense + debit the wallet. The
          // DP income stays (audit intact); the shop keeps any un-refunded balance.
          if (refund > 0 && refundWalletId) {
            const wallet = wallets.find((w) => w.id === refundWalletId);
            if (wallet) {
              await repository.put('expenses', {
                id: newId(),
                orgId: service.orgId,
                outletId: service.outletId,
                date: localDateStr(),
                category: 'Lainnya',
                amount: refund,
                walletId: wallet.id,
                description: `Refund DP servis ${service.serviceNo}`,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
              });
              await repository.put('wallets', applyBalance(wallet, -refund));
            }
          }

          await repository.put('services', {
            ...updatedService,
            spareparts: restoredParts,
            updatedAt: now,
          });
        }
      }

      logActivity({
        action: 'service.status',
        entityType: 'service',
        entityId: service.id,
        entityLabel: service.serviceNo,
        meta: { from: service.status, to: target },
      });
      toast.success(`Status → ${STATUS_LABELS[target]}`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui status');
    } finally {
      setBusy(false);
    }
  };

  // ---- Sub-action: receive DP (real cash in) ----
  const applyDp = async () => {
    const amount = parseRpInput(dpAmount);
    if (amount <= 0) return toast.warning('Nominal DP harus lebih dari 0');
    if (!dpWalletId) return toast.warning('Pilih wallet tujuan');
    setBusy(true);
    const now = new Date().toISOString();
    try {
      // DP is a billing write (income + wallet). Cloud uses the atomic
      // record_down_payment RPC (member-allowed) since direct wallet/income
      // writes are manager-only under RLS 0028; local mirrors it directly.
      const incomeId = newId();
      if (isSupabaseConfigured) {
        await recordDownPayment({
          orgId: service.orgId,
          serviceId: service.id,
          walletId: dpWalletId,
          amount,
          outletId: service.outletId,
        });
      } else {
        await repository.put('incomes', {
          id: incomeId,
          orgId: service.orgId,
          outletId: service.outletId,
          date: localDateStr(),
          category: 'Servis',
          amount,
          walletId: dpWalletId,
          description: dpIncomeDescription(service.serviceNo),
          serviceId: service.id,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        const wallet = wallets.find((w) => w.id === dpWalletId);
        if (wallet) await repository.put('wallets', applyBalance(wallet, amount));
        await repository.put('services', {
          ...service,
          downPayment: service.downPayment + amount,
          updatedAt: now,
        });
      }
      setLastExpenseWallet(dpWalletId);
      logActivity({
        action: 'income.create',
        entityType: 'income',
        entityId: incomeId,
        entityLabel: `DP ${service.serviceNo}`,
        meta: { amount, serviceId: service.id },
      });
      toast.success('DP diterima & masuk keuangan');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencatat DP');
    } finally {
      setBusy(false);
    }
  };

  // ---- Sub-action: correct final cost after settlement (owner/admin) ----
  const applyKoreksi = async () => {
    const newFinal = parseRpInput(correctAmount);
    if (newFinal < 0) return toast.warning('Biaya final tidak valid');
    if (newFinal < service.downPayment) return toast.warning('Biaya final tidak boleh kurang dari DP yang sudah diterima');
    const oldFinal = service.finalCost;
    if (newFinal === oldFinal) {
      onClose();
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    try {
      const newSettle = settlementAmount(newFinal, service.downPayment);
      const incomes = await repository.list('incomes');
      // All settlement income rows for this ticket (split payment → several).
      const settleIncomes = incomes.filter(
        (i) => i.serviceId === service.id && !i.deletedAt && i.description === settlementIncomeDescription(service.serviceNo),
      );
      // Reverse every existing settlement row: refund its wallet, then remove it.
      for (const inc of settleIncomes) {
        const wallet = wallets.find((w) => w.id === inc.walletId);
        if (wallet) await repository.put('wallets', applyBalance(wallet, -inc.amount));
        await repository.remove('incomes', inc.id);
      }
      // Rebook the corrected balance (if any) to a single wallet. Prefer the
      // wallet of the first prior settlement leg; else last-used. Split is not
      // re-prompted on correction — owner adjusts the number, cash stays sane.
      const targetWalletId = settleIncomes[0]?.walletId ?? defaultWallet();
      if (newSettle > 0 && targetWalletId) {
        const wallet = wallets.find((w) => w.id === targetWalletId);
        if (wallet) await repository.put('wallets', applyBalance(wallet, newSettle));
        await repository.put('incomes', {
          id: newId(),
          orgId: service.orgId,
          outletId: service.outletId,
          date: localDateStr(),
          category: 'Servis',
          amount: newSettle,
          walletId: targetWalletId,
          description: settlementIncomeDescription(service.serviceNo),
          serviceId: service.id,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
      await repository.put('services', {
        ...service,
        finalCost: newFinal,
        updatedAt: now,
        history: [
          ...(service.history ?? []),
          {
            at: now,
            status: 'edit',
            by: me?.id ?? '',
            byName: me?.name ?? '',
            note: `Koreksi biaya final: ${fmtRp(oldFinal)} → ${fmtRp(newFinal)}`,
            internal: true,
          },
        ],
      });
      logActivity({
        action: 'service.status',
        entityType: 'service',
        entityId: service.id,
        entityLabel: service.serviceNo,
        meta: { correctFinalCost: true, from: oldFinal, to: newFinal },
      });
      toast.success('Biaya final dikoreksi');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengoreksi biaya final');
    } finally {
      setBusy(false);
    }
  };

  const apply = mode === 'dp' ? applyDp : mode === 'koreksi' ? applyKoreksi : applyStatus;
  const applyLabel = mode === 'dp' ? 'Simpan DP' : mode === 'koreksi' ? 'Perbarui Biaya' : 'Terapkan';
  const noActions = modes.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Update — ${service.serviceNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={apply} loading={busy} disabled={noActions}>
            {applyLabel}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.current}>
          <span className={styles.label}>Status saat ini</span>
          <Badge tone={STATUS_TONE[service.status] as 'brand'}>{STATUS_LABELS[service.status]}</Badge>
        </div>

        {modes.length > 1 && (
          <div className={styles.modeTabs}>
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                className={[styles.modeTab, mode === m ? styles.modeTabActive : ''].join(' ')}
                onClick={() => setMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        )}

        {service.spareparts.length > 0 && (
          <div className={styles.partsSummary}>
            <span className={styles.label}>Sparepart & Modal</span>
            <ul className={styles.partsList}>
              {service.spareparts.map((p, i) => (
                <li key={`${p.itemId ?? 'm'}-${i}`}>
                  <span>
                    {p.kind === 'manual' ? '💵 ' : ''}
                    {p.name}
                    {p.kind === 'manual' ? '' : ` ×${p.qty}`}
                  </span>
                  <span className={styles.partCost}>{fmtRp(p.kind === 'manual' ? p.costPrice : p.sellPrice * p.qty)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.partsHint}>Kelola sparepart & modal di halaman detail servis.</p>
          </div>
        )}

        {noActions && (
          <p className={styles.terminal}>
            Status ini final, tidak ada aksi lanjutan
            {!canSetStatus(role, 'lunas') && ' (sebagian aksi butuh peran owner/admin)'}.
          </p>
        )}

        {/* ---- Status sub-action ---- */}
        {mode === 'status' && allowed.length > 0 && (
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
            {target === 'lunas' && settleDue > 0 && (
              <div className={styles.splitBlock}>
                <span className={styles.splitLabel}>Pembayaran (bisa dipecah ke beberapa wallet)</span>
                {splits.map((s, i) => (
                  <div key={i} className={styles.splitRow}>
                    <Select
                      value={s.walletId}
                      onChange={(e) => setSplitWallet(i, e.target.value)}
                      options={walletOptions}
                      placeholder="Wallet…"
                    />
                    <Input
                      value={s.amount}
                      onChange={(e) => setSplitAmount(i, e.target.value)}
                      placeholder="0"
                    />
                    {splits.length > 1 && (
                      <button
                        type="button"
                        className={styles.splitRemove}
                        onClick={() => removeSplit(i)}
                        title="Hapus pembayaran"
                        aria-label="Hapus pembayaran"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <div className={styles.splitFooter}>
                  <button type="button" className={styles.splitAdd} onClick={addSplit}>
                    + Tambah wallet
                  </button>
                  <span
                    className={styles.splitTally}
                    data-balanced={splitPaid === settleDue}
                  >
                    {fmtRp(splitPaid)} / {fmtRp(settleDue)}
                  </span>
                </div>
              </div>
            )}
            {needsWarranty && (
              <div className={styles.warranty}>
                <span className={styles.warrantyLabel}>Garansi (isi minimal salah satu)</span>
                <div className={styles.warrantyRow}>
                  <div className={styles.warrantyField}>
                    <Input
                      label="Garansi Jasa (hari)"
                      type="number"
                      inputMode="numeric"
                      value={warrantyService}
                      onChange={(e) => setWarrantyService(e.target.value)}
                      placeholder="30"
                    />
                    {warrantyPresets.length > 0 && (
                      <div className={styles.presetRow}>
                        {warrantyPresets.map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={styles.presetChip}
                            onClick={() => setWarrantyService(String(d))}
                            title={`Garansi jasa ${d} hari`}
                          >
                            {d} hari
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.warrantyField}>
                    <Input
                      label="Garansi Sparepart (hari)"
                      type="number"
                      inputMode="numeric"
                      value={warrantyParts}
                      onChange={(e) => setWarrantyParts(e.target.value)}
                      placeholder="7"
                    />
                    {warrantyPresets.length > 0 && (
                      <div className={styles.presetRow}>
                        {warrantyPresets.map((d) => (
                          <button
                            key={d}
                            type="button"
                            className={styles.presetChip}
                            onClick={() => setWarrantyParts(String(d))}
                            title={`Garansi sparepart ${d} hari`}
                          >
                            {d} hari
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {target === 'batal' && service.downPayment > 0 && (
              <div className={styles.warranty}>
                <span className={styles.warrantyLabel}>Refund DP (DP diterima: {fmtRp(service.downPayment)})</span>
                <div className={styles.warrantyRow}>
                  <Input
                    label="Nominal Refund"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(fmtRpInput(e.target.value))}
                    placeholder="0"
                  />
                  <Select
                    label="Dari wallet"
                    value={refundWalletId}
                    onChange={(e) => setRefundWalletId(e.target.value)}
                    options={walletOptions}
                    placeholder="Pilih wallet…"
                  />
                </div>
                <p className={styles.dp}>
                  Kosongkan/0 jika DP tidak dikembalikan (jadi pendapatan toko). Refund dicatat sebagai pengeluaran; income DP tetap tersimpan.
                </p>
              </div>
            )}
            {needsHandling && (
              <Input
                label="Penanganan (wajib)"
                value={handling}
                onChange={(e) => setHandling(e.target.value)}
                placeholder="Contoh: ganti LCD, unit sudah dites normal"
              />
            )}
            <Input
              label={noteRequired ? 'Catatan (wajib)' : 'Catatan (opsional)'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                target === 'batal'
                  ? 'Contoh: pelanggan menolak biaya, unit tidak bisa diperbaiki'
                  : target === 'selesai'
                    ? 'Contoh: casing lama dikembalikan ke pelanggan'
                    : 'Contoh: unit sudah dicek, menunggu sparepart'
              }
            />
            {service.downPayment > 0 && (
              <p className={styles.dp}>
                DP diterima: {fmtRp(service.downPayment)} · Sisa:{' '}
                {fmtRp(outstandingBalance({ ...service, finalCost: parseRpInput(finalCost) || service.finalCost }))}
              </p>
            )}
          </>
        )}

        {/* ---- DP sub-action ---- */}
        {mode === 'dp' && (
          <>
            {staffDpOnly && (
              <p className={styles.staffNote}>
                Pekerjaan {STATUS_LABELS[service.status].toLowerCase()}. Pelunasan hanya bisa
                dilakukan owner/admin. Kamu masih bisa menerima DP.
              </p>
            )}
            <Input
              label="Nominal DP"
              value={dpAmount}
              onChange={(e) => setDpAmount(fmtRpInput(e.target.value))}
              placeholder="100.000"
            />
            <Select
              label="Ke wallet"
              value={dpWalletId}
              onChange={(e) => setDpWalletId(e.target.value)}
              options={walletOptions}
              placeholder="Pilih wallet…"
            />
            <p className={styles.dp}>
              Menambah saldo wallet & tercatat di Keuangan (kategori Servis). Saat lunas hanya sisa tagihan yang dicatat.
              {service.downPayment > 0 && ` DP terkumpul saat ini: ${fmtRp(service.downPayment)}.`}
            </p>
          </>
        )}

        {/* ---- Koreksi sub-action ---- */}
        {mode === 'koreksi' && (
          <>
            <Input
              label="Biaya final (koreksi)"
              value={correctAmount}
              onChange={(e) => setCorrectAmount(fmtRpInput(e.target.value))}
              placeholder="0"
            />
            <p className={styles.dp}>
              Menyesuaikan pendapatan pelunasan & saldo wallet tanpa membatalkan tiket. Tercatat di log internal.
              {service.downPayment > 0 && ` DP diterima: ${fmtRp(service.downPayment)}.`}
            </p>
          </>
        )}

        <div className={styles.history}>
          <span className={styles.label}>Riwayat</span>
          <ul className={styles.timeline}>
            {[...history].reverse().map((h, i) => (
              <li key={i} className={styles.timelineItem}>
                <span className={styles.dot} data-tone={h.status === 'edit' ? 'neutral' : STATUS_TONE[h.status as ServiceStatus]} />
                <div>
                  <strong>{h.status === 'edit' ? 'Edit' : STATUS_LABELS[h.status as ServiceStatus]}</strong>
                  <small>
                    {fmtDate(localDateOf(h.at))} · {h.byName || '—'}
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
