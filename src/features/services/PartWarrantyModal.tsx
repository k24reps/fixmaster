import { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { repository } from '@/data';
import { toast } from '@/stores/toast';
import { useResetOnOpen } from '@/hooks/useResetOnOpen';
import { getWarrantyPartsDays, getWarrantyPresets } from '@/config/orgConfig';
import { applyPartWarranty, latestPartWarranty } from '@/lib/business/services';
import { fmtDate, localDateOf, localDateStr } from '@/lib/time';
import type { Service, ServiceHistoryEntry } from '@/data/types';
import { PartWarrantyFields } from './PartWarrantyFields';

/**
 * Atur garansi sparepart setelah tiket Selesai: untuk part yang ditambahkan
 * belakangan, atau koreksi. Tanggal akhir dihitung dari tanggal tiket Selesai
 * (bukan hari ini), sama seperti saat garansi pertama kali ditetapkan.
 */
export function PartWarrantyModal({
  open,
  onClose,
  service,
  history,
}: {
  open: boolean;
  onClose: () => void;
  service: Service;
  history: ServiceHistoryEntry[];
}) {
  const [values, setValues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useResetOnOpen(open, service.id, () => {
    setValues(
      service.spareparts.map((p) =>
        p.warrantyDays != null ? String(p.warrantyDays) : String(p.defaultWarrantyDays ?? getWarrantyPartsDays()),
      ),
    );
  });

  const finishedAt = history.find((h) => h.status === 'selesai')?.at;
  const finishDate = finishedAt ? localDateOf(finishedAt) : localDateStr();

  const save = async () => {
    setBusy(true);
    try {
      const fresh = (await repository.get('services', service.id)) ?? service;
      // Indeks isian milik daftar part saat modal dibuka.
      if (fresh.spareparts.length !== values.length) {
        toast.warning('Daftar sparepart berubah. Buka ulang lalu atur lagi.');
        return;
      }
      const days = values.map((v) => Math.max(0, Math.round(Number(v) || 0)));
      const spareparts = applyPartWarranty(fresh.spareparts, days, finishDate);
      await repository.patch('services', fresh.id, {
        spareparts,
        warrantyPartsUntil: latestPartWarranty(spareparts),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Garansi sparepart diperbarui');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan garansi sparepart');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Garansi Sparepart — ${service.serviceNo}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        Dihitung dari tanggal selesai {fmtDate(finishDate)}. Isi 0 untuk part tanpa garansi.
      </p>
      <PartWarrantyFields
        parts={service.spareparts}
        values={values}
        onChange={(i, v) => setValues((prev) => prev.map((x, j) => (j === i ? v : x)))}
        presets={getWarrantyPresets()}
      />
    </Modal>
  );
}
