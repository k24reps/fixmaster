import { useState } from 'react';
import { Modal, Button, Select, FormFields, FormError } from '@/components/ui';
import { useSessionStore } from '@/stores/session';
import { linkEntryEmployee } from '@/data/payroll';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { toast } from '@/stores/toast';
import { useT } from '@/i18n';
import type { Employee, Expense, Income } from '@/data/types';
import styles from './FinancePage.module.css';

interface LinkEmployeeModalProps {
  /** Baris buku kas Gaji / Kasbon Karyawan / Pelunasan Kasbon; null = tertutup. */
  entry: { kind: 'income' | 'expense' | 'transfer'; id: string; date: string; amount: number; category: string; description: string; record: unknown } | null;
  employees: Employee[];
  onClose: () => void;
}

/**
 * Tautkan catatan lama ke karyawan (0099) supaya sisa kasbon terhitung —
 * tanpa mencatat ulang & menghapus. Hanya kolom karyawan yang berubah.
 */
export function LinkEmployeeModal({ entry, employees, onClose }: LinkEmployeeModalProps) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  if (entry && entry.id !== seen) {
    setSeen(entry.id);
    setEmployeeId((entry.record as Expense | Income).employeeId ?? '');
    setError('');
  }
  if (!entry && seen) setSeen(null);

  const save = async () => {
    if (!entry || entry.kind === 'transfer') return;
    setBusy(true);
    try {
      await linkEntryEmployee({ orgId, kind: entry.kind, id: entry.id, employeeId: employeeId || null });
      toast.success(t('finance.linkSaved'));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('finance.linkFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!entry}
      onClose={onClose}
      title={t('finance.linkTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {entry && (
        <FormFields>
          <FormError>{error}</FormError>
          <p className={styles.payReadout}>
            <span>{entry.category}</span>
            <span>{fmtDate(entry.date)}</span>
            <b>{fmtRp(entry.amount)}</b>
            {entry.description && <span>{entry.description}</span>}
          </p>
          <Select
            label={t('finance.employee')}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            options={[
              { value: '', label: t('finance.linkNone') },
              ...employees.filter((e) => e.active || e.id === employeeId).map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
          <p className={styles.formHint}>{t('finance.linkHint')}</p>
        </FormFields>
      )}
    </Modal>
  );
}
