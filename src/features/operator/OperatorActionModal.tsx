/** Guarded write actions for the vendor-only operator console. */
import { EmptyValue } from '@/components/ui/EmptyValue';
import { useState } from 'react';
import {
  Button,
  FormError,
  FormFields,
  Icon,
  Input,
  Modal,
  Textarea,
} from '@/components/ui';
import {
  adminAdjustUnits,
  adminDeleteOrganization,
  adminReactivateOrg,
  adminSetClientNote,
  adminSuspendOrg,
  adminTopupUnits,
  type AdminOrgRow,
} from '@/data/supabase-client';
import { topupAmountError, unitsForTopup } from '@/lib/business/billing';
import { operatorPlanLabel, organizationNumber } from '@/lib/business/operator';
import { MIN_TOPUP, TOPUP_STEP } from '@/config/pricing';
import { fmtRp } from '@/lib/format';
import { fmtDate, localDateOf } from '@/lib/time';
import { toast } from '@/stores/toast';
import styles from './OperatorPage.module.css';

export type ActionMode = 'suspend' | 'reactivate' | 'topup' | 'adjust' | 'note' | 'delete';

const TITLES: Record<ActionMode, string> = {
  suspend: 'Tangguhkan klien',
  reactivate: 'Aktifkan kembali',
  topup: 'Isi saldo',
  adjust: 'Koreksi saldo',
  note: 'Catatan klien',
  delete: 'Hapus organisasi',
};

const SUBMIT_LABEL: Record<ActionMode, string> = {
  suspend: 'Tangguhkan',
  reactivate: 'Aktifkan',
  topup: 'Catat isi saldo',
  adjust: 'Simpan koreksi',
  note: 'Simpan',
  delete: 'Hapus permanen',
};

