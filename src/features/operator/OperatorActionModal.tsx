/** Guarded write actions for the vendor-only operator console. */
import { useState } from 'react';
import {
  Button,
  FormError,
  FormFields,
  FormRow,
  Icon,
  Input,
  Modal,
  Textarea,
} from '@/components/ui';
import {
  adminConfirmManualPayment,
  adminDeleteOrganization,
  adminSetClientNote,
  adminSuspendOrg,
  type AdminOrgRow,
} from '@/data/supabase-client';
import { daysUntil } from '@/lib/business/billing';
import {
  accessRemainingLabel,
  expectedManualPayment,
  operatorMonthlyAmount,
  operatorPlanLabel,
  organizationNumber,
  projectedManualExpiry,
  type OperatorPaidPlan,
} from '@/lib/business/operator';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateOf } from '@/lib/time';
import { toast } from '@/stores/toast';
import styles from './OperatorPage.module.css';

export type ActionMode = 'suspend' | 'payment' | 'note' | 'delete';

const TITLES: Record<ActionMode, string> = {
  suspend: 'Tangguhkan klien',
  payment: 'Konfirmasi pembayaran',
  note: 'Catatan klien',
  delete: 'Hapus organisasi',
};

export function OperatorActionModal({
  mode,
  org,
  onClose,
  onDone,
}: {
  mode: ActionMode | null;
  org: AdminOrgRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const defaultPlan: OperatorPaidPlan = org && org.outletCount > 1 ? 'enterprise' : 'standard';
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<OperatorPaidPlan>(defaultPlan);
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState(org?.note ?? '');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const open = mode !== null && org !== null;
  if (!open || !org) return null;

  const monthlyAmount = operatorMonthlyAmount(plan, org.outletCount);
  const expectedAmount = expectedManualPayment(plan, org.outletCount, months);
  const projectedExpiry = projectedManualExpiry(org.expiresAt, months);
  const remainingDays = org.expiresAt ? daysUntil(org.expiresAt) : null;
  const orgNumber = organizationNumber(org.orgId);

  const submit = async () => {
    setErr('');
    if (mode !== 'note' && reason.trim() === '') {
      setErr(mode === 'delete' ? 'Alasan penghapusan wajib diisi' : 'Catatan verifikasi wajib diisi');
      return;
    }
    if (mode === 'payment' && reference.trim() === '') {
      setErr('Referensi pembayaran atau nama pengirim wajib diisi');
      return;
    }
    if (mode === 'payment' && (!Number.isInteger(months) || months < 1 || months > 12)) {
      setErr('Durasi pembayaran harus 1–12 bulan');
      return;
    }
    if (mode === 'payment' && plan === 'standard' && org.outletCount > 1) {
      setErr('Paket Solo hanya dapat dipakai organisasi dengan satu outlet');
      return;
    }
    if (mode === 'delete' && confirmation.trim().toUpperCase() !== orgNumber) {
      setErr(`Ketik ${orgNumber} secara lengkap untuk melanjutkan`);
      return;
    }

    setBusy(true);
    let successMessage: string;
    try {
      if (mode === 'suspend') {
        await adminSuspendOrg(org.orgId, reason.trim());
        successMessage = `${org.name} ditangguhkan`;
      } else if (mode === 'payment') {
        const until = await adminConfirmManualPayment(
          org.orgId,
          plan,
          months,
          expectedAmount,
          reference.trim(),
          reason.trim(),
        );
        successMessage = `Pembayaran ${org.name} dicatat · aktif sampai ${fmtDate(localDateOf(until))}`;
      } else if (mode === 'delete') {
        await adminDeleteOrganization(org.orgId, confirmation.trim(), reason.trim());
        successMessage = `${org.name} telah dihapus permanen`;
      } else {
        await adminSetClientNote(org.orgId, note);
        successMessage = 'Catatan disimpan';
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal menjalankan aksi');
      setBusy(false);
      return;
    }

    setBusy(false);
    toast.success(successMessage);
    onClose();
    try {
      await onDone();
    } catch {
      toast.warning('Aksi sudah tersimpan, tetapi daftar belum diperbarui. Tekan Muat ulang.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${TITLES[mode]} — ${org.name}`}
      size={mode === 'payment' ? 'md' : 'sm'}
      footer={
        <div className={styles.modalFoot}>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => void submit()}
            loading={busy}
            variant={mode === 'suspend' || mode === 'delete' ? 'danger' : 'primary'}
            disabled={mode === 'delete' && confirmation.trim().toUpperCase() !== orgNumber}
          >
            {mode === 'suspend' ? 'Tangguhkan' : mode === 'delete' ? 'Hapus permanen' : mode === 'payment' ? 'Catat pembayaran' : 'Simpan'}
          </Button>
        </div>
      }
    >
      <FormFields>
        {mode === 'suspend' && (
          <p className={styles.warn}>
            Operasi tulis {org.name} akan diblokir database. Akses hanya dapat dipulihkan
            lewat pembayaran Solo/Pro yang telah diverifikasi.
          </p>
        )}

        {mode === 'delete' && (
          <div className={styles.dangerPanel}>
            <span className={styles.dangerIcon} aria-hidden><Icon name="trash" /></span>
            <div>
              <strong>Seluruh data organisasi akan dihapus permanen.</strong>
              <p>Tiket, pelanggan, transaksi, stok, dan keanggotaan ikut terhapus. Akun login pengguna tetap ada.</p>
            </div>
          </div>
        )}

        {mode === 'payment' && (
          <>
            <div className={styles.paymentContext}>
              <div className={styles.paymentContextHead}>
                <span className={styles.orgNumber}>{orgNumber}</span>
                <strong>{org.name}</strong>
              </div>
              <dl className={styles.paymentFacts}>
                <div><dt>Paket saat ini</dt><dd>{operatorPlanLabel(org.plan)}</dd></div>
                <div><dt>Masa aktif</dt><dd>{accessRemainingLabel(remainingDays)}</dd></div>
                <div><dt>Berakhir</dt><dd>{org.expiresAt ? fmtDate(localDateOf(org.expiresAt)) : 'Tanpa batas'}</dd></div>
                <div><dt>Outlet aktif</dt><dd>{org.outletCount}</dd></div>
                <div><dt>Pembayaran terakhir</dt><dd>{org.lastPaidAt ? fmtDate(localDateOf(org.lastPaidAt)) : 'Belum ada'}</dd></div>
                <div><dt>Referensi terakhir</dt><dd>{org.lastPaidReference || '—'}</dd></div>
              </dl>
            </div>

            <FormRow>
              <label className={styles.label}>
                Paket yang dibayar
                <select
                  className={styles.input}
                  value={plan}
                  onChange={(event) => setPlan(event.target.value as OperatorPaidPlan)}
                  required
                  aria-required="true"
                >
                  <option value="standard" disabled={org.outletCount > 1}>Solo · 1 outlet</option>
                  <option value="enterprise">Pro · {org.outletCount} outlet</option>
                </select>
              </label>
              <Input
                noAutoCap
                type="number"
                name="payment-months"
                label="Durasi (bulan)"
                min={1}
                max={12}
                required
                aria-required="true"
                value={months}
                onChange={(event) => setMonths(Number(event.target.value))}
              />
            </FormRow>

            <div className={styles.paymentPreview} aria-live="polite">
              <div><span>Biaya bulanan</span><strong>{fmtRp(monthlyAmount)}</strong></div>
              <div><span>Total yang harus diterima</span><strong className={styles.amount}>{fmtRp(expectedAmount)}</strong></div>
              <div><span>Masa aktif setelah konfirmasi</span><strong>{fmtDate(localDateOf(projectedExpiry))}</strong></div>
            </div>

            <Input
              noAutoCap
              name="payment-reference"
              label="Referensi pembayaran / nama pengirim"
              hint="Gunakan referensi unik agar klik ulang tidak menggandakan masa aktif."
              placeholder="mis. RIFAN 29/08 14:32"
              required
              aria-required="true"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </>
        )}

        {mode === 'note' && (
          <Textarea
            name="client-note"
            label="Catatan internal (tidak terlihat klien)"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="mis. meminta panduan alur DP saat menghubungi WhatsApp"
          />
        )}

        {mode === 'delete' && (
          <Input
            noAutoCap
            name="delete-confirmation"
            label={`Ketik nomor organisasi ${orgNumber}`}
            className={styles.confirmInput}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={orgNumber}
            autoComplete="off"
            spellCheck={false}
            required
            aria-required="true"
          />
        )}

        {mode !== 'note' && (
          <Input
            name="operator-reason"
            label={mode === 'delete' ? 'Alasan penghapusan' : 'Catatan verifikasi'}
            required
            aria-required="true"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              mode === 'suspend'
                ? 'mis. pembayaran belum diterima setelah masa tenggang'
                : mode === 'payment'
                  ? 'mis. bukti transfer diverifikasi via WhatsApp'
                  : 'mis. permintaan penghapusan diverifikasi oleh pemilik'
            }
          />
        )}

        <FormError>{err}</FormError>
      </FormFields>
    </Modal>
  );
}
