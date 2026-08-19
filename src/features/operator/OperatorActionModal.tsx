/**
 * Satu modal untuk semua aksi tulis operator: suspend, aktifkan kembali,
 * promo, dan catatan klien.
 *
 * Digabung jadi satu komponen karena bentuknya sama — pilih org, isi alasan,
 * konfirmasi — dan menyebarnya jadi empat modal hanya menduplikasi validasi
 * yang sama empat kali.
 *
 * Alasan wajib untuk suspend/promo BUKAN sekadar validasi form: RPC-nya
 * menolak alasan kosong (0046), dan alasan itulah yang membuat baris di jejak
 * operator bisa dijawab berbulan-bulan kemudian.
 */
import { useState } from 'react';
import { Button, Icon, Modal } from '@/components/ui';
import {
  adminApplyPromo,
  adminReactivateOrg,
  adminSetClientNote,
  adminSuspendOrg,
  type AdminOrgRow,
} from '@/data/supabase-client';
import { fmtDate } from '@/lib/time';
import { toast } from '@/stores/toast';
import styles from './OperatorPage.module.css';

export type ActionMode = 'suspend' | 'reactivate' | 'promo' | 'note';

/** Promo bernama, bukan kotak hari kosong — supaya jejaknya bisa dianalisis
 *  ("promo mana yang menghasilkan klien bertahan"), bukan sekadar dicatat. */
const PROMOS: { label: string; days: number }[] = [
  { label: 'Founding member', days: 60 },
  { label: 'Kompensasi gangguan', days: 7 },
  { label: 'Perpanjang trial pilot', days: 14 },
  { label: 'Lainnya', days: 30 },
];

const TITLES: Record<ActionMode, string> = {
  suspend: 'Tangguhkan klien',
  reactivate: 'Aktifkan kembali',
  promo: 'Beri promo',
  note: 'Catatan klien',
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
  const [promo, setPromo] = useState(PROMOS[0].label);
  const [days, setDays] = useState(PROMOS[0].days);
  const [plan, setPlan] = useState('standard');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Nilai awal disemai saat modal dibuka lewat key remount (lihat pemanggil).
  const open = mode !== null && org !== null;
  if (!open || !org) return null;

  const submit = async () => {
    setErr('');
    if ((mode === 'suspend' || mode === 'promo') && reason.trim() === '') {
      setErr('Alasan wajib diisi');
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
      } else if (mode === 'promo') {
        const until = await adminApplyPromo(org.orgId, promo, days, reason.trim());
        toast.success(`${org.name} diperpanjang sampai ${fmtDate(until)}`);
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
            variant={mode === 'suspend' ? 'danger' : 'primary'}
          >
            {mode === 'suspend' ? 'Tangguhkan' : 'Simpan'}
          </Button>
        </div>
      }
    >
      <div className={styles.form}>
        {mode === 'suspend' && (
          <p className={styles.warn}>
            Operasi tulis {org.name} akan diblokir database sampai diaktifkan kembali. Mereka masih
            bisa masuk dan membaca datanya.
          </p>
        )}

        {mode === 'promo' && (
          <>
            <label className={styles.label}>
              Jenis promo
              <select
                className={styles.input}
                value={promo}
                onChange={(e) => {
                  const found = PROMOS.find((x) => x.label === e.target.value);
                  setPromo(e.target.value);
                  if (found) setDays(found.days);
                }}
              >
                {PROMOS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              Durasi (hari)
              <input
                className={styles.input}
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
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

        {mode !== 'note' && (
          <label className={styles.label}>
            Alasan {(mode === 'suspend' || mode === 'promo') && <span aria-hidden>*</span>}
            <input
              className={styles.input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === 'suspend' ? 'mis. menunggak 12 hari' : 'mis. mitra pilot'}
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
