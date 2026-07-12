import { useMemo, useState } from 'react';
import { Card, CardBody, Button, EmptyState, Icon, Input, Select, Badge } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { actionMeta, roleLabel, filterActivity, ACTION_META } from '@/lib/business/activity';
import { fmtDate, localDateOf, localTimeStr } from '@/lib/time';
import type { Role } from '@/data/types';
import styles from './ActivityLogPage.module.css';

/** "HH:MM" local time via localTimeStr — NOT toLocaleTimeString (see time.ts:
 * known Chrome/Edge Windows bug rendering 11AM as 23). */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return localTimeStr(d);
}

// Derived from ACTION_META (single source of truth) so every recorded verb is
// filterable — a hand-copied list here kept falling behind new verbs.
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Semua aksi' },
  ...Object.entries(ACTION_META).map(([value, meta]) => ({ value, label: meta.label })),
];

/** DOM cap: only the newest rows are rendered (matches FinancePage's cap). */
const MAX_RENDERED = 300;

const ROLE_OPTIONS: { value: Role | 'all'; label: string }[] = [
  { value: 'all', label: 'Semua peran' },
  { value: 'owner', label: 'Pemilik' },
  { value: 'admin', label: 'Admin' },
  { value: 'karyawan', label: 'Karyawan' },
];

/**
 * Owner-only audit trail, styled as a bench "Event Recorder — Diagnostic
 * Trace": a multi-channel data-logger faceplate (live REC LED + readout)
 * feeding a continuous vertical trace rail where each action is a glowing
 * signal-node. Read access is enforced server-side by RLS (migration 0019);
 * this page is also guarded by OwnerRoute.
 */
export function ActivityLogPage() {
  const { data: logs, loading } = useCollection('activity');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [action, setAction] = useState<string>('all');

  const filtered = useMemo(
    () => filterActivity(logs, { query, role, action }),
    [logs, query, role, action],
  );

  // Distinct actors among the filtered set = number of "channels" recorded.
  const channels = useMemo(
    () => new Set(filtered.map((l) => l.actorId ?? l.actorName)).size,
    [filtered],
  );

  // Cap the DOM at the newest rows — filterActivity already sorts newest-first.
  const visible = useMemo(() => filtered.slice(0, MAX_RENDERED), [filtered]);

  // Group rows by calendar day (date label) for the recorder tape segments.
  const groups = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const l of visible) {
      const day = l.createdAt ? localDateOf(l.createdAt) : '';
      const list = map.get(day) ?? [];
      list.push(l);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [visible]);

  const hasFilter = query !== '' || role !== 'all' || action !== 'all';

  return (
    <div className={styles.wrap}>
      {/* ---------- Recorder faceplate ---------- */}
      <div className={styles.recorder}>
        <div className={styles.recLeft}>
          <span className={styles.recLed} aria-hidden />
          <div className={styles.recTitle}>
            <span className={styles.recTag}>EVENT RECORDER</span>
            <strong>Jejak Audit · Khusus Pemilik</strong>
          </div>
        </div>
        <div className={styles.readout}>
          <div className={styles.readItem}>
            <span className={styles.readLabel}>TOTAL</span>
            <strong className={styles.readValue}>{String(logs.length).padStart(3, '0')}</strong>
          </div>
          <div className={styles.readSep} aria-hidden />
          <div className={styles.readItem}>
            <span className={styles.readLabel}>TAMPIL</span>
            <strong className={styles.readValue}>{String(filtered.length).padStart(3, '0')}</strong>
          </div>
          <div className={styles.readSep} aria-hidden />
          <div className={styles.readItem}>
            <span className={styles.readLabel}>KANAL</span>
            <strong className={styles.readValue}>{String(channels).padStart(2, '0')}</strong>
          </div>
        </div>
      </div>

      {/* ---------- Control strip (filters) ---------- */}
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Icon name="magnifying-glass" className={styles.searchIcon} aria-hidden />
          <Input
            placeholder="Cari nama atau objek…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cari aktivitas"
          />
        </div>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as Role | 'all')}
          options={ROLE_OPTIONS}
          aria-label="Filter peran"
        />
        <Select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          options={ACTION_OPTIONS}
          aria-label="Filter aksi"
        />
        {hasFilter && (
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('');
              setRole('all');
              setAction('all');
            }}
          >
            <Icon name="times" aria-hidden /> Reset
          </Button>
        )}
      </div>

      <Card glass className={styles.traceCard}>
        <CardBody className={styles.noPad}>
          {loading ? (
            <p className={styles.loading}>
              <Icon name="circle-notch" className={styles.spin} aria-hidden /> Merekam…
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Icon name="pulse" aria-hidden />}
              title={hasFilter ? 'Tidak ada event cocok' : 'Belum ada aktivitas'}
              description={
                hasFilter
                  ? 'Coba longgarkan filter pencarian.'
                  : 'Jejak aktivitas tim akan terekam di sini saat mereka bekerja.'
              }
            />
          ) : (
            <div className={styles.trace}>
              {filtered.length > MAX_RENDERED && (
                <p className={styles.loading} role="note">
                  Menampilkan {MAX_RENDERED} event terbaru dari {filtered.length}. Persempit
                  filter untuk melihat event lama.
                </p>
              )}
              {groups.map(([day, rows]) => (
                <section key={day} className={styles.segment}>
                  <div className={styles.segHead}>
                    <Icon name="calendar" aria-hidden /> {fmtDate(day)}
                    <span className={styles.segCount}>{rows.length} event</span>
                  </div>
                  <ul className={styles.events}>
                    {rows.map((log) => {
                      const meta = actionMeta(log.action);
                      return (
                        <li key={log.id} className={styles.event}>
                          <span
                            className={[styles.node, styles[`tone_${meta.tone}`]].join(' ')}
                            aria-hidden
                          >
                            <Icon name={meta.icon} aria-hidden />
                          </span>
                          <div className={styles.evBody}>
                            <div className={styles.evTop}>
                              <strong className={styles.action}>{meta.label}</strong>
                              {log.entityLabel && <span className={styles.entity}>{log.entityLabel}</span>}
                            </div>
                            <div className={styles.evMeta}>
                              <span className={styles.actor}>
                                <Icon name="user" className={styles.actorIcon} aria-hidden />
                                {log.actorName || '—'}
                              </span>
                              <Badge tone="neutral">{roleLabel(log.actorRole)}</Badge>
                            </div>
                          </div>
                          <time className={styles.time}>{fmtClock(log.createdAt)}</time>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
