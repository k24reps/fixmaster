import { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { repository, isSupabaseConfigured } from '@/data';
import { trackService } from '@/data/supabase-client';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/business/services';
import { slidingWindowAllow } from '@/lib/rate-limit';
import { fmtDate } from '@/lib/time';
import { Badge, Icon } from '@/components/ui';
import styles from './TrackingPage.module.css';

/** Normalized tracking result shared by both the cloud-RPC and local paths. */
interface TrackResult {
  orgName: string;
  service: { serviceNo: string; device: string; category: string; status: string } | null;
  publicHistory: { status: string; at: string; note?: string }[];
}

/**
 * Public, no-login service tracking page. Looks up a service by org + no.
 *
 * Cloud mode reads via the `track_service` RPC (security-definer, granted to
 * `anon`) — a direct `services` table read is blocked by RLS for anonymous
 * visitors, which is why a shared link must NOT use `repository.list`. The RPC
 * already returns only safe fields and non-internal history. Local/dev mode
 * (no Supabase) reads the IndexedDB repository, scoped by the org query param.
 * Uses TanStack Query so there's no manual effect/setState.
 */
export function TrackingPage() {
  const [params] = useSearchParams();
  const orgId = params.get('org') ?? '';
  const initialNo = params.get('no') ?? '';

  const [query, setQuery] = useState(initialNo);
  const [searchNo, setSearchNo] = useState(initialNo);
  const [throttleMsg, setThrottleMsg] = useState('');
  // Client-side defense-in-depth: throttle repeated lookups (the cloud RPC is
  // also throttled server-side at 60/min per org).
  const searchTimes = useRef<number[]>([]);

  const runSearch = () => {
    const { allowed, timestamps, retryAfter } = slidingWindowAllow(
      searchTimes.current,
      10,
      60_000,
    );
    searchTimes.current = timestamps;
    if (!allowed) {
      setThrottleMsg(`Terlalu banyak pencarian. Coba lagi dalam ${retryAfter} detik.`);
      return;
    }
    setThrottleMsg('');
    setSearchNo(query);
  };

  const { data, isFetching, isFetched } = useQuery<TrackResult>({
    queryKey: ['track', orgId, searchNo],
    enabled: !!orgId && !!searchNo.trim(),
    queryFn: async () => {
      if (isSupabaseConfigured) {
        // Cloud: public RPC bypasses RLS safely for anonymous visitors.
        const r = await trackService(orgId, searchNo.trim());
        return {
          orgName: r?.orgName ?? 'FixMaster',
          service: r
            ? { serviceNo: r.serviceNo, device: r.device, category: r.category, status: r.status }
            : null,
          publicHistory: (r?.publicHistory ?? []).filter((h) => !h.internal),
        };
      }
      // Local/dev: read the IndexedDB repository, scoped to the org param.
      repository.setScope(orgId, null);
      const [org, services] = await Promise.all([
        repository.getSingleton('organization'),
        repository.list('services'),
      ]);
      const svc =
        services.find((s) => s.serviceNo.toLowerCase() === searchNo.trim().toLowerCase()) ?? null;
      return {
        orgName: (org as { name?: string } | null)?.name ?? 'FixMaster',
        service: svc
          ? { serviceNo: svc.serviceNo, device: svc.device, category: svc.category, status: svc.status }
          : null,
        publicHistory: (svc?.history ?? []).filter((h) => !h.internal),
      };
    },
  });

  const orgName = data?.orgName ?? 'FixMaster';
  const service = data?.service ?? null;
  const publicHistory = data?.publicHistory ?? [];
  const notFound = isFetched && !isFetching && !service;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <h1 className={styles.title}>{orgName}</h1>
          <p className={styles.subtitle}>Lacak Status Servis Anda</p>
        </header>

        <div className={styles.searchBox}>
          <input
            className={styles.input}
            placeholder="Masukkan no. servis (mis. FM-0001)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button className={styles.searchBtn} onClick={runSearch} disabled={isFetching}>
            {isFetching ? <Icon name="circle-notch" className="spin" aria-hidden /> : 'Lacak'}
          </button>
        </div>

        {throttleMsg && (
          <div className={styles.notFound}>
            <Icon name="triangle-exclamation" aria-hidden />
            <p>{throttleMsg}</p>
          </div>
        )}

        {notFound && (
          <div className={styles.notFound}>
            <Icon name="circle-question" aria-hidden />
            <p>Servis tidak ditemukan. Periksa kembali nomor servis Anda.</p>
          </div>
        )}

        {service && (
          <div className={styles.result}>
            <div className={styles.resultHead}>
              <div>
                <span className={styles.resultNo}>{service.serviceNo}</span>
                <h2>{service.device}</h2>
                <p className={styles.deviceMeta}>{service.category}</p>
              </div>
              <Badge tone={STATUS_TONE[service.status as keyof typeof STATUS_TONE] as 'brand'} dot>
                {STATUS_LABELS[service.status as keyof typeof STATUS_LABELS]}
              </Badge>
            </div>

            <ul className={styles.timeline}>
              {[...publicHistory].reverse().map((h, i) => (
                <li key={i} className={[styles.timelineItem, i === 0 ? styles.current : ''].join(' ')}>
                  <span className={styles.dot} data-tone={STATUS_TONE[h.status as keyof typeof STATUS_TONE]} />
                  <div>
                    <strong>{STATUS_LABELS[h.status as keyof typeof STATUS_LABELS] ?? h.status}</strong>
                    <small>{fmtDate(h.at.slice(0, 10))}{h.note ? ` · ${h.note}` : ''}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className={styles.footer}>Didukung oleh FixMaster</footer>
      </div>
    </div>
  );
}
