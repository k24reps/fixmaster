import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardBody, Button, EmptyState, Icon, Modal, Input, Select, ConfirmDialog, LoadState, loadPending } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { repository } from '@/data';
import { isSupabaseConfigured, clockIn, clockOut } from '@/data/supabase-client';
import { isOwner } from '@/config/plans';
import { logActivity } from '@/lib/activity';
import { getCurrentPosition } from '@/lib/geo';
import {
  hasGeofence,
  hoursByEmployee,
  withinRange,
  visibleAttendance,
  isWorkedDay,
  STATUS_LABEL,
  IMPLAUSIBLE_HOURS,
} from '@/lib/business/attendance';
import { newId } from '@/lib/id';
import { localDateStr, localTimeStr, localTimeSec, calcHours, fmtDate } from '@/lib/time';
import { toast } from '@/stores/toast';
import { useFormat } from '@/lib/useFormat';
import { useSessionStore } from '@/stores/session';
import type { Attendance } from '@/data/types';
import styles from './AttendancePage.module.css';

export function AttendancePage() {
  const { data: attendance, refetch, ...attendanceRest } = useCollection('attendance');
  const attendanceLoad = { ...attendanceRest, refetch };
  const { data: outlets } = useCollection('outlets');
  const { data: employees } = useCollection('employees');
  const me = useSessionStore((s) => s.currentEmployee);
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const today = localDateStr();
  // Halaman ini sengaja TIDAK memakai isManager(). Absensi seluruh tim adalah
  // data upah plus pola kehadiran orang lain, dan itu milik PEMILIK — bukan
  // siapa pun yang kebetulan berperan manager. Admin memang manager untuk
  // servis, stok, dan supplier; kehadiran rekan kerjanya bukan urusan
  // operasional, itu urusan ketenagakerjaan.
  const owner = me ? isOwner(me.role) : false;
  const { fmtDate: fmtLocaleDate } = useFormat();

  // Koreksi owner: ubah jam/status atau hapus baris; plus entri manual
  // (absenkan karyawan) lewat modal yang sama, jalur `creating`.
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

  // Periode yang sedang dilihat — mengendalikan REKAP sekaligus RIWAYAT.
  // Rentang bebas, bukan bulan kalender: periode gaji toko jarang jatuh persis
  // tanggal 1 sampai akhir bulan; 26–25 dan per-dua-minggu sama umumnya.
  // Bawaannya bulan berjalan, karena itu yang paling sering dilihat.
  const [from, setFrom] = useState(() => `${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const rangeValid = from <= to;
  // Rekap owner-only. Isinya jam kerja SELURUH karyawan sepanjang periode —
  // dasar perhitungan upah dan sekaligus potret siapa yang sering telat.
  // Sebelumnya saya buka untuk manager dengan alasan "admin boleh mengoreksi,
  // jadi harus bisa memeriksa hasilnya". Itu keliru: yang perlu diperiksa
  // admin adalah barisnya sendiri, bukan rekap satu toko.
  const recap = useMemo(
    () => (owner ? hoursByEmployee(attendance, from, to) : []),
    [attendance, from, to, owner],
  );

  // Outlet whose geofence applies to this check-in: the active branch if one is
  // selected, otherwise the primary (or first) outlet.
  const targetOutlet = useMemo(() => {
    if (outlets.length === 0) return null;
    const fallback = outlets.find((o) => o.isPrimary) ?? outlets[0];
    if (!activeOutletId) return fallback;
    // Cabang aktif yang sudah dihapus TIDAK boleh mengembalikan null: dulu
    // itu menjatuhkan check-in ke jalur legacy — tulis langsung, tanpa GPS,
    // tanpa server. Kegagalan senyap ke arah yang lebih longgar adalah
    // kegagalan terburuk untuk sebuah gerbang.
    return outlets.find((o) => o.id === activeOutletId) ?? fallback;
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

  // Jam yang akan tersimpan, dihitung sambil mengetik. Menampilkannya di modal
  // membuat shift semalaman (calcHours menambah 24 jam saat keluar < masuk)
  // terlihat SEBELUM disimpan — dulu "17:00–08:00" diam-diam jadi 15 jam.
  const editHours = useMemo(
    () => (editIn && editOut ? calcHours(editIn, editOut) : null),
    [editIn, editOut],
  );

  const saveEdit = async () => {
    if (!editRow && !creating) return;
    const checkIn = editIn.trim() || null;
    const checkOut = editOut.trim() || null;
    // Input-nya kini type="time", tapi nilai bisa datang dari paste atau
    // browser lama. Tanpa penjagaan ini "8" tersimpan apa adanya dan
    // calcHours mengembalikan 0 — sehari upah hilang tanpa satu peringatan.
    const badFormat = (v: string | null) => v !== null && !/^\d{2}:\d{2}$/.test(v);
    if (badFormat(checkIn) || badFormat(checkOut)) {
      toast.error('Format jam harus HH:MM, misalnya 08:30');
      return;
    }
    if (checkOut && !checkIn) {
      toast.error('Isi jam masuk dulu sebelum jam keluar');
      return;
    }
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

  // Baris absensi SAYA hari ini — satu-satunya, karena satu baris per hari
  // (dijamin indeks di migrasi 0054). Tiga turunan di bawah dibaca darinya,
  // bukan dari tiga pencarian terpisah yang bisa saling bertentangan.
  const myRow = useMemo(
    () => attendance.find((a) => a.employeeId === me?.id && a.date === today) ?? null,
    [attendance, me, today],
  );
  // Izin/sakit/alpha bukan shift. Dulu ketiganya lolos ke myTodayDone dan
  // membuat papan jam menampilkan "Selesai · 8.75 jam" untuk orang yang
  // justru sedang tidak masuk.
  const myAbsent = myRow && myRow.status !== 'hadir' ? myRow : null;
  const myToday = myRow && !myAbsent && myRow.checkIn && !myRow.checkOut ? myRow : null;
  const myTodayDone = myRow && !myAbsent && myRow.checkIn && myRow.checkOut ? myRow : null;

  const todayRecords = useMemo(
    () => attendance.filter((a) => a.date === today).sort((a, b) => (a.checkIn ?? '').localeCompare(b.checkIn ?? '')),
    [attendance, today],
  );

  const recentByDay = useMemo(() => {
    // HANYA OWNER yang melihat riwayat seluruh tim. Admin dan karyawan sama:
    // barisnya sendiri saja. Admin memang manager untuk servis, stok, dan
    // supplier — tapi kehadiran rekan kerjanya bukan urusan operasional, itu
    // urusan ketenagakerjaan, dan yang menggaji hanya satu orang.
    //
    // Batasnya soal RIWAYAT, bukan kehadiran hari ini: papan "Kehadiran Hari
    // Ini" di atas tetap terbuka untuk semua — siapa yang sedang jaga adalah
    // informasi shift biasa. Yang sensitif adalah polanya sepanjang periode:
    // siapa sering telat, siapa sering absen.
    const scoped = visibleAttendance(attendance, { isOwner: owner, employeeId: me?.id });
    // Difilter per periode, bukan dipotong 30 baris terakhir. Potongan lama
    // membuat tim 5 orang hanya punya enam hari riwayat, dan tidak ada cara
    // sama sekali melihat bulan lalu.
    // Rentangnya SAMA dengan rekap di atas: satu kontrol, supaya baris yang
    // dilihat selalu baris yang dihitung.
    if (!rangeValid) return [];
    return scoped
      .filter((a) => a.date && withinRange(a.date, from, to))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.checkIn ?? '').localeCompare(a.checkIn ?? ''));
  }, [attendance, owner, me, from, to, rangeValid]);

  const checkIn = async () => {
    if (!me) return;
    // Satu baris per karyawan per hari — penjagaan yang sudah ada di entri
    // manual (lihat saveEdit) tapi hilang di jalur otomatis. Dua perangkat,
    // atau satu yang belum sempat refetch, menghasilkan dua baris dan rekap
    // yang menggelembung. Server menolaknya juga (migrasi 0053); ini hanya
    // supaya pesannya ramah, bukan lemparan RPC.
    if (attendance.some((a) => a.employeeId === me.id && a.date === today)) {
      toast.error('Anda sudah tercatat absen hari ini');
      return;
    }
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
      // Cermin dari checkIn: kalau outlet-nya ber-geofence, pulang divalidasi
      // server juga. Sebelumnya masuk dijaga GPS + jam server sementara pulang
      // ditulis langsung dari perangkat — separuh catatan jam kerja tidak
      // bisa dipercaya, dan separuh itulah yang menentukan upah.
      if (isSupabaseConfigured && targetOutlet && hasGeofence(targetOutlet)) {
        const pos = await getCurrentPosition();
        await clockOut({ attendanceId: myToday.id, lat: pos.lat, lng: pos.lng });
        await refetch();
      } else {
        await repository.put('attendance', {
          ...myToday,
          checkOut: out,
          totalHours: calcHours(myToday.checkIn ?? '00:00', out),
        });
      }
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

  // Lompatan cepat ke periode yang paling sering diminta. Mengetik dua tanggal
  // untuk "bulan lalu" setiap kali gajian adalah gesekan yang tidak perlu.
  const setPreset = (preset: 'thisMonth' | 'lastMonth' | 'last7') => {
    const d = new Date(`${today}T00:00:00`);
    if (preset === 'last7') {
      const start = new Date(d);
      start.setDate(start.getDate() - 6);
      setFrom(localDateStr(start));
      setTo(today);
      return;
    }
    // setMonth() di JS menangani pergantian tahun sendiri: Januari − 1 = Desember
    // tahun sebelumnya. Menghitungnya manual dari string adalah cara klasik
    // kehilangan bulan Desember.
    const base = preset === 'lastMonth' ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : new Date(d.getFullYear(), d.getMonth(), 1);
    // Hari ke-0 bulan berikutnya = hari terakhir bulan ini, termasuk Februari.
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    setFrom(localDateStr(base));
    setTo(preset === 'thisMonth' ? today : localDateStr(end));
  };

  // Satu kontrol periode, dua kartu. Rekap dan riwayat harus selalu menunjukkan
  // rentang yang sama — dua pemilih terpisah adalah cara termudah membuat
  // pemilik membandingkan total Agustus dengan baris September.
  const periodPicker = (
    <div className={styles.period}>
      <div className={styles.periodDates}>
        <input
          type="date"
          max={to}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={styles.dateInput}
          aria-label="Tanggal mulai"
        />
        <span className={styles.periodSep} aria-hidden>
          &ndash;
        </span>
        <input
          type="date"
          min={from}
          max={today}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={styles.dateInput}
          aria-label="Tanggal akhir"
        />
      </div>
      <div className={styles.periodPresets}>
        <button type="button" className={styles.presetBtn} onClick={() => setPreset('thisMonth')}>
          Bulan ini
        </button>
        <button type="button" className={styles.presetBtn} onClick={() => setPreset('lastMonth')}>
          Bulan lalu
        </button>
        <button type="button" className={styles.presetBtn} onClick={() => setPreset('last7')}>
          7 hari
        </button>
      </div>
    </div>
  );

  const periodLabel = `${fmtLocaleDate(`${from}T00:00:00`, { day: 'numeric', month: 'short' })} – ${fmtLocaleDate(`${to}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}`;

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
          {myAbsent && (
            <span className={styles.clockStatus}>
              <span className={styles.statusLed} aria-hidden />
              Tercatat {STATUS_LABEL[myAbsent.status].toLowerCase()} hari ini
            </span>
          )}
        </div>
        <div className={styles.clockActions}>
          {/* Tombol Check In hilang begitu ADA baris hari ini, apa pun
              statusnya. Dulu baris izin tidak dikenali, tombolnya tetap
              muncul, dan menekannya hanya menghasilkan penolakan. */}
          {!myRow && (
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
          {myAbsent && (
            <span className={[styles.statePill, styles.absent].join(' ')}>
              {STATUS_LABEL[myAbsent.status]}
            </span>
          )}
        </div>
      </div>

      <Card glass>
        <CardHeader
          icon={<Icon name="users" aria-hidden />}
          title="Kehadiran Hari Ini"
          action={
            // Owner-only, sejalan dengan tombol edit/hapus di riwayat: yang
            // boleh menulis absensi orang lain hanya yang menggajinya.
            owner && (
              <Button size="sm" variant="secondary" onClick={openCreate} iconLeft={<Icon name="plus" aria-hidden />}>
                Absenkan
              </Button>
            )
          }
        />
        <CardBody className={styles.noPad}>
          {loadPending(attendanceLoad) ? (
            <LoadState queries={[attendanceLoad]} />
          ) : todayRecords.length === 0 ? (
            <EmptyState
              icon={<Icon name="user-clock" aria-hidden />}
              title="Belum ada check-in"
              description="Kehadiran tim hari ini akan tampil di sini."
            />
          ) : (
            <ul className={styles.list}>
              {todayRecords.map((a) => (
                <li key={a.id} className={styles.listItem}>
                  <span className={styles.plate}>{a.employeeName.charAt(0).toUpperCase()}</span>
                  <div className={styles.itemInfo}>
                    <strong>{a.employeeName}</strong>
                    <small>
                      {a.status === 'hadir'
                        ? `${a.checkIn ?? '—'}${a.checkOut ? ` – ${a.checkOut}` : ''}`
                        : STATUS_LABEL[a.status]}
                      {a.note ? ` · ${a.note}` : ''}
                    </small>
                  </div>
                  {/* Pill hijau berarti "shift selesai". Baris izin/sakit/alpha
                      dulu ikut memakainya dan terbaca sebagai hari kerja penuh
                      dengan nol jam — kebalikan dari kenyataannya. */}
                  {a.status !== 'hadir' ? (
                    <span className={[styles.statePill, styles.absent].join(' ')}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  ) : a.checkOut ? (
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

      {/* Kontrol periode berdiri sendiri di atas kedua kartu yang dikendalikannya.
          Menaruhnya di dalam salah satu header akan menyiratkan ia hanya
          mengatur kartu itu. */}
      <Card glass>
        <CardBody className={styles.periodBody}>
          <span className={styles.periodLabel}>
            <Icon name="calendar" aria-hidden /> Periode
          </span>
          {periodPicker}
        </CardBody>
      </Card>

      {owner && (
        <Card glass>
          <CardHeader
            icon={<Icon name="clock" aria-hidden />}
            title="Total Jam Kerja per Karyawan"
            action={<span className={styles.periodTag}>{periodLabel}</span>}
          />
          <CardBody className={styles.noPad}>
            {loadPending(attendanceLoad) ? (
              <LoadState queries={[attendanceLoad]} />
            ) : recap.length === 0 ? (
              <EmptyState icon={<Icon name="calendar" aria-hidden />} title="Belum ada absensi pada periode ini" />
            ) : (
              <div className={styles.ledger}>
                <div className={styles.recapHead}>
                  <span>Karyawan</span>
                  <span className={styles.hours}>Hadir</span>
                  <span className={styles.hours}>Izin</span>
                  <span className={styles.hours}>Sakit</span>
                  <span className={styles.hours}>Alpha</span>
                  <span className={styles.hours}>Total Jam</span>
                </div>
                {recap.map((r) => (
                  <div key={r.employeeId} className={styles.recapRow}>
                    <span className={styles.ledgerName}>{r.employeeName}</span>
                    <span className={styles.hours}>{r.days}</span>
                    {/* Nol ditulis samar, bukan nol tebal: yang perlu terbaca
                        sekilas adalah kolom yang BERISI. */}
                    <span className={[styles.hours, r.izin ? '' : styles.muted].join(' ')}>{r.izin}</span>
                    <span className={[styles.hours, r.sakit ? '' : styles.muted].join(' ')}>{r.sakit}</span>
                    <span className={[styles.hours, r.alpha ? '' : styles.muted].join(' ')}>{r.alpha}</span>
                    <span className={styles.hours}>{r.totalHours} jam</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card glass>
        <CardHeader
          icon={<Icon name="clock-rotate-left" aria-hidden />}
          title="Riwayat Absensi"
          action={<span className={styles.periodTag}>{periodLabel}</span>}
        />
        <CardBody className={styles.noPad}>
          {loadPending(attendanceLoad) ? (
            <LoadState queries={[attendanceLoad]} />
          ) : recentByDay.length === 0 ? (
            <EmptyState icon={<Icon name="calendar" aria-hidden />} title="Belum ada riwayat pada periode ini" />
          ) : (
            <div className={styles.ledger}>
              <div className={[styles.ledgerHead, owner ? styles.withActions : ''].join(' ')}>
                <span>Tanggal</span>
                <span>Karyawan</span>
                <span>Masuk</span>
                <span>Keluar</span>
                <span>Status</span>
                <span className={styles.hours}>Total</span>
                {owner && <span className={styles.actionsCol}>Aksi</span>}
              </div>
              {recentByDay.map((a) => (
                <div key={a.id} className={[styles.ledgerRow, owner ? styles.withActions : ''].join(' ')}>
                  <span className={styles.punch}>{fmtDate(a.date)}</span>
                  <span className={styles.ledgerName}>
                    {a.employeeName}
                    {/* Catatan dulu bisa diisi tapi tidak pernah tampil di mana
                        pun — alasan sebuah koreksi hilang begitu modal ditutup. */}
                    {a.note && <small className={styles.rowNote}>{a.note}</small>}
                  </span>
                  <span className={styles.punch}>{a.checkIn ?? '—'}</span>
                  <span className={styles.punch}>{a.checkOut ?? <span className={styles.muted}>—</span>}</span>
                  <span>
                    <span className={[styles.statusTag, styles[a.status]].join(' ')}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </span>
                  {/* Jam hanya dihitung untuk hari yang benar-benar dikerjakan.
                      Baris izin bisa saja masih membawa jam sisa dari check-in
                      pagi; menampilkannya di sini membuat baris berkata "8.75
                      jam" sementara rekap di atas berkata 0 — dua angka
                      bertentangan tentang upah yang sama. */}
                  <span className={styles.hours}>
                    {isWorkedDay(a) && a.checkOut ? (
                      `${a.totalHours} jam`
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </span>
                  {owner && (
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
          {/* type="time" — pemilih jam bawaan browser. Sebelumnya ini teks
              bebas: "8" tersimpan apa adanya, calcHours mengembalikan 0, dan
              sehari upah hilang di balik toast hijau "Absensi diperbarui". */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input label="Jam Masuk" type="time" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
            <Input
              label="Jam Keluar"
              type="time"
              value={editOut}
              onChange={(e) => setEditOut(e.target.value)}
              hint={editHours !== null ? `${editHours} jam` : undefined}
              error={
                editHours !== null && editHours > IMPLAUSIBLE_HOURS
                  ? `${editHours} jam — jam masuk & keluar tertukar?`
                  : undefined
              }
            />
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
