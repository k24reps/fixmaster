import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, Input, Badge, EmptyState, Icon, LoadState, loadPending } from '@/components/ui';
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
  templateItems,
  taskVisibleTo,
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
  const { data: templates, ...templatesLoad } = useCollection('taskTemplates');
  const { data: instances, ...instancesLoad } = useCollection('taskInstances');
  const { data: employees } = useCollection('employees');
  const { data: outlets } = useCollection('outlets');
  const org = useSessionStore((s) => s.org);
  const me = useSessionStore((s) => s.currentEmployee);
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
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
  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  // Auto-generate due instances for a rolling window [today-7, today+1].
  useEffect(() => {
    if (!orgId || templates.length === 0) return;
    // 30 hari ke belakang: dengan 7 hari, toko yang tutup seminggu lebih (atau
    // tugas bulanan yang tanggalnya sudah lewat) kehilangan tugasnya permanen.
    const from = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return localDateStr(d);
    })();
    const to = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return localDateStr(d);
    })();
    const missing = generateInstances(templates, instances, from, to, orgId);
    if (missing.length) {
      // Kegagalan di sini dulu ditelan diam-diam: karyawan yang ditolak aturan
      // cabang tidak pernah melihat tugasnya, tanpa satu pun pesan.
      void repository.putMany('taskInstances', missing).catch((e: unknown) => {
        toast.error(
          e instanceof Error
            ? `Tugas hari ini gagal disiapkan: ${e.message}`
            : 'Tugas hari ini gagal disiapkan',
        );
      });
    }
  }, [templates, instances, orgId]);

  // Manual order only (user choice (a)): ↑↓ must behave predictably across the
  // WHOLE list, so overdue items no longer jump the queue by date — their
  // urgency is carried by the red "Telat" badge + highlighted row instead.
  /** Every pending task due today or earlier (overdue carries a red badge). */
  const pending = useMemo(
    () =>
      instances.filter(
        (i) =>
          i.dueDate <= today &&
          i.status === 'pending' &&
          // "Tugaskan Ke" sekarang benar-benar menyaring: karyawan hanya melihat
          // tugas yang ditujukan kepadanya. Manager tetap melihat semuanya.
          taskVisibleTo(
            i.templateId ? templateById.get(i.templateId) : undefined,
            { id: me?.id ?? '', role: me?.role ?? 'karyawan' },
            allowedOutletIds,
            canManage,
          ),
      ),
    [instances, today, templateById, me, allowedOutletIds, canManage],
  );

  /**
   * Template groups, in template order. Items INSIDE a group follow the
   * template's current item order — read live, so reordering in the Template
   * tab shows up here instantly with no propagation write.
   */
  const groups = useMemo(
    () =>
      orderedTemplates
        .map((tpl) => {
          const order = new Map(templateItems(tpl).map((it, idx) => [it.id, idx]));
          const tasks = pending
            .filter((i) => i.templateId === tpl.id)
            .sort((a, b) => (order.get(a.itemId ?? '') ?? 0) - (order.get(b.itemId ?? '') ?? 0));
          return { tpl, tasks };
        })
        .filter((g) => g.tasks.length > 0),
    [orderedTemplates, pending],
  );

  /** Ad-hoc quick tasks — their own zone below the groups, own ordering. */
  // Termasuk tugas yang templatenya sudah hilang: tanpa ini baris itu tak muncul
  // di grup mana pun, tapi tetap terhitung di badge — tugas hantu.
  const adhocTasks = useMemo(
    () =>
      pending
        .filter((i) => !i.templateId || !templateById.has(i.templateId))
        .sort(bySortOrder),
    [pending, templateById],
  );
  const todayTasks = pending;
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
    // Membatalkan centang orang lain menghapus catatan siapa yang mengerjakan.
    // Manager boleh (merekalah yang mengoreksi); selain itu hanya orang yang
    // mencentangnya sendiri.
    if (!canManage && inst.completedById && inst.completedById !== me?.id) {
      toast.warning(
        `Tugas ini diselesaikan ${inst.completedByName || 'orang lain'} — minta manager untuk membatalkannya.`,
      );
      return;
    }
    try {
      await repository.put('taskInstances', {
        ...inst,
        status: 'pending',
        completedAt: null,
        completedById: null,
        completedByName: '',
      });
      // Dulu tidak tercatat sama sekali: tugas bisa "selesai" lalu dibatalkan
      // tanpa jejak siapa pun.
      logActivity({
        action: 'task.uncomplete',
        entityType: 'task',
        entityId: inst.id,
        entityLabel: inst.title,
        meta: { sebelumnyaOleh: inst.completedByName },
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
        itemId: null,
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

  /** Move a template group. Index is resolved against the FULL ordered list —
   *  groups with no pending task are hidden, so group index != template index. */
  const moveTemplate = (tpl: TaskTemplate, dir: -1 | 1) => {
    const idx = orderedTemplates.findIndex((x) => x.id === tpl.id);
    return move('taskTemplates', orderedTemplates, idx, dir);
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
      // Tugas yang belum selesai dari template ini ikut dihapus. Tanpa itu baris
      // tersebut kehilangan induknya: tak tampil di daftar, tapi tetap dihitung.
      const orphans = instances.filter(
        (i) => i.templateId === toDelete.id && i.status === 'pending',
      );
      for (const o of orphans) await repository.remove('taskInstances', o.id);
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
              {loadPending(templatesLoad, instancesLoad) ? (
                <LoadState queries={[templatesLoad, instancesLoad]} />
              ) : todayTasks.length === 0 ? (
                <EmptyState
                  icon={<Icon name="circle-check" aria-hidden />}
                  title="Semua tugas selesai"
                  description={templates.length === 0 ? 'Belum ada template tugas.' : 'Kerja bagus! Tidak ada tugas tertunda.'}
                />
              ) : (
                <div className={styles.groups}>
                  {/* Template groups first: one header per template, its items
                      below. Items are read-only here — a template's contents are
                      managed in the Template tab (reorder/delete live only there). */}
                  {groups.map(({ tpl, tasks }, gi) => (
                    <section key={tpl.id} className={styles.group}>
                      <header className={styles.groupHead}>
                        <Icon name="repeat" className={styles.groupIcon} aria-hidden />
                        <strong className={styles.groupName}>{tpl.name || tpl.title}</strong>
                        <span className={styles.groupCount}>{tasks.length} tugas</span>
                        {canManage && (
                          // Satu wrapper flex-shrink:0 untuk KETIGA tombol, supaya saat
                          // .groupHead wrap di mobile, pensil tidak terpisah sendiri ke
                          // baris baru dari pasangan naik/turun (lihat groupActions di CSS).
                          <span className={styles.groupActions}>
                            <span className={styles.orderBtns}>
                              <button
                                className={styles.iconBtn}
                                onClick={() => moveTemplate(tpl, -1)}
                                disabled={gi === 0}
                                aria-label="Naikkan urutan template"
                                title="Naikkan template"
                              >
                                <Icon name="arrow-up" aria-hidden />
                              </button>
                              <button
                                className={styles.iconBtn}
                                onClick={() => moveTemplate(tpl, 1)}
                                disabled={gi === groups.length - 1}
                                aria-label="Turunkan urutan template"
                                title="Turunkan template"
                              >
                                <Icon name="arrow-down" aria-hidden />
                              </button>
                            </span>
                            <button
                              className={styles.iconBtn}
                              onClick={() => { setEditing(tpl); setModalOpen(true); }}
                              aria-label="Edit template"
                              title="Atur isi & urutan tugas template"
                            >
                              <Icon name="pen" aria-hidden />
                            </button>
                          </span>
                        )}
                      </header>
                      <ul className={styles.taskList}>
                        {tasks.map((t) => {
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
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}

                  {/* Ad-hoc quick tasks: their own zone below the groups. */}
                  {adhocTasks.length > 0 && (
                    <section className={styles.group}>
                      <header className={styles.groupHead}>
                        <Icon name="list-check" className={styles.groupIcon} aria-hidden />
                        <strong className={styles.groupName}>Tugas Lain</strong>
                        <span className={styles.groupCount}>{adhocTasks.length} tugas</span>
                      </header>
                      <ul className={styles.taskList}>
                        {adhocTasks.map((t, i) => {
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
                                <>
                                  <span className={styles.orderBtns}>
                                    <button
                                      className={styles.iconBtn}
                                      onClick={() => move('taskInstances', adhocTasks, i, -1)}
                                      disabled={i === 0}
                                      aria-label="Naikkan urutan"
                                      title="Naikkan"
                                    >
                                      <Icon name="arrow-up" aria-hidden />
                                    </button>
                                    <button
                                      className={styles.iconBtn}
                                      onClick={() => move('taskInstances', adhocTasks, i, 1)}
                                      disabled={i === adhocTasks.length - 1}
                                      aria-label="Turunkan urutan"
                                      title="Turunkan"
                                    >
                                      <Icon name="arrow-down" aria-hidden />
                                    </button>
                                  </span>
                                  <button
                                    className={[styles.iconBtn, styles.danger].join(' ')}
                                    onClick={() => deleteAdhoc(t)}
                                    aria-label="Hapus tugas cepat"
                                    title="Hapus tugas cepat"
                                  >
                                    <Icon name="trash" aria-hidden />
                                  </button>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                </div>
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
            {loadPending(templatesLoad) ? (
              <LoadState queries={[templatesLoad]} />
            ) : templates.length === 0 ? (
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
                      <strong>{t.name || t.title}</strong>
                      <div className={styles.templateMeta}>
                        <span className={styles.metaChip}>
                          <Icon name="list-check" aria-hidden /> {t.items?.length ?? 0} tugas
                        </span>
                        <span className={styles.metaChip}>
                          <Icon name="repeat" aria-hidden /> {describeRecurrence(t)}
                        </span>
                        <span className={styles.metaChip}>
                          <Icon name="user" aria-hidden /> {assigneeLabel(t)}
                        </span>
                      </div>
                      {/* Preview the contents so the tab is scannable without
                          opening each template. */}
                      {(t.items?.length ?? 0) > 0 && (
                        <small className={styles.templateItems}>
                          {templateItems(t).map((it) => it.title).join(' · ')}
                        </small>
                      )}
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
        message={`Template "${toDelete?.name || toDelete?.title}" beserta ${toDelete?.items?.length ?? 0} tugas di dalamnya akan dihapus. Tugas hari ini yang belum selesai ikut dihapus; yang sudah selesai tetap tersimpan sebagai riwayat. Untuk menghentikan sementara, ubah statusnya jadi Nonaktif.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
