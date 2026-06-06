import { useState } from 'react';
import { Modal, Input, Select, Button } from '@/components/ui';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { localDateStr } from '@/lib/time';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import type {
  TaskTemplate,
  RecurrenceType,
  AssigneeType,
  Role,
  Employee,
  Outlet,
} from '@/data/types';
import styles from './TaskTemplateModal.module.css';

interface TaskTemplateModalProps {
  open: boolean;
  onClose: () => void;
  editing: TaskTemplate | null;
  employees: Employee[];
  outlets: Outlet[];
}

const WEEKDAYS = [
  { d: 1, label: 'Sen' },
  { d: 2, label: 'Sel' },
  { d: 3, label: 'Rab' },
  { d: 4, label: 'Kam' },
  { d: 5, label: 'Jum' },
  { d: 6, label: 'Sab' },
  { d: 0, label: 'Min' },
];

export function TaskTemplateModal({
  open,
  onClose,
  editing,
  employees,
  outlets,
}: TaskTemplateModalProps) {
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [monthDays, setMonthDays] = useState<string>('1');
  const [onceDate, setOnceDate] = useState(localDateStr());
  const [assigneeType, setAssigneeType] = useState<AssigneeType>('role');
  const [assigneeRole, setAssigneeRole] = useState<Role>('karyawan');
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState('');
  const [assigneeOutletId, setAssigneeOutletId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const currentKey = editing?.id ?? 'new';
  if (open && lastKey !== currentKey) {
    setLastKey(currentKey);
    setTitle(editing?.title ?? '');
    setDescription(editing?.description ?? '');
    setRecurrence(editing?.recurrence ?? 'daily');
    setWeekdays(editing?.weekdays ?? [1]);
    setMonthDays(editing?.monthDays?.join(', ') ?? '1');
    setOnceDate(editing?.onceDate ?? localDateStr());
    setAssigneeType(editing?.assigneeType ?? 'role');
    setAssigneeRole(editing?.assigneeRole ?? 'karyawan');
    setAssigneeEmployeeId(editing?.assigneeEmployeeId ?? '');
    setAssigneeOutletId(editing?.assigneeOutletId ?? '');
    setError('');
  }

  const toggleWeekday = (d: number) =>
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const save = async () => {
    if (!title.trim()) return setError('Judul tugas wajib diisi');
    if (recurrence === 'weekly' && weekdays.length === 0)
      return setError('Pilih minimal satu hari');

    const parsedMonthDays = monthDays
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => n >= 1 && n <= 31);
    if (recurrence === 'monthly' && parsedMonthDays.length === 0)
      return setError('Masukkan tanggal yang valid (1-31)');

    setBusy(true);
    const now = new Date().toISOString();
    const record: TaskTemplate = {
      id: editing?.id ?? newId(),
      orgId,
      outletId: null,
      title: title.trim(),
      description: description.trim(),
      recurrence,
      weekdays: recurrence === 'weekly' ? weekdays : [],
      monthDays: recurrence === 'monthly' ? parsedMonthDays : [],
      onceDate: recurrence === 'once' ? onceDate : null,
      assigneeType,
      assigneeRole: assigneeType === 'role' ? assigneeRole : null,
      assigneeEmployeeId: assigneeType === 'employee' ? assigneeEmployeeId : null,
      assigneeOutletId: assigneeType === 'outlet' ? assigneeOutletId : null,
      active: editing?.active ?? true,
      startDate: editing?.startDate ?? localDateStr(),
      endDate: editing?.endDate ?? null,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    try {
      await repository.put('taskTemplates', record);
      toast.success(editing ? 'Template tugas diperbarui' : 'Template tugas dibuat');
      onClose();
    } catch {
      toast.error('Gagal menyimpan template');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Template Tugas' : 'Template Tugas Baru'}
      size="lg"
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
      <div className={styles.body}>
        {error && <p className={styles.error}>{error}</p>}
        <Input label="Judul Tugas" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Bersih-bersih area kerja" autoFocus />
        <Input label="Deskripsi (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} />

        <Select
          label="Pengulangan"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as RecurrenceType)}
          options={[
            { value: 'daily', label: 'Harian' },
            { value: 'weekly', label: 'Mingguan' },
            { value: 'monthly', label: 'Bulanan' },
            { value: 'once', label: 'Tanggal Tertentu (sekali)' },
          ]}
        />

        {recurrence === 'weekly' && (
          <div>
            <label className={styles.label}>Hari</label>
            <div className={styles.weekdays}>
              {WEEKDAYS.map((w) => (
                <button
                  key={w.d}
                  type="button"
                  className={[styles.dayChip, weekdays.includes(w.d) ? styles.dayActive : ''].join(' ')}
                  onClick={() => toggleWeekday(w.d)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {recurrence === 'monthly' && (
          <Input
            label="Tanggal dalam Bulan"
            value={monthDays}
            onChange={(e) => setMonthDays(e.target.value)}
            placeholder="Contoh: 1, 15, 28"
            hint="Pisahkan dengan koma (1-31)"
          />
        )}

        {recurrence === 'once' && (
          <Input label="Tanggal" type="date" value={onceDate} onChange={(e) => setOnceDate(e.target.value)} />
        )}

        <Select
          label="Tugaskan Ke"
          value={assigneeType}
          onChange={(e) => setAssigneeType(e.target.value as AssigneeType)}
          options={[
            { value: 'role', label: 'Peran' },
            { value: 'employee', label: 'Karyawan Spesifik' },
            ...(outlets.length ? [{ value: 'outlet', label: 'Outlet' }] : []),
          ]}
        />
        {assigneeType === 'role' && (
          <Select
            label="Peran"
            value={assigneeRole}
            onChange={(e) => setAssigneeRole(e.target.value as Role)}
            options={[
              { value: 'karyawan', label: 'Semua Karyawan' },
              { value: 'admin', label: 'Admin' },
              { value: 'owner', label: 'Owner' },
            ]}
          />
        )}
        {assigneeType === 'employee' && (
          <Select
            label="Karyawan"
            value={assigneeEmployeeId}
            onChange={(e) => setAssigneeEmployeeId(e.target.value)}
            options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
            placeholder="Pilih karyawan…"
          />
        )}
        {assigneeType === 'outlet' && (
          <Select
            label="Outlet"
            value={assigneeOutletId}
            onChange={(e) => setAssigneeOutletId(e.target.value)}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Pilih outlet…"
          />
        )}
      </div>
    </Modal>
  );
}
