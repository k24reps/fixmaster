import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/data';
import { addDays, localDayStartISO } from '@/lib/time';
import { useSessionStore } from '@/stores/session';
import type { Service } from '@/data/types';

/** Batas baris PostgREST (max_rows) — daftar servis cloud sepanjang ini berarti terpotong. */
export const SERVICE_LIST_CAP = 1000;

const NONE: Service[] = [];

/**
 * Tiket di luar potongan terbaru yang dimuat daftar cloud. Server hanya
 * ditanya bila daftar memang terpotong (`enabled`) DAN pengguna mencari
 * (≥3 huruf, ditunda 300 ms) atau memilih rentang tanggal yang lebih tua.
 * Pemanggil menggabungkan hasilnya ke daftar. Adapter lokal/demo tidak
 * punya `queryServices` — daftarnya sudah lengkap.
 */
export function useServiceArchive(opts: {
  enabled: boolean;
  term: string;
  /** Tanggal lokal inklusif, atau null. */
  range: { from: string; to: string } | null;
}): Service[] {
  const outletId = useSessionStore((s) => s.activeOutletId);
  const [term, setTerm] = useState(opts.term.trim());
  useEffect(() => {
    const timer = setTimeout(() => setTerm(opts.term.trim()), 300);
    return () => clearTimeout(timer);
  }, [opts.term]);

  const from = opts.range ? localDayStartISO(opts.range.from) : '';
  const to = opts.range ? localDayStartISO(addDays(opts.range.to, 1)) : '';
  const active = opts.enabled && !!repository.queryServices && (term.length >= 3 || !!from);

  const { data } = useQuery({
    queryKey: ['collection', 'services', outletId, 'archive', term, from, to],
    queryFn: () =>
      repository.queryServices!({
        term: term.length >= 3 ? term : undefined,
        createdFrom: from || undefined,
        createdTo: to || undefined,
        limit: SERVICE_LIST_CAP,
      }),
    enabled: active,
  });
  return active ? (data ?? NONE) : NONE;
}