const REASON_PLACEHOLDER: Record<ActionMode, string> = {
  suspend: 'mis. penyalahgunaan akun dilaporkan pemilik',
  reactivate: 'mis. masalah akun sudah diselesaikan bersama pemilik',
  topup: 'mis. bukti transfer diverifikasi via WhatsApp',
  adjust: 'mis. isi saldo 14/11 tercatat dua kali',
  note: '',
  delete: 'mis. permintaan penghapusan diverifikasi oleh pemilik',
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
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(100_000);
  const [units, setUnits] = useState(0);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState(org?.note ?? '');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const open = mode !== null && org !== null;
  if (!open || !org) return null;

  const orgNumber = organizationNumber(org.orgId);
  const topupUnits = unitsForTopup(amount);
  const amountError = topupAmountError(amount);

  const submit = async () => {
    setErr('');
    if (mode !== 'note' && reason.trim() === '') {
      setErr(mode === 'delete' ? 'Alasan penghapusan wajib diisi' : mode === 'topup' ? 'Catatan verifikasi wajib diisi' : 'Alasan wajib diisi');
      return;
    }
    if (mode === 'topup' && amountError) {
      setErr(`Isi saldo minimal ${fmtRp(MIN_TOPUP)}, kelipatan ${fmtRp(TOPUP_STEP)}`);
      return;
    }
    if (mode === 'topup' && reference.trim() === '') {
      setErr('Referensi pembayaran atau nama pengirim wajib diisi');
      return;
    }
    if (mode === 'adjust' && (!Number.isInteger(units) || units === 0 || Math.abs(units) > 1000)) {
      setErr('Koreksi harus bilangan bulat antara -1000 dan 1000, dan bukan 0');
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
      } else if (mode === 'reactivate') {
        await adminReactivateOrg(org.orgId, reason.trim());
        successMessage = `${org.name} aktif kembali`;
      } else if (mode === 'topup') {
        const after = await adminTopupUnits(org.orgId, amount, reference.trim(), reason.trim());
        successMessage = `Isi saldo ${org.name} dicatat · saldo ${after} unit`;
      } else if (mode === 'adjust') {
        const after = await adminAdjustUnits(org.orgId, units, reason.trim());
        successMessage = `Saldo ${org.name} dikoreksi · saldo ${after} unit`;
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
      title={`${TITLES[mode]} · ${org.name}`}
      size={mode === 'topup' || mode === 'adjust' ? 'md' : 'sm'}
      footer={
        <div className={styles.modalFoot}>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => void submit()}
            loading={busy}
            variant={mode === 'suspend' || mode === 'delete' ? 'danger' : 'primary'}
            disabled={mode === 'delete' && confirmation.trim().toUpperCase() !== orgNumber}
          >
            {SUBMIT_LABEL[mode]}
          </Button>
        </div>
      }
    >
      <FormFields>
        {mode === 'suspend' && (
          <p className={styles.warn}>
            Operasi tulis {org.name} akan diblokir database sampai toko diaktifkan kembali
            dari konsol ini.
          </p>
        )}

        {mode === 'reactivate' && (
          <p className={styles.warn}>
            {org.name} bisa menulis lagi. Tiket baru tetap dipotong dari saldo ({org.unitBalance} unit).
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

        {(mode === 'topup' || mode === 'adjust') && (
          <div className={styles.paymentContext}>
            <div className={styles.paymentContextHead}>
              <span className={styles.orgNumber}>{orgNumber}</span>
              <strong>{org.name}</strong>
            </div>
            <dl className={styles.paymentFacts}>
              <div><dt>Status</dt><dd>{operatorPlanLabel(org.plan)}</dd></div>
              <div><dt>Saldo sekarang</dt><dd>{org.unitBalance} unit</dd></div>
              <div><dt>Terpakai 30 hari</dt><dd>{org.unitsUsed30d} unit</dd></div>
              <div><dt>Outlet aktif</dt><dd>{org.outletCount}</dd></div>
              <div><dt>Isi saldo terakhir</dt><dd>{org.lastTopupAt ? fmtDate(localDateOf(org.lastTopupAt)) : 'Belum ada'}</dd></div>
              <div><dt>Referensi terakhir</dt><dd>{org.lastTopupReference || <EmptyValue />}</dd></div>
            </dl>
          </div>
        )}

        {mode === 'topup' && (
          <>
            <Input
              noAutoCap
              type="number"
              name="topup-amount"
              label="Nominal yang diterima (Rp)"
              hint={`Minimal ${fmtRp(MIN_TOPUP)}, kelipatan ${fmtRp(TOPUP_STEP)}.`}
              min={MIN_TOPUP}
              step={TOPUP_STEP}
              required
              aria-required="true"
              invalid={amountError !== null}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
            <div className={styles.paymentPreview} aria-live="polite">
              <div><span>Unit ditambahkan</span><strong className={styles.amount}>+{amountError ? 0 : topupUnits}</strong></div>
              <div><span>Saldo setelah konfirmasi</span><strong>{org.unitBalance + (amountError ? 0 : topupUnits)} unit</strong></div>
            </div>
            <Input
              noAutoCap
              name="payment-reference"
              label="Referensi pembayaran / nama pengirim"
              hint="Gunakan referensi unik agar klik ulang tidak menggandakan saldo."
              placeholder="mis. RIFAN 29/08 14:32"
              required
              aria-required="true"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </>
        )}

        {mode === 'adjust' && (
          <>
            <Input
              noAutoCap
              type="number"
              name="adjust-units"
              label="Koreksi (unit, boleh negatif)"
              hint="Positif menambah, negatif mengurangi. Maksimal 1000 unit sekali koreksi."
              min={-1000}
              max={1000}
              step={1}
              required
              aria-required="true"
              value={units}
              onChange={(event) => setUnits(Number(event.target.value))}
            />
            <div className={styles.paymentPreview} aria-live="polite">
              <div><span>Saldo setelah koreksi</span><strong className={styles.amount}>{org.unitBalance + (Number.isInteger(units) ? units : 0)} unit</strong></div>
            </div>
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
            label={mode === 'delete' ? 'Alasan penghapusan' : mode === 'topup' ? 'Catatan verifikasi' : 'Alasan'}
            required
            aria-required="true"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={REASON_PLACEHOLDER[mode]}
          />
        )}

        <FormError>{err}</FormError>
      </FormFields>
    </Modal>
  );
}
