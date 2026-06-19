import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { useFormat } from '@/lib/useFormat';
import { useT } from '@/i18n';
import {
  STATUS_LABELS,
  outstandingBalance,
  serviceProfit,
  serviceModalTotal,
  walletDeltasForModalEdit,
  isTerminal,
  nextStatuses,
  canSetStatus,
  canClaimWarranty,
} from '@/lib/business/services';
import { applyBalance } from '@/lib/business/finance';
import { localDateStr } from '@/lib/time';
import { newId } from '@/lib/id';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { logActivity } from '@/lib/activity';
import { getLastExpenseWallet, setLastExpenseWallet } from '@/config/orgConfig';
import { trackingUrl } from '@/lib/business/notify';
import { Button, Icon, Input, Select } from '@/components/ui';
import { ServiceModal } from './ServiceModal';
import { StatusModal } from './StatusModal';
import { NotifyModal } from './NotifyModal';
import { printServiceReceipt } from './printReceipt';
import { WarrantyClaimModal } from './WarrantyClaimModal';
import { SparepartPickerModal } from './SparepartPickerModal';
import type { ServiceStatus, ServiceSparepart } from '@/data/types';
import styles from './ServiceDetailPage.module.css';

/** Linear "job traveler" stages (cancel handled separately). */
const TRAVELER: ServiceStatus[] = [
  'diterima',
  'diagnosa',
  'konfirmasi',
  'tunggu',
  'pengerjaan',
  'selesai',
  'lunas',
];

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { fmtMoney, fmtDate, fmtDateTime } = useFormat();

  const { data: services } = useCollection('services');
  const { data: customers } = useCollection('customers');
  const { data: wallets } = useCollection('wallets');
  const sessionEmployees = useSessionStore((s) => s.employees);
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const role = me?.role ?? 'karyawan';
  const isOwner = role === 'owner';
  const isManager = role === 'owner' || role === 'admin';

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Ad-hoc "modal dadakan" entry form (inline in the cost panel).
  const [modalFormOpen, setModalFormOpen] = useState(false);
  // Index of the manual line being edited; null = adding a new line.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalAmount, setModalAmount] = useState('');
  const [modalWalletId, setModalWalletId] = useState('');
  const [savingCost, setSavingCost] = useState(false);

  const service = useMemo(() => services.find((s) => s.id === id) ?? null, [services, id]);

  if (!service) {
    return (
      <div className={styles.notFound}>
        <span className={styles.nfCode}>404</span>
        <p>Servis tidak ditemukan.</p>
        <Button variant="secondary" onClick={() => navigate('/services')}>
          <Icon name="arrow-left" aria-hidden /> Kembali ke daftar
        </Button>
      </div>
    );
  }

  const cancelled = service.status === 'batal';
  const currentIndex = TRAVELER.indexOf(service.status);
  const outstanding = outstandingBalance(service);
  const profit = serviceProfit(service);
  const modalTotal = serviceModalTotal(service.spareparts);
  const claimable = canClaimWarranty(service, localDateStr());
  // When the only thing this role can do is take a DP (no allowed status
  // transitions, but the ticket isn't terminal), label the action accordingly
  // instead of the misleading "Update Status" — e.g. staff on a finished unit.
  const allowedNext = nextStatuses(service.status).filter((s) => canSetStatus(role, s));
  const onlyDp = allowedNext.length === 0 && !isTerminal(service.status);
  const originTicket = service.warrantyClaimOf
    ? services.find((s) => s.id === service.warrantyClaimOf) ?? null
    : null;

  /**
   * Append an inventory sparepart line AND deduct its stock immediately
   * (stock leaves the shelf the moment the part is committed to the ticket).
   * Re-reads the item as the authoritative guard against insufficient stock
   * (the picker's check uses cached state). The line is stored `deducted:true`
   * so the later "pengerjaan" transition won't deduct it again, and cancelling
   * the ticket gives the stock back (see computeStockRestore).
   */
  const addSparepartLine = async (line: ServiceSparepart) => {
    const now = new Date().toISOString();
    if (line.itemId) {
      const inventory = await repository.list('inventory');
      const item = inventory.find((i) => i.id === line.itemId);
      if (!item) return toast.error('Item inventory tidak ditemukan');
      if (item.stock < line.qty) {
        return toast.warning(`Stok ${item.name} hanya ${item.stock}, tidak cukup untuk ×${line.qty}`);
      }
      await repository.put('inventory', { ...item, stock: item.stock - line.qty });
    }
    await repository.put('services', {
      ...service,
      spareparts: [...service.spareparts, { ...line, deducted: line.itemId ? true : line.deducted }],
      updatedAt: now,
    });
    toast.success('Sparepart ditambahkan & stok dipotong');
  };

  /** Open the ad-hoc modal form for a NEW line, wallet defaults to last-used. */
  const openModalForm = () => {
    const last = getLastExpenseWallet();
    const fallback = wallets[0]?.id ?? '';
    setEditIndex(null);
    setModalWalletId(wallets.some((w) => w.id === last) ? last : fallback);
    setModalName('');
    setModalAmount('');
    setModalFormOpen(true);
  };

  /** Open the form pre-filled to EDIT an existing manual line. */
  const openEditModal = (index: number) => {
    const line = service.spareparts[index];
    if (!line || line.kind !== 'manual') return;
    const wid = line.walletId ?? getLastExpenseWallet();
    const fallback = wallets[0]?.id ?? '';
    setEditIndex(index);
    setModalName(line.name);
    setModalAmount(fmtRpInput(String(line.costPrice)));
    setModalWalletId(wallets.some((w) => w.id === wid) ? wid : fallback);
    setModalFormOpen(true);
  };

  /** Close the modal form and clear edit state. */
  const closeModalForm = () => {
    setModalFormOpen(false);
    setEditIndex(null);
  };

  /**
   * Record an ad-hoc "modal dadakan": creates a manual cost line AND a linked
   * Expense (real cash out), debiting the chosen wallet. The expense id is kept
   * on the line so it can be reversed if the line is later removed.
   */
  const addManualModal = async () => {
    const amount = parseRpInput(modalAmount);
    if (!modalName.trim()) return toast.warning('Isi keterangan modal');
    if (amount <= 0) return toast.warning('Nominal modal harus lebih dari 0');
    if (!modalWalletId) return toast.warning('Pilih wallet sumber dana');
    setSavingCost(true);
    const now = new Date().toISOString();
    try {
      const expenseId = newId();
      await repository.put('expenses', {
        id: expenseId,
        orgId: service.orgId,
        outletId: service.outletId,
        date: localDateStr(),
        category: 'Sparepart',
        amount,
        walletId: modalWalletId,
        description: `Modal servis ${service.serviceNo} — ${modalName.trim()}`,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      const wallet = wallets.find((w) => w.id === modalWalletId);
      if (wallet) await repository.put('wallets', applyBalance(wallet, -amount));
      const line: ServiceSparepart = {
        itemId: null,
        name: modalName.trim(),
        qty: 1,
        costPrice: amount,
        sellPrice: 0,
        deducted: false,
        kind: 'manual',
        expenseId,
        walletId: modalWalletId,
      };
      await repository.put('services', {
        ...service,
        spareparts: [...service.spareparts, line],
        updatedAt: now,
      });
      setLastExpenseWallet(modalWalletId);
      logActivity({
        action: 'expense.create',
        entityType: 'expense',
        entityId: expenseId,
        entityLabel: `Modal ${service.serviceNo}`,
        meta: { amount, serviceId: service.id },
      });
      toast.success('Modal dadakan dicatat & masuk keuangan');
      closeModalForm();
    } catch {
      toast.error('Gagal mencatat modal');
    } finally {
      setSavingCost(false);
    }
  };

  /**
   * Edit an existing manual "modal dadakan" line. Keeps cash consistent by
   * reversing the old wallet debit and applying the new one (netted per wallet
   * so editing on the same wallet doesn't double-apply), updates the linked
   * Expense (amount/wallet/description), and rewrites the cost line. The linked
   * Expense id is preserved so the audit trail stays continuous.
   */
  const updateManualModal = async () => {
    if (editIndex == null) return;
    const line = service.spareparts[editIndex];
    if (!line || line.kind !== 'manual') return;
    const amount = parseRpInput(modalAmount);
    if (!modalName.trim()) return toast.warning('Isi keterangan modal');
    if (amount <= 0) return toast.warning('Nominal modal harus lebih dari 0');
    if (!modalWalletId) return toast.warning('Pilih wallet sumber dana');

    setSavingCost(true);
    const now = new Date().toISOString();
    try {
      const oldAmount = line.costPrice;
      const oldWalletId = line.walletId ?? null;
      // Net the cash movement per wallet (refund old debit, apply new debit).
      const delta = walletDeltasForModalEdit(oldWalletId, oldAmount, modalWalletId, amount);
      for (const [wid, d] of delta) {
        const wallet = wallets.find((w) => w.id === wid);
        if (wallet) await repository.put('wallets', applyBalance(wallet, d));
      }

      // Sync the linked Expense (or create one if an older line lacked it).
      const expenseId = line.expenseId ?? newId();
      const expenses = await repository.list('expenses');
      const existing = expenses.find((e) => e.id === expenseId);
      await repository.put('expenses', {
        id: expenseId,
        orgId: service.orgId,
        outletId: service.outletId,
        date: existing?.date ?? localDateStr(),
        category: 'Sparepart',
        amount,
        walletId: modalWalletId,
        description: `Modal servis ${service.serviceNo} — ${modalName.trim()}`,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      });

      const updatedLine: ServiceSparepart = {
        ...line,
        name: modalName.trim(),
        costPrice: amount,
        expenseId,
        walletId: modalWalletId,
      };
      await repository.put('services', {
        ...service,
        spareparts: service.spareparts.map((sp, i) => (i === editIndex ? updatedLine : sp)),
        updatedAt: now,
      });
      setLastExpenseWallet(modalWalletId);
      logActivity({
        action: 'expense.update',
        entityType: 'expense',
        entityId: expenseId,
        entityLabel: `Modal ${service.serviceNo}`,
        meta: { amount, prevAmount: oldAmount, serviceId: service.id },
      });
      toast.success('Modal dadakan diperbarui');
      closeModalForm();
    } catch {
      toast.error('Gagal memperbarui modal');
    } finally {
      setSavingCost(false);
    }
  };

  /**
   * Remove a cost line. For manual lines this also reverses the linked Expense
   * and refunds the wallet (atomic), so cash & profit stay consistent. For
   * inventory lines already deducted, stock is returned to the item.
   */
  const removeCostLine = async (index: number) => {
    const line = service.spareparts[index];
    if (!line) return;
    const now = new Date().toISOString();
    try {
      if (line.kind === 'manual') {
        if (line.expenseId) {
          const expenses = await repository.list('expenses');
          const exp = expenses.find((e) => e.id === line.expenseId);
          await repository.remove('expenses', line.expenseId);
          if (exp) {
            const wallet = wallets.find((w) => w.id === exp.walletId);
            if (wallet) await repository.put('wallets', applyBalance(wallet, exp.amount));
          }
        }
      } else if (line.deducted && line.itemId) {
        // Return previously-deducted stock to inventory.
        const inventory = await repository.list('inventory');
        const item = inventory.find((i) => i.id === line.itemId);
        if (item) await repository.put('inventory', { ...item, stock: item.stock + line.qty });
      }
      await repository.put('services', {
        ...service,
        spareparts: service.spareparts.filter((_, i) => i !== index),
        updatedAt: now,
      });
      toast.success('Baris dihapus');
    } catch {
      toast.error('Gagal menghapus baris');
    }
  };

  /** Latest history timestamp for a given stage. */
  const stageAt = (stage: ServiceStatus): string | null => {
    const entry = [...service.history].reverse().find((h) => h.status === stage);
    return entry ? fmtDateTime(entry.at) : null;
  };

  const log = [...service.history].reverse();
  // Include the org param so the public /track page can scope the lookup
  // (mirrors the WhatsApp link). Without it, tracking returns "not found".
  const trackingLink = trackingUrl(window.location.origin, service.orgId, service.serviceNo);

  /**
   * Copy the public tracking link with explicit feedback. Uses the async
   * Clipboard API when available, falling back to a hidden-textarea +
   * execCommand for non-secure contexts (e.g. plain HTTP on a LAN device).
   */
  const copyTrackingLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(trackingLink);
      } else {
        const ta = document.createElement('textarea');
        ta.value = trackingLink;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('execCommand failed');
      }
      toast.success('Link tracking disalin');
    } catch {
      toast.error('Gagal menyalin link. Salin manual dari struk.');
    }
  };

  // Toggle physical collection of the device — independent of payment.
  const togglePickup = async () => {
    const now = new Date().toISOString();
    const nowPicked = !service.pickedUp;
    await repository.put('services', {
      ...service,
      pickedUp: nowPicked,
      pickedUpAt: nowPicked ? now : null,
      updatedAt: now,
      history: [
        ...service.history,
        {
          at: now,
          status: 'edit',
          by: me?.id ?? '',
          byName: me?.name ?? '',
          note: nowPicked ? 'Barang diambil pelanggan' : 'Tanda ambil dibatalkan',
          internal: false,
        },
      ],
    });
    toast.success(nowPicked ? 'Ditandai sudah diambil' : 'Tanda ambil dibatalkan');
  };

  return (
    <div className={styles.page}>
      {/* Back link */}
      <Link to="/services" className={styles.back}>
        <Icon name="arrow-left" aria-hidden /> {t('nav.services')}
      </Link>

      {service.warrantyClaimOf && (
        <div className={styles.claimBanner}>
          <Icon name="shield-halved" aria-hidden />
          <span>
            Tiket ini adalah <strong>klaim garansi</strong>
            {originTicket ? (
              <>
                {' '}dari{' '}
                <Link to={`/services/${originTicket.id}`}>{originTicket.serviceNo}</Link>
              </>
            ) : (
              ' (tiket asli tidak ditemukan)'
            )}
            .
          </span>
        </div>
      )}

      <div className={styles.sheet}>
        {/* ---------- Ticket Head ---------- */}
        <header className={styles.head}>
          <div className={styles.headMain}>
            <div className={styles.codeRow}>
              <span className={styles.code}>{service.serviceNo}</span>
              <span className={styles.codeMeta}>REPAIR TICKET</span>
            </div>
            <h1 className={styles.device}>{service.device}</h1>
            <p className={styles.deviceMeta}>
              <span className={styles.cat}>{service.category}</span>
              <span className={styles.dot} />
              {fmtDate(service.createdAt)}
              {service.technicianName && (
                <>
                  <span className={styles.dot} />
                  Teknisi <strong>{service.technicianName}</strong>
                </>
              )}
              {service.warrantyServiceUntil && (
                <>
                  <span className={styles.dot} />
                  Garansi jasa s/d {fmtDate(service.warrantyServiceUntil)}
                </>
              )}
              {service.warrantyPartsUntil && (
                <>
                  <span className={styles.dot} />
                  Garansi part s/d {fmtDate(service.warrantyPartsUntil)}
                </>
              )}
              <span className={styles.dot} />
              {service.pickedUp ? (
                <span className={styles.pickedUp}>
                  <Icon name="circle-check" aria-hidden /> Sudah diambil
                  {service.pickedUpAt ? ` · ${fmtDate(service.pickedUpAt)}` : ''}
                </span>
              ) : (
                <span className={styles.notPicked}>
                  <Icon name="box" aria-hidden /> Belum diambil
                </span>
              )}
            </p>
          </div>
          <div className={[styles.stamp, cancelled ? styles.stampCancel : ''].join(' ')}>
            <span className={styles.stampInner}>{STATUS_LABELS[service.status]}</span>
          </div>
        </header>

        {/* ---------- Traveler Strip ---------- */}
        {!cancelled && (
          <section className={styles.traveler}>
            {TRAVELER.map((stage, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              const at = stageAt(stage);
              return (
                <div
                  key={stage}
                  className={[
                    styles.stage,
                    done ? styles.stageDone : '',
                    current ? styles.stageCurrent : '',
                  ].join(' ')}
                >
                  <div className={styles.stageNode}>
                    {done ? <Icon name="check" aria-hidden /> : <span>{i + 1}</span>}
                  </div>
                  <div className={styles.stageInfo}>
                    <span className={styles.stageLabel}>{t(`status.${stage}`)}</span>
                    <span className={styles.stageAt}>{at ?? '—'}</span>
                  </div>
                  {i < TRAVELER.length - 1 && <span className={styles.connector} />}
                </div>
              );
            })}
          </section>
        )}

        {/* ---------- Customer stub + Intake ---------- */}
        <section className={styles.cols}>
          <div className={[styles.panel, styles.stub].join(' ')}>
            <div className={styles.panelLabel}>CUSTOMER STUB</div>
            <div className={styles.stubName}>{service.customerName}</div>
            <div className={styles.stubPhone}>{service.customerPhone || '—'}</div>
            <div className={styles.stubActions}>
              <button className={styles.waBtn} onClick={() => setNotifyOpen(true)}>
                <Icon name="whatsapp" aria-hidden /> WhatsApp
              </button>
              <button
                className={styles.ghostBtn}
                onClick={() => void copyTrackingLink()}
              >
                <Icon name="link" aria-hidden /> Salin tracking
              </button>
            </div>
            <div className={styles.qrRow}>
              <div className={styles.qr}>
                <Icon name="qrcode" aria-hidden />
              </div>
              <span className={styles.qrText}>Bagikan link untuk lacak status servis</span>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelLabel}>INTAKE / KELUHAN</div>
            <p className={styles.complaint}>{service.complaint || '—'}</p>
            <dl className={styles.specList}>
              <div>
                <dt>Kelengkapan</dt>
                <dd>{service.accessories || '—'}</dd>
              </div>
              <div>
                <dt>Kategori</dt>
                <dd>{service.category}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ---------- Sparepart BOM ---------- */}
        <section className={styles.panel}>
          <div className={styles.bomHead}>
            <div className={styles.panelLabel}>SPAREPART · BILL OF MATERIALS</div>
            {!cancelled && (
              <div className={styles.bomActions}>
                <button className={styles.bomAddBtn} onClick={() => setPickerOpen(true)}>
                  <Icon name="plus" aria-hidden /> Sparepart
                </button>
                <button className={styles.bomAddBtn} onClick={openModalForm}>
                  <Icon name="plus" aria-hidden /> Modal Dadakan
                </button>
              </div>
            )}
          </div>

          {modalFormOpen && (
            <div className={styles.modalForm}>
              <Input
                label="Keterangan modal"
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                placeholder="mis. Beli LCD di toko sebelah"
                autoFocus
              />
              <div className={styles.modalFormRow}>
                <Input
                  label="Nominal modal"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(fmtRpInput(e.target.value))}
                  placeholder="250.000"
                />
                <Select
                  label="Dari wallet"
                  value={modalWalletId}
                  onChange={(e) => setModalWalletId(e.target.value)}
                  options={wallets.map((w) => ({ value: w.id, label: w.name }))}
                />
              </div>
              <p className={styles.modalHint}>
                <Icon name="circle-info" aria-hidden />{' '}
                {editIndex == null
                  ? 'Mengurangi saldo wallet & tercatat di Keuangan (kategori Sparepart).'
                  : 'Menyesuaikan saldo wallet & pengeluaran terkait di Keuangan.'}
              </p>
              <div className={styles.modalFormBtns}>
                <Button variant="secondary" size="sm" onClick={closeModalForm}>
                  Batal
                </Button>
                <Button
                  size="sm"
                  onClick={editIndex == null ? addManualModal : updateManualModal}
                  loading={savingCost}
                >
                  {editIndex == null ? 'Simpan Modal' : 'Perbarui Modal'}
                </Button>
              </div>
            </div>
          )}

          {service.spareparts.length === 0 ? (
            <p className={styles.emptyParts}>Belum ada sparepart atau modal ditambahkan.</p>
          ) : (
            <div className={styles.bom}>
              {service.spareparts.map((p, i) => {
                const manual = p.kind === 'manual';
                return (
                  <div key={`${p.itemId ?? 'm'}-${i}`} className={styles.bomRow}>
                    <span className={styles.bomIcon}>
                      <Icon name={manual ? 'money-bill-wave' : 'microchip'} aria-hidden />
                    </span>
                    <span className={styles.bomName}>{p.name}</span>
                    <span className={styles.bomQty}>{manual ? '' : `×${p.qty}`}</span>
                    <span className={styles.bomCost}>
                      {manual ? fmtMoney(p.costPrice) : fmtMoney(p.sellPrice * p.qty)}
                    </span>
                    <span
                      className={[
                        styles.bomState,
                        manual ? styles.stateModal : p.deducted ? styles.stateOk : styles.stateWait,
                      ].join(' ')}
                    >
                      {manual ? 'Modal (kas)' : p.deducted ? 'Terpasang' : 'Menunggu'}
                    </span>
                    {!cancelled && manual && (
                      <button
                        className={styles.bomEdit}
                        onClick={() => openEditModal(i)}
                        title="Edit modal"
                        aria-label="Edit modal"
                      >
                        <Icon name="pen" aria-hidden />
                      </button>
                    )}
                    {!cancelled && (
                      <button
                        className={styles.bomDel}
                        onClick={() => removeCostLine(i)}
                        title="Hapus baris"
                        aria-label="Hapus baris"
                      >
                        <Icon name="trash" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- Cost + Log ---------- */}
        <section className={styles.cols}>
          <div className={styles.panel}>
            <div className={styles.panelLabel}>BIAYA</div>
            <dl className={styles.costList}>
              <div>
                <dt>Estimasi</dt>
                <dd>{fmtMoney(service.estimateCost)}</dd>
              </div>
              <div>
                <dt>Biaya final</dt>
                <dd>{fmtMoney(service.finalCost)}</dd>
              </div>
              {service.downPayment > 0 && (
                <div>
                  <dt>DP diterima</dt>
                  <dd className={styles.dp}>− {fmtMoney(service.downPayment)}</dd>
                </div>
              )}
              <div className={styles.costTotal}>
                <dt>Sisa tagihan</dt>
                <dd>{fmtMoney(outstanding)}</dd>
              </div>
              {isOwner && (
                <>
                  <div>
                    <dt>Modal (part + dadakan)</dt>
                    <dd className={styles.dp}>− {fmtMoney(modalTotal)}</dd>
                  </div>
                  <div className={styles.costProfit} data-loss={profit < 0}>
                    <dt>Profit unit</dt>
                    <dd>{fmtMoney(profit)}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelLabel}>LOG TEKNISI</div>
            <ul className={styles.log}>
              {log.map((l, i) => (
                <li key={i} className={[styles.logItem, l.internal ? styles.logInternal : ''].join(' ')}>
                  <span className={styles.logDot} />
                  <div>
                    <div className={styles.logHead}>
                      <strong>{l.status === 'edit' ? 'Edit' : STATUS_LABELS[l.status as ServiceStatus]}</strong>
                      {l.internal && <span className={styles.internalTag}>internal</span>}
                    </div>
                    <span className={styles.logAt}>
                      {fmtDateTime(l.at)} · {l.byName}
                    </span>
                    {l.note && <p className={styles.logNote}>{l.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ---------- Sticky action bar ---------- */}
      <div className={styles.actionBar}>
        <div className={styles.actionInfo}>
          <span className={styles.actionLabel}>Sisa tagihan</span>
          <span className={styles.actionValue}>{fmtMoney(outstanding)}</span>
        </div>
        <div className={styles.actionBtns}>
          <button className={styles.secondaryBtn} onClick={() => setEditOpen(true)}>
            <Icon name="pen" aria-hidden /> Edit
          </button>
          {org && (
            <button className={styles.secondaryBtn} onClick={() => printServiceReceipt(service, org)}>
              <Icon name="print" aria-hidden /> Cetak Nota
            </button>
          )}
          {isManager && (
            <button
              className={[styles.secondaryBtn, service.pickedUp ? styles.pickedActive : ''].join(' ')}
              onClick={togglePickup}
            >
              <Icon name={service.pickedUp ? 'circle-check' : 'box'} aria-hidden />{' '}
              {service.pickedUp ? 'Diambil ✓' : 'Tandai Diambil'}
            </button>
          )}
          {claimable && (
            <button className={styles.primaryBtn} onClick={() => setClaimOpen(true)}>
              <Icon name="shield-halved" aria-hidden /> Klaim Garansi
            </button>
          )}
          {!isTerminal(service.status) && (
            <button className={styles.primaryBtn} onClick={() => setStatusOpen(true)}>
              {onlyDp ? (
                <>
                  <Icon name="money-bill-wave" aria-hidden /> Terima DP
                </>
              ) : (
                <>
                  Update Status <Icon name="arrow-right" aria-hidden />
                </>
              )}
            </button>
          )}
          {service.status === 'lunas' && (me?.role === 'owner' || me?.role === 'admin') && (
            <button className={styles.primaryBtn} onClick={() => setStatusOpen(true)}>
              <Icon name="pen" aria-hidden /> Koreksi Biaya
            </button>
          )}
        </div>
      </div>

      {/* ---------- Modals ---------- */}
      <ServiceModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={service}
        services={services}
        customers={customers}
        employees={sessionEmployees}
        onSaved={() => {}}
      />
      <StatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        service={service}
        onSaved={() => {}}
      />
      <NotifyModal open={notifyOpen} onClose={() => setNotifyOpen(false)} service={service} />
      <WarrantyClaimModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        origin={service}
        services={services}
        onSaved={() => {}}
      />
      <SparepartPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existingItemIds={service.spareparts.map((p) => p.itemId).filter((x): x is string => !!x)}
        onPick={addSparepartLine}
      />
    </div>
  );
}
