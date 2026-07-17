import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, Input, Badge, EmptyState, Icon } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { newId } from '@/lib/id';
import { localDateStr, fmtDate } from '@/lib/time';
import {
  generateInstances,
  describeRecurrence,
  isOverdue,
  reorder,
  bySortOrder,
} from '@/lib/business/tasks';
import { roleAllows } from '@/config/plans';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { useSessionStore } from '@/stores/session';
import { TaskTemplateModal } from './TaskTemplateModal';
import type { TaskTemplate, TaskInstance } from '@/data/types';
import styles from './TasksPage.module.css';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', karyawan: 'Karyawan',
};

export function TasksPage() {
  const { data: templates } = useCollection('taskTemplates');
  const { data: instances } = useCollection('taskInstances');
  const { data: employees } = useCollection('employees');
  const { data: outlets } = useCollection('outlets');
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const orgId = org?.id ?? '';
  const canManage = me ? roleAllows(me.role, '*') || me.role === 'admin' : false;

  const [tab, setTab] = useState<'today' | 'templates'>('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [toDelete, setToDelete] = useState<TaskTemplate | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  const today = localDateStr();
  // Templates render in manual SOP order — this is what seeds each new day.
  const orderedTemplates = useMemo(() => [...templates].sort(bySortOrder), [templates]);

  // Auto-generate due instances for a rolling window [today-7, today+1].
  useEffect(() => {
    if (!orgId || templates.length === 0) return;
    const from = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return localDateStr(d);
    })();
    const to = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return localDateStr(d);
    })();
    const missing = generateInstances(templates, instances, from, to, orgId);
    if (missing.length) {
      void repository.putMany('taskInstances', missing);
    }
  }, [templates, instances, orgId]);

  // Manual order only (user choice (a)): ↑↓ must behave predictably across the
  // WHOLE list, so overdue items no longer jump the queue by date — their
  // urgency is carried by the red "Telat" badge + highlighted row instead.
  const todayTasks = useMemo(
    () =>
      instances
        .filter((i) => i.dueDate <= today)
        .filter((i) => i.status === 'pending')
        .sort(bySortOrder),
    [instances, today],
  );
  const doneToday = useMemo(
    () => instances.filter((i) => i.status === 'done' && i.dueDate === today),
    [instances, today],
  );

  const complete = async (inst: TaskInstance) => {
    try {
      await repository.put('taskInstances', {
        ...inst,
        status: 'done',
        completedAt: new Date().toISOString(),
        completedById: me?.id ?? '',
        completedByName: me?.name ?? '',
      });
      logActivity({
        action: 'task.complete',
        entityType: 'task',
        entityId: inst.id,
        entityLabel: inst.title,
      });
      toast.success('Tugas selesai');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menandai tugas selesai');
    }
  };

  const uncomplete = async (inst: TaskInstance) => {
    try {
      await repository.put('taskInstances', {
        ...inst,
        status: 'pending',
        completedAt: null,
        completedById: null,
        completedByName: '',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membatalkan tanda selesai');
    }
  };

  const addQuickTask = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
    try {
      // Ad-hoc "quick task" for today: a TaskInstance with no template
      // (templateId null), so it never collides with template generation and
      // is a valid NULL UUID in cloud Postgres (empty string '' would throw).
      await repository.put('taskInstances', {
        id: newId(),
        orgId,
        outletId: null,
        templateId: null,
        title,
        description: '',
        dueDate: today,
        status: 'pending',
        completedAt: null,
        completedById: null,
        completedByName: '',
        note: '',
        // Land at the bottom of today's list, not in the middle of the SOP.
        sortOrder: todayTasks.length
          ? Math.max(...todayTasks.map((t) => t.sortOrder ?? 0)) + 1
          : 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      setQuickTitle('');
      logActivity({
        action: 'task.create',
        entityType: 'task',
        entityLabel: title,
      });
      toast.success('Tugas cepat ditambahkan');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menambah tugas');
    }
  };

  /** Persist a ↑↓ move. `reorder` returns only the rows that actually changed. */
  const move = async (
    collection: 'taskInstances' | 'taskTemplates',
    list: (TaskInstance | TaskTemplate)[],
    index: number,
    dir: -1 | 1,
  ) => {
    const changed = reorder(list, index, dir);
    if (!changed.length) return;
    try {
      await repository.putMany(collection as 'taskInstances', changed as TaskInstance[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengubah urutan');
    }
  };

  /** B1: editing a task from the daily list opens its TEMPLATE editor. */
  const editTemplateOf = (inst: TaskInstance) => {
    const tpl = templates.find((t) => t.id === inst.templateId);
    if (!tpl) return toast.warning('Template tugas ini tidak ditemukan');
    setEditing(tpl);
    setModalOpen(true);
  };

  // Ad-hoc tasks have no managing template, so allow direct removal.
  const deleteAdhoc = async (inst: TaskInstance) => {
    try {
      await repository.remove('taskInstances', inst.id);
      toast.success('Tugas dihapus');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus tugas');
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!toDelete) return;
    try {
      await repository.remove('taskTemplates', toDelete.id);
      toast.success('Template dihapus');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus template');
    } finally {
      setToDelete(null);
    }
  };

  const assigneeLabel = (t: TaskTemplate): string => {
    if (t.assigneeType === 'employee') {
      return employees.find((e) => e.id === t.assigneeEmployeeId)?.name ?? 'Karyawan';
    }
    if (t.assigneeType === 'outlet') {
      return outlets.find((o) => o.id === t.assigneeOutletId)?.name ?? 'Outlet';
    }
    return ROLE_LABEL[t.assigneeRole ?? 'karyawan'];
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'today' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('today')}>
          Tugas Hari Ini
          {todayTasks.length > 0 && <Badge tone="danger">{todayTasks.length}</Badge>}
        </button>
        {canManage && (
          <button className={[styles.tab, tab === 'templates' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('templates')}>
            Template ({templates.length})
          </button>
        )}
        {canManage && tab === 'templates' && (
          <Button
            className={styles.addBtn}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            iconLeft={<Icon name="plus" aria-hidden />}
          >
            Template Baru
          </Button>
        )}
      </div>

      {tab === 'today' ? (
        <>
          <div className={styles.quickAdd}>
            <Input
              placeholder="Tugas cepat hari ini… (mis. telepon supplier)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addQuickTask()}
              iconLeft={<Icon name="list-check" aria-hidden />}
            />
            <Button onClick={addQuickTask} disabled={!quickTitle.trim()} iconLeft={<Icon name="plus" aria-hidden />}>
              Tambah
            </Button>
          </div>
          <Card glass>
            <CardHeader icon={<Icon name="list-check" aria-hidden />} title="Perlu Dikerjakan" />
            <CardBody className={styles.noPad}>
              {todayTasks.length === 0 ? (
                <EmptyState
                  icon={<Icon name="circle-check" aria-hidden />}
                  title="Semua tugas selesai"
                  description={templates.length === 0 ? 'Belum ada template tugas.' : 'Kerja bagus! Tidak ada tugas tertunda.'}
                />
              ) : (
                <ul className={styles.taskList}>
                  {todayTasks.map((t, i) => {
                    const overdue = isOverdue(t, today);
                    return (
                      <li key={t.id} className={[styles.taskItem, overdue ? styles.overdue : ''].join(' ')}>
                        <button className={styles.checkbox} onClick={() => complete(t)} aria-label="Tandai selesai" />
                        <div className={styles.taskInfo}>
                          <strong>{t.title}</strong>
                          {t.description && <small>{t.description}</small>}
                        </div>
                        {overdue ? (
                          <span className={[styles.dueTag, styles.late].join(' ')}>Telat · {fmtDate(t.dueDate)}</span>
                        ) : (
                          <span className={styles.dueTag}>{fmtDate(t.dueDate)}</span>
                        )}
                        {canManage && (
                          <span className={styles.orderBtns}>
                            <button
                              className={styles.iconBtn}
                              onClick={() => move('taskInstances', todayTasks, i, -1)}
                              disabled={i === 0}
                              aria-label="Naikkan urutan"
                              title="Naikkan (hanya hari ini)"
                            >
                              <Icon name="arrow-up" aria-hidden />
                            </button>
                            <button
                              className={styles.iconBtn}
                              onClick={() => move('taskInstances', todayTasks, i, 1)}
                              disabled={i === todayTasks.length - 1}
                              aria-label="Turunkan urutan"
                              title="Turunkan (hanya hari ini)"
                            >
                              <Icon name="arrow-down" aria-hidden />
                            </button>
                          </span>
                        )}
                        {/* B1: template-derived task → edit its TEMPLATE. */}
                        {t.templateId && canManage && (
                          <button
                            className={styles.iconBtn}
                            onClick={() => editTemplateOf(t)}
                            aria-label="Edit template tugas"
                            title="Edit template (berlaku untuk hari berikutnya)"
                          >
                            <Icon name="pen" aria-hidden />
                          </button>
                        )}
                        {!t.templateId && canManage && (
                          <button
                            className={[styles.iconBtn, styles.danger].join(' ')}
                            onClick={() => deleteAdhoc(t)}
                            aria-label="Hapus tugas cepat"
                            title="Hapus tugas cepat"
                          >
                            <Icon name="trash" aria-hidden />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {doneToday.length > 0 && (
            <Card glass>
              <CardHeader icon={<Icon name="check-double" aria-hidden />} title={`Selesai Hari Ini (${doneToday.length})`} />
              <CardBody className={styles.noPad}>
                <ul className={styles.taskList}>
                  {doneToday.map((t) => (
                    <li key={t.id} className={[styles.taskItem, styles.taskDone].join(' ')}>
                      <button className={[styles.checkbox, styles.checked].join(' ')} onClick={() => uncomplete(t)} aria-label="Batalkan">
                        <Icon name="check" aria-hidden />
                      </button>
                      <div className={styles.taskInfo}>
                        <strong>{t.title}</strong>
                        <small>oleh {t.completedByName || '—'}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      ) : (
        <Card glass>
          <CardBody className={styles.noPad}>
            {templates.length === 0 ? (
              <EmptyState
                icon={<Icon name="list-check" aria-hidden />}
                title="Belum ada template tugas"
                description="Buat template SOP berulang untuk tim Anda."
                action={
                  <Button onClick={() => { setEditing(null); setModalOpen(true); }} iconLeft={<Icon name="plus" aria-hidden />}>
                    Template Baru
                  </Button>
                }
              />
            ) : (
              <ul className={styles.templateList}>
                {orderedTemplates.map((t, i) => (
                  <li key={t.id} className={styles.templateItem}>
                    <div className={styles.templateInfo}>
                      <strong>{t.title}</strong>
                      <div className={styles.templateMeta}>
                        <span className={styles.metaChip}>
                          <Icon name="repeat" aria-hidden /> {describeRecurrence(t)}
                        </span>
                        <span className={styles.metaChip}>
                          <Icon name="user" aria-hidden /> {assigneeLabel(t)}
                        </span>
                      </div>
                    </div>
                    {!t.active && <Badge tone="neutral">Nonaktif</Badge>}
                    <div className={styles.templateActions}>
                      {/* SOP order — seeds every new day's task list. */}
                      <button
                        className={styles.iconBtn}
                        onClick={() => move('taskTemplates', orderedTemplates, i, -1)}
                        disabled={i === 0}
                        aria-label="Naikkan urutan template"
                        title="Naikkan (urutan default tiap hari)"
                      >
                        <Icon name="arrow-up" aria-hidden />
                      </button>
                      <button
                        className={styles.iconBtn}
                        onClick={() => move('taskTemplates', orderedTemplates, i, 1)}
                        disabled={i === orderedTemplates.length - 1}
                        aria-label="Turunkan urutan template"
                        title="Turunkan (urutan default tiap hari)"
                      >
                        <Icon name="arrow-down" aria-hidden />
                      </button>
                      <button className={styles.iconBtn} onClick={() => { setEditing(t); setModalOpen(true); }} aria-label="Edit">
                        <Icon name="pen" aria-hidden />
                      </button>
                      <button className={[styles.iconBtn, styles.danger].join(' ')} onClick={() => setToDelete(t)} aria-label="Hapus">
                        <Icon name="trash" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <TaskTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        employees={employees}
        outlets={outlets}
        nextSortOrder={orderedTemplates.length}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Hapus Template?"
        message={`"${toDelete?.title}" akan dihapus. Instance tugas yang sudah dibuat tetap ada.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
