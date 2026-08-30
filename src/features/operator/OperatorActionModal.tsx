/**
 * Satu modal untuk semua aksi tulis operator: suspend, aktifkan kembali,
 * konfirmasi pembayaran manual, catatan klien, dan penghapusan organisasi.
 *
 * Digabung jadi satu komponen karena bentuknya sama — pilih org, isi alasan,
 * konfirmasi — dan menyebarnya jadi empat modal hanya menduplikasi validasi
 * yang sama empat kali.
 *
 * Alasan wajib untuk suspend/pembayaran BUKAN sekadar validasi form: RPC-nya
 * menolak alasan kosong (0046), dan alasan itulah yang membuat baris di jejak
 * operator bisa dijawab berbulan-bulan kemudian.
 */
import { useState } from 'react';
import { Button, Icon, Modal } from '@/components/ui';
import {
  adminConfirmManualPayment,
  adminDeleteOrganization,
  adminReactivateOrg,
  adminSetClientNote,
  adminSuspendOrg,
  type AdminOrgRow,
} from '@/data/supabase-client';
import { priceForOutlets } from '@/config/plans';
import { organizationNumber } from '@/lib/business/operator';
import { fmtDate } from '@/lib/time';
import { toast } from '@/stores/toast';
import styles from './OperatorPage.module.css';

export type ActionMode = 'suspend' | 'reactivate' | 'payment' | 'note' | 'delete';

