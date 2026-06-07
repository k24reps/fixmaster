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
} from '@/lib/business/tasks';
import { roleAllows } from '@/config/plans';
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

  const todayTasks = useMemo(
    () =>
      instances
        .filter((i) => i.dueDate <= today)
        .filter((i) => i.status === 'pending')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [instances, today],
  );
  const doneToday = useMemo(
    () => instances.filter((i) => i.status === 'done' && i.dueDate === today),
    [instances, today],
  );

  const complete = async (inst: TaskInstance) => {
    await repository.put('taskInstances', {
      ...inst,
      status: 'done',
      completedAt: new Date().toISOString(),
      completedById: me?.id ?? '',
      completedByName: me?.name ?? '',
    });
    toast.success('Tugas selesai');
  };

  const uncomplete = async (inst: TaskInstance) => {
    await repository.put('taskInstances', {
      ...inst,
      status: 'pending',
      completedAt: null,
      completedById: null,
      completedByName: '',
    });
  };

  const addQuickTask = async () => {
    const title = quickTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    setQuickTitle('');
    toast.success('Tugas cepat ditambahkan');
  };

  // Ad-hoc tasks have no managing template, so allow direct removal.
  const deleteAdhoc = async (inst: TaskInstance) => {
    await repository.remove('taskInstances', inst.id);
    toast.success('Tugas dihapus');
  };

  const confirmDeleteTemplate = async () => {
    if (!toDelete) return;
    await repository.remove('taskTemplates', toDelete.id);
    toast.success('Template dihapus');
    setToDelete(null);
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
                  {todayTasks.map((t) => {
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
                        {!t.templateId && (
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
                {templates.map((t) => (
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
