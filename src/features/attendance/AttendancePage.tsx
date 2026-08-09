import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, EmptyState, Icon, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { isSupabaseConfigured, clockIn } from '@/data/supabase-client';
import { isManager, isOwner } from '@/config/plans';
import { logActivity } from '@/lib/activity';
import { getCurrentPosition } from '@/lib/geo';
import { hasGeofence, monthlyHoursByEmployee } from '@/lib/business/attendance';
import { newId } from '@/lib/id';
import { localDateStr, localTimeStr, localTimeSec, calcHours, fmtDate } from '@/lib/time';
import { toast } from '@/stores/toast';
import { useFormat } from '@/lib/useFormat';
import { useSessionStore } from '@/stores/session';
import type { Attendance } from '@/data/types';
import styles from './AttendancePage.module.css';

export function AttendancePage() {
  const { data: attendance, refetch } = useCollection('attendance');
  const { data: outlets } = useCollection('outlets');
  const { data: employees } = useCollection('employees');
  const me = useSessionStore((s) => s.currentEmployee);
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const today = localDateStr();
  const isMgr = me ? isManager(me.role) : false;
  const owner = me ? isOwner(me.role) : false;
  const { fmtDate: fmtLocaleDate } = useFormat();

  // Manager correction: edit jam / status, or delete a row.
  // Owner also gets manual entry (absenkan karyawan) — same modal, `creating`.
  const [editRow, setEditRow] = useState<Attendance | null>(null);
  const [creating, setCreating] = useState(false);
  const [editEmp, setEditEmp] = useState('');
  const [editDate, setEditDate] = useState(today);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editStatus, setEditStatus] = useState('hadir');
  const [editNote, setEditNote] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Attendance | null>(null);

  // Owner recap: total work hours per employee for the selected month.
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const monthly = useMemo(
    () => (owner ? monthlyHoursByEmployee(attendance, month) : []),
    [attendance, month, owner],
  );

  // Outlet whose geofence applies to this check-in: the active branch if one is
  // selected, otherwise the primary (or first) outlet.
  const targetOutlet = useMemo(() => {
    if (outlets.length === 0) return null;
    if (activeOutletId) return outlets.find((o) => o.id === activeOutletId) ?? null;
    return outlets.find((o) => o.isPrimary) ?? outlets[0];
  }, [outlets, activeOutletId]);

  const openEdit = (a: Attendance) => {
    setEditRow(a);
    setCreating(false);
    setEditIn(a.checkIn ?? '');
    setEditOut(a.checkOut ?? '');
    setEditStatus(a.status);
    setEditNote(a.note ?? '');
  };

  const openCreate = () => {
    setEditRow(null);
    setCreating(true);
    setEditEmp('');
    setEditDate(today);
    setEditIn(localTimeStr());
    setEditOut('');
    setEditStatus('hadir');
    setEditNote('');
  };

  const closeModal = () => {
    setEditRow(null);
    setCreating(false);
  };

  const saveEdit = async () => {
    if (!editRow && !creating) return;
    const checkIn = editIn.trim() || null;
    const checkOut = editOut.trim() || null;
    const totalHours = checkIn && checkOut ? calcHours(checkIn, checkOut) : 0;
    setEditBusy(true);
    try {
      if (creating) {
        const emp = employees.find((e) => e.id === editEmp);
        if (!emp) {
          toast.error('Pilih karyawan dulu');
          return;
        }
        // One row per employee per day — a second one would double-count hours.
        if (attendance.some((a) => a.employeeId === emp.id && a.date === editDate)) {
          toast.error(`${emp.name} sudah punya absensi ${fmtDate(editDate)}`);
          return;
        }
        const now = new Date().toISOString();
        await repository.put('attendance', {
          id: newId(),
          orgId,
          outletId: targetOutlet?.id ?? null,
          employeeId: emp.id,
          employeeName: emp.name,
          date: editDate,
          status: editStatus as Attendance['status'],
          checkIn,
          checkOut,
          totalHours,
          note: editNote.trim(),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        toast.success(`${emp.name} diabsenkan ${fmtDate(editDate)}`);
        logActivity({
          action: 'attendance.checkin',
          entityType: 'attendance',
          entityLabel: emp.name,
          meta: { date: editDate, checkIn, checkOut, status: editStatus, manual: true },
        });
      } else {
        await repository.put('attendance', {
          ...editRow!,
          checkIn,
          checkOut,
          status: editStatus as Attendance['status'],
          note: editNote.trim(),
          totalHours,
        });
        toast.success('Absensi diperbarui');
        logActivity({
          action: 'attendance.update',
          entityType: 'attendance',
          entityId: editRow!.id,
          entityLabel: editRow!.employeeName,
          meta: { date: editRow!.date, checkIn, checkOut, status: editStatus },
        });
      }
      closeModal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan absensi');
    } finally {
      setEditBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await repository.remove('attendance', toDelete.id);
      toast.success('Absensi dihapus');
      logActivity({
        action: 'attendance.delete',
        entityType: 'attendance',
        entityId: toDelete.id,
        entityLabel: toDelete.employeeName,
        meta: { date: toDelete.date },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus absensi');
    } finally {
      setToDelete(null);
    }
  };

  const [busy, setBusy] = useState(false);

  // Live LCD clock — ticks every second.
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hhmmss = localTimeSec(clock);

  // The current user's open shift today (checked in, not out).
  const myToday = useMemo(
    () =>
      attendance.find(
        (a) => a.employeeId === me?.id && a.date === today && a.checkIn && !a.checkOut,
      ) ?? null,
    [attendance, me, today],
  );

  const myTodayDone = useMemo(
    () =>
      attendance.find(
        (a) => a.employeeId === me?.id && a.date === today && a.checkIn && a.checkOut,
      ) ?? null,
    [attendance, me, today],
  );

  const todayRecords = useMemo(
    () => attendance.filter((a) => a.date === today).sort((a, b) => (a.checkIn ?? '').localeCompare(b.checkIn ?? '')),
    [attendance, today],
  );

  const recentByDay = useMemo(() => {
    // Managers (owner/admin) see the whole team's history; staff only see their
    // own rows (privacy — a karyawan shouldn't see colleagues' attendance).
    const scoped = isMgr ? attendance : attendance.filter((a) => a.employeeId === me?.id);
    const sorted = [...scoped].sort((a, b) => b.date.localeCompare(a.date));
    return sorted.slice(0, 30);
  }, [attendance, isMgr, me]);

  const checkIn = async () => {
    if (!me) return;
    setBusy(true);
    try {
      // Cloud + geofenced outlet → request GPS and let the server re-validate
      // the radius (the real security boundary). The RPC bypasses the adapter
      // change-subscription, so we refetch manually afterward.
      if (isSupabaseConfigured && targetOutlet && hasGeofence(targetOutlet)) {
        const pos = await getCurrentPosition();
        await clockIn({
          orgId,
          outletId: targetOutlet.id,
          employeeId: me.id,
          lat: pos.lat,
          lng: pos.lng,
        });
        await refetch();
      } else {
        // Legacy path: no geofence configured (or local mode) → direct write.
        const now = new Date().toISOString();
        await repository.put('attendance', {
          id: newId(),
          orgId,
          outletId: targetOutlet?.id ?? null,
          employeeId: me.id,
          employeeName: me.name,
          date: today,
          status: 'hadir',
          checkIn: localTimeStr(),
          checkOut: null,
          totalHours: 0,
          note: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
      toast.success(`Check-in ${localTimeStr()}`);
      logActivity({
        action: 'attendance.checkin',
        entityType: 'attendance',
        entityLabel: me.name,
        meta: { time: localTimeStr(), outletId: targetOutlet?.id ?? null },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal check-in');
    } finally {
      setBusy(false);
    }
  };

  const checkOut = async () => {
    if (!myToday) return;
    setBusy(true);
    const out = localTimeStr();
    try {
      await repository.put('attendance', {
        ...myToday,
        checkOut: out,
        totalHours: calcHours(myToday.checkIn ?? '00:00', out),
      });
      toast.success(`Check-out ${out}`);
      logActivity({
        action: 'attendance.checkout',
        entityType: 'attendance',
        entityId: myToday.id,
        entityLabel: myToday.employeeName,
        meta: { time: out, totalHours: calcHours(myToday.checkIn ?? '00:00', out) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal check-out');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.clock}>
        <div className={styles.clockInfo}>
          <span className={styles.clockGreet}>{me?.name ? `Operator · ${me.name}` : 'Operator'}</span>
          <span className={styles.clockTime}>{hhmmss}</span>
          <span className={styles.clockDate}>{fmtDate(today)}</span>
          {myToday && (
            <span className={styles.clockStatus}>
              <span className={[styles.statusLed, styles.working].join(' ')} aria-hidden />
              Bekerja sejak {myToday.checkIn}
            </span>
          )}
          {myTodayDone && (
            <span className={styles.clockStatus}>
              <span className={[styles.statusLed, styles.done].join(' ')} aria-hidden />
              Selesai · {myTodayDone.totalHours} jam ({myTodayDone.checkIn}–{myTodayDone.checkOut})
            </span>
          )}
        </div>
        <div className={styles.clockActions}>
          {!myToday && !myTodayDone && (
            <Button size="lg" onClick={checkIn} loading={busy} iconLeft={<Icon name="right-to-bracket" aria-hidden />}>
              Check In
            </Button>
          )}
          {myToday && (
            <Button size="lg" variant="secondary" onClick={checkOut} loading={busy} iconLeft={<Icon name="right-from-bracket" aria-hidden />}>
              Check Out
            </Button>
          )}
          {myTodayDone && (
            <span className={[styles.statePill, styles.done].join(' ')}>
              <Icon name="circle-check" aria-hidden /> Lengkap
            </span>
          )}
        </div>
      </div>

      <Card glass>
        <CardHeader
          icon={<Icon name="users" aria-hidden />}
          title="Kehadiran Hari Ini"
          action={
            owner && (
              <Button size="sm" variant="secondary" onClick={openCreate} iconLeft={<Icon name="plus" aria-hidden />}>
                Absenkan
              </Button>
            )
          }
        />
        <CardBody className={styles.noPad}>
          {todayRecords.length === 0 ? (
            <EmptyState
              icon={<Icon name="user-clock" aria-hidden />}
              title="Belum ada check-in"
              description="Kehadiran tim hari ini akan tampil di sini."
            />
          ) : (
            <ul className={styles.list}>
              {todayRecords.map((a) => (
                <li key={a.id} className={[styles.listItem, a.checkOut ? styles.complete : ''].join(' ')}>
                  <span className={styles.plate}>{a.employeeName.charAt(0).toUpperCase()}</span>
                  <div className={styles.itemInfo}>
                    <strong>{a.employeeName}</strong>
                    <small>
                      {a.checkIn ?? '—'} {a.checkOut ? `– ${a.checkOut}` : ''}
                    </small>
                  </div>
                  {a.checkOut ? (
                    <span className={[styles.statePill, styles.done].join(' ')}>{a.totalHours} jam</span>
                  ) : (
                    <span className={[styles.statePill, styles.working].join(' ')}>Bekerja</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {owner && (
        <Card glass>
          <CardHeader
            icon={<Icon name="clock" aria-hidden />}
            title="Total Jam Kerja per Karyawan"
            action={
              <label className={styles.monthPicker}>
                <span>{fmtLocaleDate(`${month}-01T00:00:00`, { month: 'long', year: 'numeric' })}</span>
                <Icon name="calendar" aria-hidden />
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className={styles.monthInput}
                  aria-label="Bulan rekap"
                />
              </label>
            }
          />
          <CardBody className={styles.noPad}>
            {monthly.length === 0 ? (
              <EmptyState icon={<Icon name="calendar" aria-hidden />} title="Belum ada absensi bulan ini" />
            ) : (
              <div className={styles.ledger}>
                <div className={styles.recapHead}>
                  <span>Karyawan</span>
                  <span className={styles.hours}>Hari</span>
                  <span className={styles.hours}>Total Jam</span>
                </div>
                {monthly.map((r) => (
                  <div key={r.employeeId} className={styles.recapRow}>
                    <span className={styles.ledgerName}>{r.employeeName}</span>
                    <span className={styles.hours}>{r.days}</span>
                    <span className={styles.hours}>{r.totalHours} jam</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card glass>
        <CardHeader icon={<Icon name="clock-rotate-left" aria-hidden />} title="Riwayat Absensi" />
        <CardBody className={styles.noPad}>
          {recentByDay.length === 0 ? (
            <EmptyState icon={<Icon name="calendar" aria-hidden />} title="Belum ada riwayat" />
          ) : (
            <div className={styles.ledger}>
              <div className={[styles.ledgerHead, isMgr ? styles.withActions : ''].join(' ')}>
                <span>Tanggal</span>
                <span>Karyawan</span>
                <span>Masuk</span>
                <span>Keluar</span>
                <span className={styles.hours}>Total</span>
                {isMgr && <span className={styles.actionsCol}>Aksi</span>}
              </div>
              {recentByDay.map((a) => (
                <div key={a.id} className={[styles.ledgerRow, isMgr ? styles.withActions : ''].join(' ')}>
                  <span className={styles.punch}>{fmtDate(a.date)}</span>
                  <span className={styles.ledgerName}>{a.employeeName}</span>
                  <span className={styles.punch}>{a.checkIn ?? '—'}</span>
                  <span className={styles.punch}>{a.checkOut ?? <span className={styles.muted}>—</span>}</span>
                  <span className={styles.hours}>{a.checkOut ? `${a.totalHours} jam` : '—'}</span>
                  {isMgr && (
                    <span className={styles.actionsCol}>
                      <button className={styles.rowBtn} onClick={() => openEdit(a)} aria-label="Edit absensi">
                        <Icon name="pen" aria-hidden />
                      </button>
                      <button className={[styles.rowBtn, styles.danger].join(' ')} onClick={() => setToDelete(a)} aria-label="Hapus absensi">
                        <Icon name="trash" aria-hidden />
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={editRow !== null || creating}
        onClose={closeModal}
        title={creating ? 'Absenkan Karyawan' : `Koreksi Absensi · ${editRow?.employeeName ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Batal</Button>
            <Button onClick={saveEdit} loading={editBusy}>Simpan</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {creating && (
            <>
              <Select
                label="Karyawan"
                value={editEmp}
                onChange={(e) => setEditEmp(e.target.value)}
                placeholder="Pilih karyawan"
                options={employees
                  .filter((e) => e.active)
                  .map((e) => ({ value: e.id, label: e.name }))}
              />
              <Input
                label="Tanggal"
                type="date"
                max={today}
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input label="Jam Masuk" placeholder="HH:MM" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
            <Input label="Jam Keluar" placeholder="HH:MM" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
          </div>
          <Select
            label="Status"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            options={[
              { value: 'hadir', label: 'Hadir' },
              { value: 'izin', label: 'Izin' },
              { value: 'sakit', label: 'Sakit' },
              { value: 'alpha', label: 'Alpha' },
            ]}
          />
          <Input label="Catatan" placeholder="Opsional" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus Absensi?"
        message={`Baris absensi ${toDelete?.employeeName ?? ''} (${toDelete ? fmtDate(toDelete.date) : ''}) akan dihapus permanen.`}
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
