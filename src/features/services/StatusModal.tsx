import { useState } from 'react';
import { Modal, Select, Input, Button, Badge, ConfirmDialog, Icon } from '@/components/ui';
import { useT } from '@/i18n';
import { PartWarrantyFields, WarrantyPresets } from './PartWarrantyFields';
import { repository } from '@/data';
import { saveServiceParts } from '@/data/serviceParts';
import { useCollection } from '@/hooks/useCollection';
import { useServiceHistory } from '@/hooks/useServiceHistory';
import {
  settleService,
  cancelService,
  recordDownPayment,
  correctServiceCost,
} from '@/data/supabase-client';
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
  applyPartWarranty,
  latestPartWarranty,
  overpaidAmount,
  overpaidRefundDescription,
  costCorrectionDescription,
} from '@/lib/business/services';
import type { PaymentSplit } from '@/lib/business/services';
import { applyBalance } from '@/lib/business/finance';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { getWarrantyServiceDays, getWarrantyPartsDays, getWarrantyPresets } from '@/config/orgConfig';
import { getLastExpenseWallet, setLastExpenseWallet } from '@/config/orgConfig';
import { useSessionStore } from '@/stores/session';
import { isCloudMode } from '@/stores/demo';
import type { Service, ServiceStatus } from '@/data/types';
import styles from './StatusModal.module.css';
import { interpolate } from '@/lib/business/notify';
import type { TranslationKey } from '@/i18n';

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