const TITLES: Record<ActionMode, string> = {
  suspend: 'Tangguhkan klien',
  reactivate: 'Aktifkan kembali',
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
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState('standard');
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(99_000);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState(org?.note ?? '');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Nilai awal disemai saat modal dibuka lewat key remount (lihat pemanggil).
  const open = mode !== null && org !== null;
  if (!open || !org) return null;

  const submit = async () => {
    setErr('');
    if (mode !== 'note' && reason.trim() === '') {
      setErr(
        mode === 'delete'
          ? 'Alasan penghapusan wajib diisi'
          : 'Catatan verifikasi wajib diisi',
      );
      return;
    }
    if (mode === 'payment' && reference.trim() === '') {
      setErr('Referensi pembayaran atau nama pengirim wajib diisi');
      return;
    }
    if (mode === 'payment' && (!Number.isFinite(amount) || amount < 1)) {
      setErr('Nominal pembayaran harus lebih dari Rp0');
      return;
    }
    if (mode === 'payment' && (!Number.isInteger(months) || months < 1 || months > 12)) {
      setErr('Durasi pembayaran harus 1–12 bulan');
      return;
    }
    const orgNumber = organizationNumber(org.orgId);
    if (mode === 'delete' && confirmation.trim().toUpperCase() !== orgNumber) {
      setErr(`Ketik ${orgNumber} secara lengkap untuk melanjutkan`);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'suspend') {
        await adminSuspendOrg(org.orgId, reason.trim());
        toast.success(`${org.name} ditangguhkan`);
      } else if (mode === 'reactivate') {
        await adminReactivateOrg(org.orgId, plan, reason.trim());
        toast.success(`${org.name} aktif kembali`);
      } else if (mode === 'payment') {
        const until = await adminConfirmManualPayment(
          org.orgId,
          plan,
          months,
          amount,
          reference.trim(),
          reason.trim(),
        );
        toast.success(`Pembayaran ${org.name} dicatat · aktif sampai ${fmtDate(until)}`);
      } else if (mode === 'delete') {
        await adminDeleteOrganization(org.orgId, confirmation.trim(), reason.trim());
        toast.success(`${org.name} telah dihapus permanen`);
      } else {
        await adminSetClientNote(org.orgId, note);
        toast.success('Catatan disimpan');
      }
      await onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menjalankan aksi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${TITLES[mode]} — ${org.name}`}
      size="sm"
      footer={
        <div className={styles.modalFoot}>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => void submit()}
            loading={busy}
            variant={mode === 'suspend' || mode === 'delete' ? 'danger' : 'primary'}
            disabled={
              mode === 'delete' &&
              confirmation.trim().toUpperCase() !== organizationNumber(org.orgId)
            }
          >
            {mode === 'suspend'
              ? 'Tangguhkan'
              : mode === 'delete'
                ? 'Hapus permanen'
                : 'Simpan'}
          </Button>
        </div>
      }
    >
      <div className={styles.form}>
        {mode === 'suspend' && (
          <p className={styles.warn}>
            Operasi tulis {org.name} akan diblokir database sampai diaktifkan kembali.
            Mereka masih bisa masuk dan membaca datanya.
          </p>
        )}

        {mode === 'delete' && (
          <div className={styles.dangerPanel}>
            <span className={styles.dangerIcon} aria-hidden>
              <Icon name="trash" />
            </span>
            <div>
              <strong>Seluruh data organisasi akan dihapus permanen.</strong>
              <p>
                Tiket, pelanggan, transaksi, stok, dan keanggotaan ikut terhapus. Akun
                login pengguna tetap ada dan dapat membuat organisasi baru.
              </p>
            </div>
          </div>
        )}

        {mode === 'payment' && (
          <>
            <label className={styles.label}>
              Paket yang dibayar
              <select
                className={styles.input}
                value={plan}
                onChange={(e) => {
                  const next = e.target.value;
                  setPlan(next);
                  setAmount(
                    next === 'enterprise'
                      ? priceForOutlets(Math.max(org.outletCount, 1))
                      : 99_000,
                  );
                }}
              >
                <option value="standard">Solo</option>
                <option value="enterprise">Pro</option>
              </select>
            </label>
            <label className={styles.label}>
              Durasi (bulan)
              <input
                className={styles.input}
                type="number"
                min={1}
                max={12}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
              />
            </label>
            <label className={styles.label}>
              Nominal diterima (Rp)
              <input
                className={styles.input}
                type="number"
                min={1}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <label className={styles.label}>
              Referensi pembayaran / nama pengirim <span aria-hidden>*</span>
              <input
                className={styles.input}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="mis. RIFAN 29/08 14:32"
              />
            </label>
          </>
        )}

        {mode === 'reactivate' && (
          <label className={styles.label}>
            Aktifkan ke paket
            <select
              className={styles.input}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="standard">Solo</option>
              <option value="enterprise">Pro</option>
              <option value="trial">Trial</option>
              <option value="free">Free</option>
            </select>
          </label>
        )}

        {mode === 'note' && (
          <label className={styles.label}>
            Catatan internal (tidak terlihat klien)
            <textarea
              className={styles.input}
              rows={4}
              defaultValue={org.note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. bingung di alur DP, follow up Senin"
            />
          </label>
        )}

        {mode === 'delete' && (
          <label className={styles.label}>
            Ketik nomor organisasi <strong>{organizationNumber(org.orgId)}</strong>
            <input
              className={[styles.input, styles.confirmInput].join(' ')}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={organizationNumber(org.orgId)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {mode !== 'note' && (
          <label className={styles.label}>
            {mode === 'delete' ? 'Alasan penghapusan' : 'Catatan verifikasi'}{' '}
            <span aria-hidden>*</span>
            <input
              className={styles.input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === 'suspend'
                  ? 'mis. menunggak 12 hari'
                  : mode === 'payment'
                    ? 'mis. bukti transfer diverifikasi via WhatsApp'
                    : mode === 'delete'
                      ? 'mis. permintaan penghapusan diverifikasi oleh pemilik'
                      : 'mis. aktivasi kembali setelah verifikasi'
              }
            />
          </label>
        )}

        {err && (
          <p className={styles.err} role="alert">
            <Icon name="warning" aria-hidden /> {err}
          </p>
        )}
      </div>
    </Modal>
  );
}
