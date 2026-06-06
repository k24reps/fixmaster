import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/data';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/business/services';
import { fmtDate } from '@/lib/time';
import { Badge, Icon } from '@/components/ui';
import styles from './TrackingPage.module.css';

/**
 * Public, no-login service tracking page. Looks up a service by org + no.
 * Only non-internal history entries are shown (privacy). Org is scoped via
 * the query param so cross-tenant data can't leak. Uses TanStack Query so
 * there's no manual effect/setState.
 */
export function TrackingPage() {
  const [params] = useSearchParams();
  const orgId = params.get('org') ?? '';
  const initialNo = params.get('no') ?? '';

  const [query, setQuery] = useState(initialNo);
  const [searchNo, setSearchNo] = useState(initialNo);

  const { data, isFetching, isFetched } = useQuery({
    queryKey: ['track', orgId, searchNo],
    enabled: !!orgId && !!searchNo.trim(),
    queryFn: async () => {
      repository.setScope(orgId, null);
      const [org, services] = await Promise.all([
        repository.getSingleton('organization'),
        repository.list('services'),
      ]);
      const service =
        services.find((s) => s.serviceNo.toLowerCase() === searchNo.trim().toLowerCase()) ?? null;
      return { org, service };
    },
  });

  const org = data?.org ?? null;
  const service = data?.service ?? null;
  const publicHistory = service?.history.filter((h) => !h.internal) ?? [];
  const notFound = isFetched && !isFetching && !service;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.logoMark}>
            <Icon name="screwdriver-wrench" aria-hidden />
          </span>
          <h1 className={styles.title}>{org?.name ?? 'FixMaster'}</h1>
          <p className={styles.subtitle}>Lacak Status Servis Anda</p>
        </header>

        <div className={styles.searchBox}>
          <input
            className={styles.input}
            placeholder="Masukkan no. servis (mis. FM-0001)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearchNo(query)}
          />
          <button className={styles.searchBtn} onClick={() => setSearchNo(query)} disabled={isFetching}>
            {isFetching ? <Icon name="circle-notch" className="spin" aria-hidden /> : 'Lacak'}
          </button>
        </div>

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
              <Badge tone={STATUS_TONE[service.status] as 'brand'} dot>
                {STATUS_LABELS[service.status]}
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