const MODE_LABELS: Record<Mode, TranslationKey> = {
  status: 'serviceStatus.modeStatus',
  dp: 'serviceStatus.modeDp',
  koreksi: 'serviceStatus.modeCorrect',
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
  // Garansi per sparepart (hari), sejajar indeks service.spareparts; 0 = tanpa garansi.
  const [partDays, setPartDays] = useState<string[]>([]);
  const [confirmNoWarranty, setConfirmNoWarranty] = useState(false);
  const [confirmZeroCost, setConfirmZeroCost] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const t = useT();
  // Settlement payment legs ("split payment"): each leg = wallet + amount.
  // A single-wallet payment is just one leg.
  const [splits, setSplits] = useState<{ walletId: string; amount: string }[]>([]);
  // DP sub-action
  const [dpAmount, setDpAmount] = useState('');
  const [dpWalletId, setDpWalletId] = useState('');
  // Cancel ("batal") sub-action: optional partial DP refund.
  const [refundAmount, setRefundAmount] = useState('');
  const [refundWalletId, setRefundWalletId] = useState('');
  // Servis ditunggu: Selesai sekaligus Lunas & diambil, satu kali Terapkan.
  const [express, setExpress] = useState(false);
  // Batal: indeks part stok yang terpakai (tidak dikembalikan ke rak).
  const [consumedParts, setConsumedParts] = useState<ReadonlySet<number>>(new Set());
  // Koreksi sub-action
  const [correctAmount, setCorrectAmount] = useState('');
  const [correctWalletId, setCorrectWalletId] = useState('');

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
      setPartDays(service.spareparts.map((p) => (p.warrantyDays != null ? String(p.warrantyDays) : '')));
      setConfirmNoWarranty(false);
      setConfirmZeroCost(false);
      setConfirmCancel(false);
      setSplits([]);
      setDpAmount('');
      setDpWalletId(defaultWallet());
      setRefundAmount('');
      setRefundWalletId(defaultWallet());
      setConsumedParts(new Set());
      setExpress(false);
      setCorrectAmount(service.finalCost ? fmtRpInput(String(service.finalCost)) : '');
      setCorrectWalletId(defaultWallet());
    }
  }

  if (!service) return null;

  const needsCost = target === 'konfirmasi' || target === 'selesai' || target === 'lunas';
  // Tiket klaim tidak memberi garansi baru — yang berlaku tetap garansi tiket asli.
  const needsWarranty = target === 'selesai' && !service.warrantyClaimOf;
  // Dibuka lagi dari Selesai (salah tandai): garansi yang ditetapkan saat Selesai dihapus.
  const reopening = service.status === 'selesai' && target === 'pengerjaan';
  // Cancellation must say why. Completion documents what was done in its own
  // required "Penanganan" field, so its note is optional like everywhere else.
  const noteRequired = target === 'batal';
  const needsHandling = target === 'selesai';
  // Pelunasan terjadi di modal ini: Lunas biasa, atau Selesai + "langsung lunas".
  const canExpress = target === 'selesai' && canSetStatus(role, 'lunas');
  const paying = target === 'lunas' || (canExpress && express);
  const warrantyPresets = getWarrantyPresets();
  // Part stok yang masih dipegang tiket — yang bisa dipilih nasibnya saat Batal.
  const heldParts = service.spareparts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => part.kind !== 'manual' && part.itemId != null && part.deducted);
  const walletOptions = wallets.map((w) => ({ value: w.id, label: w.name }));

  // Amount still owed at settlement given the (possibly edited) final cost.
  const settleDue = settlementAmount(parseRpInput(finalCost) || service.finalCost, service.downPayment);
  // DP melebihi biaya final (mis. DP 300rb, biaya ternyata 250rb).
  const effectiveCost = parseRpInput(finalCost) || service.finalCost;
  const lunasExcess = effectiveCost > 0 ? overpaidAmount(effectiveCost, service.downPayment) : 0;
  // Koreksi: + diterima ke wallet, − dikembalikan dari wallet.
  const correctDelta = correctAmount.trim() ? parseRpInput(correctAmount) - service.finalCost : 0;

  // Satu kaki pembayaran senilai sisa tagihan (kasus umum) + tawaran refund
  // penuh bila DP melebihi biaya; bisa dipecah/dikurangi dari sana.
  const seedPayment = (costInput: string) => {
    const cost = parseRpInput(costInput) || service.finalCost;
    const due = settlementAmount(cost, service.downPayment);
    setSplits([{ walletId: defaultWallet(), amount: due > 0 ? fmtRpInput(String(due)) : '' }]);
    const excess = overpaidAmount(cost, service.downPayment);
    if (excess > 0) {
      setRefundAmount(fmtRpInput(String(excess)));
      setRefundWalletId((w) => w || defaultWallet());
    }
  };

  const onTargetChange = (next: ServiceStatus | '') => {
    setTarget(next);
    if (next !== 'selesai') setExpress(false);
    if (next === 'selesai') {
      setWarrantyService((v) => (v === '' ? String(getWarrantyServiceDays()) : v));
      setPartDays((prev) =>
        // Garansi bawaan item inventori (0067) lebih dulu, lalu garansi part toko.
        service.spareparts.map((p, i) => (prev[i] ? prev[i] : String(p.defaultWarrantyDays ?? getWarrantyPartsDays()))),
      );
    }
    if (next === 'lunas') seedPayment(finalCost);
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
  const applyStatus = async (opts?: { noWarrantyOk?: boolean; zeroCostOk?: boolean }) => {
    if (!target) return toast.warning(t('serviceStatus.targetRequired'));
    if (noteRequired && !note.trim()) {
      return toast.warning(interpolate(t('serviceStatus.noteRequired'), { status: t(`statusLabel.${target}`) }));
    }
    if (needsHandling && !handling.trim()) {
      return toast.warning(t('serviceStatus.handlingRequired'));
    }
    const svcDays = Math.max(0, Math.round(Number(warrantyService) || 0));
    const partsDays = service.spareparts.map((_, i) => Math.max(0, Math.round(Number(partDays[i]) || 0)));
    // Tanpa garansi sama sekali boleh (mis. unit kena air), tapi harus disengaja.
    if (needsWarranty && !opts?.noWarrantyOk && svcDays === 0 && partsDays.every((d) => d === 0)) {
      setConfirmNoWarranty(true);
      return;
    }
    const cost = needsCost ? parseRpInput(finalCost) : service.finalCost;
    // Rp 0 boleh (mis. digratiskan), tapi harus disengaja — kecuali tiket klaim garansi.
    if (needsCost && cost === 0 && !service.warrantyClaimOf && !opts?.zeroCostOk) {
      setConfirmZeroCost(true);
      return;
    }
    const settle = settlementAmount(cost, service.downPayment);
    if (paying && settle > 0) {
      const err = validateSplit(splitsAsNumbers(), settle);
      if (err === 'empty') return toast.warning(t('serviceStatus.paymentRequired'));
      if (err === 'mismatch')
        return toast.warning(interpolate(t('serviceStatus.paymentMismatch'), { paid: fmtRp(splitPaid), due: fmtRp(settle) }));
    }
    // Kelebihan DP dikembalikan saat pelunasan, bukan hilang diam-diam.
    const excess = paying ? overpaidAmount(cost, service.downPayment) : 0;
    const excessRefund = excess > 0 ? parseRpInput(refundAmount) : 0;
    if (excessRefund > excess) {
      return toast.warning(interpolate(t('serviceStatus.refundTooBig'), { amount: fmtRp(excess) }));
    }
    if (excessRefund > 0 && !refundWalletId) return toast.warning(t('serviceStatus.refundWalletRequired'));
    setBusy(true);
    const now = new Date().toISOString();
    try {
      // Modal bisa lama terbuka. Bila tiket berubah di perangkat lain sejak itu
      // (status, DP, sparepart), angka di form ini sudah tidak berlaku.
      const fresh = await repository.get('services', service.id);
      if (
        fresh &&
        (fresh.status !== service.status ||
          fresh.downPayment !== service.downPayment ||
          JSON.stringify(fresh.spareparts) !== JSON.stringify(service.spareparts))
      ) {
        throw new Error(t('serviceStatus.staleTicket'));
      }
      const { deductions, updated } = computeStockDeduction(service.spareparts, target);
      // Baris lama yang belum dipotong: stok & tanda `deducted` ditulis bersama (0064).
      if (deductions.length) await saveServiceParts(service, updated);

      const finishDate = localDateStr();
      const warrantyServiceUntil = needsWarranty
        ? (svcDays > 0 ? addDays(finishDate, svcDays) : null)
        : (reopening ? null : service.warrantyServiceUntil);
      // Garansi per part ditetapkan saat Selesai; tanggal tiket = part paling akhir.
      const partsWithWarranty = needsWarranty
        ? applyPartWarranty(updated, partsDays, finishDate)
        : reopening
          ? updated.map(({ warrantyDays: _days, warrantyUntil: _until, ...sp }) => sp)
          : updated;
      const warrantyPartsUntil = needsWarranty
        ? latestPartWarranty(partsWithWarranty)
        : (reopening ? null : service.warrantyPartsUntil);

      const changes = {
        status: target,
        finalCost: cost,
        warrantyServiceUntil,
        warrantyPartsUntil,
        spareparts: partsWithWarranty,
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
            note:
              [
                needsHandling ? handling.trim() : '',
                note.trim(),
                target === 'batal' && consumedParts.size > 0
                  ? `Part terpakai: ${[...consumedParts].map((i) => service.spareparts[i]?.name).join(', ')}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ') || STATUS_LABELS[target],
            internal: false,
          },
        ],
      } satisfies Partial<Service>;
      const updatedService: Service = { ...service, ...changes };
      // Cloud: pelunasan & pembatalan ditulis SELURUHNYA oleh RPC dalam satu
      // transaksi (status, biaya final, riwayat, uang, stok — 0061). Dulu status
      // disimpan lebih dulu, sehingga RPC yang gagal meninggalkan tiket Lunas
      // tanpa pemasukan atau Batal tanpa stok kembali, dan tak bisa diulang.
      // Demo memakai adapter di memori, jadi ikut jalur lokal.
      const cloud = isCloudMode();
      // Hanya kolom yang diubah modal ini — DP tidak pernah ikut dikirim.
      if (!(cloud && (target === 'lunas' || target === 'batal'))) {
        await repository.patch('services', service.id, changes);
      }

      // Settle ("lunas"): book income for the bill still owed after DP, split
      // across one or more wallets. Cloud uses the atomic settle_service RPC
      // (member-allowed) with ALL legs — also when DP covers the bill (no legs),
      // so the status change itself is validated server-side; local mirrors it
      // per-leg directly. Income tagged to the service's outlet.
      // Servis ditunggu: tiket baru saja disimpan Selesai di atas, lalu dilunasi
      // di sini lewat jalur yang sama dengan Lunas biasa.
      const settleHistory = express && paying
        ? [
            ...changes.history,
            { at: now, status: 'lunas' as const, by: me?.id ?? '', byName: me?.name ?? '', note: STATUS_LABELS.lunas, internal: false },
          ]
        : changes.history;
      if (paying && (settle > 0 || cloud)) {
        const legs = settle > 0 ? normalizeSplits(splitsAsNumbers()) : [];
        if (cloud) {
          await settleService({
            orgId: service.orgId,
            serviceId: service.id,
            payments: legs,
            history: settleHistory,
            outletId: service.outletId,
            finalCost: cost,
            ...(excessRefund > 0 ? { refundAmount: excessRefund, refundWalletId } : {}),
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
      if (express && paying) {
        if (!cloud) await repository.patch('services', service.id, { status: 'lunas', history: settleHistory, updatedAt: now });
        await repository.patch('services', service.id, {
          pickedUp: true,
          pickedUpAt: now,
          updatedAt: now,
          history: [
            ...settleHistory,
            { at: now, status: 'edit', by: me?.id ?? '', byName: me?.name ?? '', note: 'Barang diambil pelanggan', internal: false },
          ],
        });
      }
      // Lokal/demo: refund kelebihan DP sebagai pengeluaran (cloud: di RPC yang sama).
      if (!cloud && excessRefund > 0) {
        const wallet = wallets.find((w) => w.id === refundWalletId);
        if (wallet) {
          await repository.put('expenses', {
            id: newId(),
            orgId: service.orgId,
            outletId: service.outletId,
            date: localDateStr(),
            category: 'Lainnya',
            amount: excessRefund,
            walletId: wallet.id,
            description: overpaidRefundDescription(service.serviceNo),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          await repository.put('wallets', applyBalance(wallet, -excessRefund));
        }
      }

      // Cancel ("batal"): give back deducted stock AND optionally refund a CHOSEN
      // part of the DP. Cloud uses the atomic cancel_service RPC (member-allowed).
      // Refund model (0031): the DP income is KEPT; the refunded portion is booked
      // as an expense — local mirrors that so reports match across modes.
      if (target === 'batal') {
        const refund = service.downPayment > 0 ? Math.min(parseRpInput(refundAmount), service.downPayment) : 0;
        if (cloud) {
          await cancelService({
            orgId: service.orgId,
            serviceId: service.id,
            history: updatedService.history ?? [],
            outletId: service.outletId,
            refundAmount: refund,
            refundWalletId: refund > 0 ? refundWalletId : null,
            keepParts: [...consumedParts],
          });
        } else {
          const { restorations, updated: restoredParts } = computeStockRestore(service.spareparts, consumedParts);
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
        meta: { from: service.status, to: express && paying ? 'lunas' : target, ...(express && paying ? { express: true } : {}) },
      });
      toast.success(
        express && paying
          ? t('serviceStatus.expressDone')
          : interpolate(t('serviceStatus.statusDone'), { status: t(`statusLabel.${target}`) }),
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('serviceStatus.updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  // ---- Sub-action: receive DP (real cash in) ----
  const applyDp = async () => {
    const amount = parseRpInput(dpAmount);
    if (amount <= 0) return toast.warning(t('serviceStatus.dpAmountRequired'));
    if (!dpWalletId) return toast.warning(t('serviceStatus.dpWalletRequired'));
    setBusy(true);
    const now = new Date().toISOString();
    try {
      // DP is a billing write (income + wallet). Cloud uses the atomic
      // record_down_payment RPC (member-allowed) since direct wallet/income
      // writes are manager-only under RLS 0028; local mirrors it directly.
      const incomeId = newId();
      // Demo memakai adapter di memori, jadi DP-nya dicatat lokal.
      if (isCloudMode()) {
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
      toast.success(t('serviceStatus.dpDone'));
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('serviceStatus.dpFailed'));
    } finally {
      setBusy(false);
    }
  };

  // ---- Sub-action: correct final cost after settlement (owner/admin) ----
  // Hanya selisihnya yang dibukukan, hari ini. Pelunasan lama tidak disentuh,
  // jadi pendapatan bulan lalu tidak pindah ke bulan ini (dulu dihapus & dibukukan ulang).
  const applyKoreksi = async () => {
    if (!correctAmount.trim()) return toast.warning(t('serviceStatus.finalRequired'));
    const newFinal = parseRpInput(correctAmount);
    const oldFinal = service.finalCost;
    const delta = newFinal - oldFinal;
    if (delta === 0) {
      onClose();
      return;
    }
    const wallet = wallets.find((w) => w.id === correctWalletId);
    if (!wallet) return toast.warning(t('serviceStatus.walletRequired'));
    if (delta < 0 && wallet.balance < -delta) {
      return toast.warning(interpolate(t('serviceStatus.walletShort'), { wallet: wallet.name, amount: fmtRp(-delta) }));
    }
    setBusy(true);
    const now = new Date().toISOString();
    const history = [
      ...(service.history ?? []),
      {
        at: now,
        status: 'edit' as const,
        by: me?.id ?? '',
        byName: me?.name ?? '',
        note: `Koreksi biaya final: ${fmtRp(oldFinal)} → ${fmtRp(newFinal)}`,
        internal: true,
      },
    ];
    try {
      if (isCloudMode()) {
        await correctServiceCost({
          orgId: service.orgId,
          serviceId: service.id,
          finalCost: newFinal,
          walletId: wallet.id,
          history,
        });
      } else {
        const row = {
          id: newId(),
          orgId: service.orgId,
          outletId: service.outletId,
          date: localDateStr(),
          amount: Math.abs(delta),
          walletId: wallet.id,
          description: costCorrectionDescription(service.serviceNo),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        if (delta > 0) await repository.put('incomes', { ...row, category: 'Servis', serviceId: service.id });
        else await repository.put('expenses', { ...row, category: 'Lainnya' });
        await repository.put('wallets', applyBalance(wallet, delta));
        await repository.put('services', { ...service, finalCost: newFinal, updatedAt: now, history });
      }
      setLastExpenseWallet(wallet.id);
      logActivity({
        action: 'service.status',
        entityType: 'service',
        entityId: service.id,
        entityLabel: service.serviceNo,
        meta: { correctFinalCost: true, from: oldFinal, to: newFinal },
      });
      toast.success(
        delta > 0
          ? interpolate(t('serviceStatus.correctedIn'), { amount: fmtRp(delta), wallet: wallet.name })
          : interpolate(t('serviceStatus.correctedOut'), { amount: fmtRp(-delta), wallet: wallet.name }),
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('serviceStatus.correctFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Biaya Final berubah (ketik atau chip estimasi): satu pembayaran ikut; yang
  // sudah dipecah dibiarkan.
  const changeCost = (next: string) => {
    setFinalCost(next);
    if (paying && splits.length === 1) {
      const due = settlementAmount(parseRpInput(next), service.downPayment);
      setSplits([{ ...splits[0], amount: due > 0 ? fmtRpInput(String(due)) : '' }]);
    }
  };

  // Batal itu final dan memindah uang + stok: tombolnya menyebut konsekuensinya
  // dan selalu lewat konfirmasi berisi ringkasan.
  const cancelling = mode === 'status' && target === 'batal';
  const cancelRefund = service.downPayment > 0 ? Math.min(parseRpInput(refundAmount), service.downPayment) : 0;
  const partNames = (keepUsed: boolean) =>
    heldParts
      .filter(({ index }) => consumedParts.has(index) === keepUsed)
      .map(({ part }) => `${part.name} ×${part.qty}`)
      .join(', ');
  const cancelSummary = [
    t('serviceStatus.confirmCancelFinal'),
    cancelRefund > 0
      ? t('serviceStatus.confirmCancelRefund')
          .replace('{amount}', fmtRp(cancelRefund))
          .replace('{wallet}', wallets.find((w) => w.id === refundWalletId)?.name ?? '—')
      : service.downPayment > 0
        ? t('serviceStatus.confirmCancelKeep').replace('{amount}', fmtRp(service.downPayment))
        : '',
    partNames(false) && t('serviceStatus.confirmCancelToStock').replace('{parts}', partNames(false)),
    partNames(true) && t('serviceStatus.confirmCancelUsed').replace('{parts}', partNames(true)),
  ]
    .filter(Boolean)
    .join(' ');
  const requestCancel = () => {
    if (!note.trim()) return toast.warning(interpolate(t('serviceStatus.noteRequired'), { status: t('statusLabel.batal') }));
    setConfirmCancel(true);
  };

  const apply =
    mode === 'dp' ? applyDp : mode === 'koreksi' ? applyKoreksi : cancelling ? requestCancel : () => applyStatus();
  const applyLabel =
    mode === 'dp'
      ? t('serviceStatus.saveDp')
      : mode === 'koreksi'
        ? t('serviceStatus.updateCost')
        : cancelling
          ? cancelRefund > 0
            ? t('serviceStatus.cancelRefund').replace('{amount}', fmtRp(cancelRefund))
            : t('serviceStatus.cancelTicket')
          : paying
            ? express
              ? `${t('serviceStatus.expressApply')}${settleDue > 0 ? ` · ${fmtRp(settleDue)}` : ''}`
              : settleDue > 0
                ? t('serviceStatus.receive').replace('{amount}', fmtRp(settleDue))
                : t('serviceStatus.markPaid')
            : t('serviceStatus.apply');
  const noActions = modes.length === 0;
  const estimate = service.estimateCost ?? 0;
  const workTargets = allowed.filter((s) => s !== 'batal');

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={interpolate(t('serviceStatus.title'), { no: service.serviceNo })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant={cancelling ? 'danger' : 'primary'}
            className={styles.applyBtn}
            onClick={apply}
            loading={busy}
            disabled={noActions}
          >
            {applyLabel}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.current}>
          <span className={styles.label}>{t('serviceStatus.current')}</span>
          <Badge tone={STATUS_TONE[service.status] as 'brand'}>{t(`statusLabel.${service.status}`)}</Badge>
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
                {t(MODE_LABELS[m])}
              </button>
            ))}
          </div>
        )}

        {service.spareparts.length > 0 && (
          <div className={styles.partsSummary}>
            <span className={styles.label}>{t('serviceStatus.partsAndCost')}</span>
            <ul className={styles.partsList}>
              {service.spareparts.map((p, i) => (
                <li key={`${p.itemId ?? 'm'}-${i}`}>
                  <span className={styles.partName}>
                    {p.kind === 'manual' && <Icon name="money-bill-wave" aria-hidden />}
                    {p.name}
                    {p.kind === 'manual' ? '' : ` ×${p.qty}`}
                  </span>
                  <span className={styles.partCost}>{fmtRp(p.kind === 'manual' ? p.costPrice : p.sellPrice * p.qty)}</span>
                </li>
              ))}
            </ul>
            <p className={styles.partsHint}>{t('serviceStatus.partsHint')}</p>
          </div>
        )}

        {noActions && (
          <p className={styles.terminal}>
            {t('serviceStatus.final')}
            {!canSetStatus(role, 'lunas') && t('serviceStatus.finalRole')}.
          </p>
        )}

        {/* ---- Status sub-action ---- */}
        {mode === 'status' && allowed.length > 0 && (
          <>
            {/* Status tujuan = kanal instrumen, satu ketukan. Batal dipisah di
                bawah seam titik: final dan memindah uang, tak boleh sejajar
                dengan langkah kerja biasa. */}
            <div className={styles.channelBlock} role="radiogroup" aria-label={t('serviceStatus.target')}>
              <span className={styles.label}>{t('serviceStatus.target')}</span>
              {workTargets.length > 0 && (
                <div className={styles.channels}>
                  {workTargets.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={target === s}
                      data-tone={STATUS_TONE[s]}
                      className={styles.channel}
                      onClick={() => onTargetChange(s)}
                    >
                      <span className={styles.channelLed} aria-hidden />
                      {t(`statusLabel.${s}`)}
                    </button>
                  ))}
                </div>
              )}
              {allowed.includes('batal') && (
                <div className={styles.channelDangerRow}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={target === 'batal'}
                    data-tone="danger"
                    className={styles.channel}
                    onClick={() => onTargetChange('batal')}
                  >
                    <span className={styles.channelLed} aria-hidden />
                    {t('statusLabel.batal')}
                  </button>
                </div>
              )}
            </div>
            {reopening && (
              <p className={styles.dp}>
                {t('serviceStatus.reopenNote')}
              </p>
            )}
            {needsCost && (
              <div className={styles.costField}>
                <Input
                  label={t('serviceStatus.finalCost')}
                  value={finalCost}
                  onChange={(e) => changeCost(fmtRpInput(e.target.value))}
                  placeholder="0"
                  inputMode="numeric"
                />
                {/* Estimasi saat intake tak perlu diingat lalu diketik ulang. */}
                {/* Hanya sebelum harga disepakati: setelah Konfirmasi, chip ini bisa
                    menurunkan harga yang sudah disetujui pelanggan dengan satu ketukan. */}
                {estimate > 0 && service.finalCost <= 0 && parseRpInput(finalCost) !== estimate && (
                  <button
                    type="button"
                    className={styles.estimateChip}
                    onClick={() => changeCost(fmtRpInput(String(estimate)))}
                  >
                    {t('serviceStatus.useEstimate').replace('{amount}', fmtRp(estimate))}
                  </button>
                )}
              </div>
            )}
            {needsHandling && (
              <Input
                label={t('serviceStatus.handling')}
                value={handling}
                onChange={(e) => setHandling(e.target.value)}
                placeholder={t('serviceStatus.handlingPh')}
              />
            )}
            {canExpress && (
              <div className={styles.expressRow}>
                <span className={styles.expressText}>
                  <strong>{t('serviceStatus.expressQ')}</strong>
                  <small>{t('serviceStatus.expressSub')}</small>
                </span>
                <button
                  type="button"
                  className={styles.expressToggle}
                  aria-pressed={express}
                  aria-label={t('serviceStatus.expressAria')}
                  onClick={() => {
                    if (!express) seedPayment(finalCost);
                    setExpress(!express);
                  }}
                >
                  {t(express ? 'serviceStatus.expressOn' : 'serviceStatus.expressOff')}
                </button>
              </div>
            )}
            {paying && settleDue > 0 && (
              <div className={styles.splitBlock}>
                <span className={styles.splitLabel}>{t('serviceStatus.splitLabel')}</span>
                {splits.map((s, i) => (
                  <div key={i} className={styles.splitRow}>
                    <Select
                      aria-label={interpolate(t('serviceStatus.splitWallet'), { n: String(i + 1) })}
                      value={s.walletId}
                      onChange={(e) => setSplitWallet(i, e.target.value)}
                      options={walletOptions}
                      placeholder={t('serviceStatus.walletPh')}
                    />
                    <Input
                      aria-label={interpolate(t('serviceStatus.splitAmount'), { n: String(i + 1) })}
                      inputMode="numeric"
                      value={s.amount}
                      onChange={(e) => setSplitAmount(i, e.target.value)}
                      placeholder="0"
                    />
                    {splits.length > 1 && (
                      <button
                        type="button"
                        className={styles.splitRemove}
                        onClick={() => removeSplit(i)}
                        title={t('serviceStatus.splitRemove')}
                        aria-label={t('serviceStatus.splitRemove')}
                      >
                        <Icon name="xmark" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
                <div className={styles.splitFooter}>
                  <button type="button" className={styles.splitAdd} onClick={addSplit}>
                    <Icon name="plus" aria-hidden /> {t('serviceStatus.splitAdd')}
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
                <span className={styles.warrantyLabel}>{t('serviceStatus.warrantyLabel')}</span>
                <div className={styles.warrantyField}>
                  <Input
                    label={t('serviceStatus.warrantyService')}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={warrantyService}
                    onChange={(e) => setWarrantyService(e.target.value)}
                    placeholder="30"
                  />
                  <WarrantyPresets
                    presets={warrantyPresets}
                    onPick={(d) => setWarrantyService(String(d))}
                    what={t('partWarranty.service')}
                  />
                </div>
                {service.spareparts.length > 0 && (
                  // Terisi dari garansi bawaan item/toko; jarang diubah, jadi dilipat.
                  <details className={[styles.fold, styles.partWarranty].join(' ')}>
                    <summary className={styles.foldSummary}>
                      {t('serviceStatus.partWarranty')}
                      <span className={styles.foldCount}>
                        {t('serviceStatus.partCount').replace('{n}', String(service.spareparts.length))}
                      </span>
                    </summary>
                    <PartWarrantyFields
                      parts={service.spareparts}
                      values={partDays}
                      onChange={(i, v) =>
                        setPartDays((prev) =>
                          service.spareparts.map((_, j) => (j === i ? v : prev[j] ?? '')),
                        )
                      }
                      presets={warrantyPresets}
                    />
                  </details>
                )}
              </div>
            )}
            {paying && lunasExcess > 0 && (
              <div className={styles.warranty}>
                <span className={styles.warrantyLabel}>
                  {interpolate(t('serviceStatus.excessLabel'), { amount: fmtRp(lunasExcess), dp: fmtRp(service.downPayment) })}
                </span>
                <div className={styles.warrantyRow}>
                  <Input
                    label={t('serviceStatus.refundToCustomer')}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(fmtRpInput(e.target.value))}
                    placeholder="0"
                  />
                  <Select
                    label={t('serviceStatus.fromWallet')}
                    value={refundWalletId}
                    onChange={(e) => setRefundWalletId(e.target.value)}
                    options={walletOptions}
                    placeholder={t('serviceStatus.pickWallet')}
                  />
                </div>
                <p className={styles.dp}>
                  {t('serviceStatus.excessHint')}
                </p>
              </div>
            )}
            {target === 'batal' && service.downPayment > 0 && (
              <div className={styles.warranty}>
                <span className={styles.warrantyLabel}>
                  {interpolate(t('serviceStatus.refundDpLabel'), { amount: fmtRp(service.downPayment) })}
                </span>
                <div className={styles.warrantyRow}>
                  <Input
                    label={t('serviceStatus.refundAmount')}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(fmtRpInput(e.target.value))}
                    placeholder="0"
                  />
                  <Select
                    label={t('serviceStatus.fromWallet')}
                    value={refundWalletId}
                    onChange={(e) => setRefundWalletId(e.target.value)}
                    options={walletOptions}
                    placeholder={t('serviceStatus.pickWallet')}
                  />
                </div>
                <p className={styles.dp}>
                  {t('serviceStatus.refundDpHint')}
                </p>
              </div>
            )}
            {target === 'batal' && heldParts.length > 0 && (
              <div className={styles.warranty}>
                <span className={styles.warrantyLabel}>{t('serviceStatus.stockParts')}</span>
                <div className={styles.partFate}>
                  {heldParts.map(({ part, index }) => {
                    const used = consumedParts.has(index);
                    return (
                      <div key={index} className={styles.partFateRow}>
                        <span className={styles.partFateName}>
                          {part.name} ×{part.qty}
                        </span>
                        <button
                          type="button"
                          className={styles.partFateToggle}
                          aria-pressed={used}
                          aria-label={interpolate(t(used ? 'serviceStatus.partUsedAria' : 'serviceStatus.partBackAria'), { name: part.name })}
                          onClick={() =>
                            setConsumedParts((prev) => {
                              const next = new Set(prev);
                              if (used) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                        >
                          {t(used ? 'serviceStatus.partUsed' : 'serviceStatus.partBack')}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className={styles.dp}>
                  {t('serviceStatus.partFateHint')}
                </p>
              </div>
            )}
            <Input
              label={t(noteRequired ? 'serviceStatus.noteReq' : 'serviceStatus.noteOpt')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                target === 'batal'
                  ? t('serviceStatus.notePhCancel')
                  : target === 'selesai'
                    ? t('serviceStatus.notePhDone')
                    : t('serviceStatus.notePhWork')
              }
            />
            {service.downPayment > 0 && (
              <p className={styles.dp}>
                {interpolate(t('serviceStatus.dpLine'), { amount: fmtRp(service.downPayment) })}{' '}
                {needsCost && lunasExcess > 0
                  ? interpolate(t('serviceStatus.excessLine'), { amount: fmtRp(lunasExcess) }) +
                    (paying ? '' : t('serviceStatus.excessLater'))
                  : interpolate(t('serviceStatus.remaining'), {
                      amount: fmtRp(outstandingBalance({ ...service, finalCost: parseRpInput(finalCost) || service.finalCost })),
                    })}
              </p>
            )}
          </>
        )}

        {/* ---- DP sub-action ---- */}
        {mode === 'dp' && (
          <>
            {staffDpOnly && (
              <p className={styles.staffNote}>
                {interpolate(t('serviceStatus.staffDpOnly'), { status: t(`statusLabel.${service.status}`).toLowerCase() })}
              </p>
            )}
            <Input
              label={t('serviceStatus.dpAmount')}
              value={dpAmount}
              onChange={(e) => setDpAmount(fmtRpInput(e.target.value))}
              placeholder="100.000"
            />
            <Select
              label={t('serviceStatus.toWallet')}
              value={dpWalletId}
              onChange={(e) => setDpWalletId(e.target.value)}
              options={walletOptions}
              placeholder={t('serviceStatus.pickWallet')}
            />
            <p className={styles.dp}>
              {t('serviceStatus.dpHint')}
              {service.downPayment > 0 && interpolate(t('serviceStatus.dpSoFar'), { amount: fmtRp(service.downPayment) })}
            </p>
          </>
        )}

        {/* ---- Koreksi sub-action ---- */}
        {mode === 'koreksi' && (
          <>
            <Input
              label={t('serviceStatus.correctLabel')}
              value={correctAmount}
              onChange={(e) => setCorrectAmount(fmtRpInput(e.target.value))}
              placeholder="0"
            />
            <Select
              label={t(correctDelta < 0 ? 'serviceStatus.correctOutWallet' : 'serviceStatus.correctInWallet')}
              value={correctWalletId}
              onChange={(e) => setCorrectWalletId(e.target.value)}
              options={walletOptions}
              placeholder={t('serviceStatus.pickWallet')}
            />
            <p className={styles.dp}>
              {correctDelta > 0
                ? interpolate(t('serviceStatus.correctInHint'), { amount: fmtRp(correctDelta) })
                : correctDelta < 0
                  ? interpolate(t('serviceStatus.correctOutHint'), { amount: fmtRp(-correctDelta) })
                  : interpolate(t('serviceStatus.correctNow'), { amount: fmtRp(service.finalCost) })}{' '}
              {t('serviceStatus.correctTail')}
            </p>
          </>
        )}

        {/* Riwayat lengkap ada di halaman detail; di sini hanya rujukan, dilipat. */}
        <details className={[styles.fold, styles.history].join(' ')}>
          <summary className={styles.foldSummary}>
            {t('serviceStatus.history')}
            <span className={styles.foldCount}>{history.length}</span>
          </summary>
          <ul className={styles.timeline}>
            {[...history].reverse().map((h, i) => (
              <li key={i} className={styles.timelineItem}>
                <span className={styles.dot} data-tone={h.status === 'edit' ? 'neutral' : STATUS_TONE[h.status as ServiceStatus]} />
                <div>
                  <strong>{h.status === 'edit' ? t('serviceDetail.edit') : t(`statusLabel.${h.status as ServiceStatus}`)}</strong>
                  <small>
                    {fmtDate(localDateOf(h.at))} · {h.byName || '—'}
                    {h.note ? ` · ${h.note}` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmCancel}
      title={t('serviceStatus.confirmCancelTitle').replace('{no}', service.serviceNo)}
      message={cancelSummary}
      confirmLabel={t('serviceStatus.confirmCancelAction')}
      cancelLabel={t('common.back')}
      danger
      onCancel={() => setConfirmCancel(false)}
      onConfirm={() => {
        setConfirmCancel(false);
        void applyStatus();
      }}
    />
    <ConfirmDialog
      open={confirmNoWarranty}
      title={t('serviceStatus.noWarrantyTitle')}
      message={t('serviceStatus.noWarrantyMsg')}
      confirmLabel={t('serviceStatus.noWarrantyOk')}
      onCancel={() => setConfirmNoWarranty(false)}
      onConfirm={() => {
        setConfirmNoWarranty(false);
        void applyStatus({ noWarrantyOk: true });
      }}
    />
    <ConfirmDialog
      open={confirmZeroCost}
      title={t('serviceStatus.zeroTitle')}
      message={t('serviceStatus.zeroMsg')}
      confirmLabel={t('serviceStatus.zeroOk')}
      onCancel={() => setConfirmZeroCost(false)}
      onConfirm={() => {
        setConfirmZeroCost(false);
        void applyStatus({ noWarrantyOk: true, zeroCostOk: true });
      }}
    />
    </>
  );
}
