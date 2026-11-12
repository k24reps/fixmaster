import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getServicePrintMeta, recordServicePrint } from '@/data/servicePrint';
import { useCollection } from '@/hooks/useCollection';
import { useServiceHistory } from '@/hooks/useServiceHistory';
import { trackingUrl } from '@/lib/business/notify';
import { isServiceReprint, serviceDocPlan } from '@/lib/business/receiptContent';
import { termsOf } from '@/lib/business/serviceTerms';
import { useSessionStore } from '@/stores/session';
import type { Service } from '@/data/types';
import { printServiceReceipt } from './printReceipt';

/**
 * Satu jalan cetak nota servis untuk semua tombolnya (bilah aksi tiket, modal
 * Notifikasi, panel selesai), plus satu alamat lacak untuk QR, salin, dan pesan
 * WhatsApp. Jejak cetak dimuat SEBELUM tombol ditekan karena `window.open`
 * harus terjadi sinkron di handler klik; menunggu RPC dulu membuat pemblokir
 * popup menolak jendelanya.
 *
 * Sebelum migrasi 0100 diterapkan RPC-nya belum ada: alamat jatuh ke bentuk lama
 * dan tak ada penanda CETAK ULANG. Tidak ada yang rusak.
 */
export function useServicePrint(service: Service | null) {
  const queryClient = useQueryClient();
  const org = useSessionStore((s) => s.org);
  const { data: outlets } = useCollection('outlets');
  const queryKey = ['service-print-meta', service?.id ?? ''];
  const { data: meta } = useQuery({
    queryKey,
    queryFn: () => (service ? getServicePrintMeta(service) : Promise.resolve(null)),
    enabled: !!service,
    // Satu baris kecil, dan perangkat lain bisa saja baru mencetak.
    staleTime: 0,
    // Sebelum 0100 RPC-nya belum ada; mengulang tiga kali hanya menunda.
    retry: false,
  });

  // S&K tiket ada di entri riwayat pertama. Riwayat cloud dimuat terpisah dari
  // daftar servis, dengan kunci kueri yang sama dengan linimasa detail tiket.
  const terms = termsOf(useServiceHistory(service));

  const trackCode = meta?.trackCode ?? null;
  const trackLink = service
    ? trackingUrl(window.location.origin, service.orgId, service.serviceNo, trackCode)
    : '';

  const print = () => {
    if (!service || !org) return;
    const plan = serviceDocPlan(service);
    const opened = printServiceReceipt(service, org, outlets, {
      trackCode,
      reprint: isServiceReprint(meta, plan),
      terms,
    });
    if (!opened) return;
    void recordServicePrint(service, plan.kind)
      .then((next) => {
        if (next) queryClient.setQueryData(queryKey, next);
      })
      .catch(() => {
        // Jejak cetak tak boleh menggagalkan cetakan yang sudah terbuka.
      });
  };

  return { trackCode, trackLink, print, canPrint: !!service && !!org };
}
