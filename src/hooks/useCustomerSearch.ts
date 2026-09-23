import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/data';
import type { Customer } from '@/data/types';

const NONE: Customer[] = [];

/**
 * Pelanggan yang cocok dengan kueri, ditanyakan ke SERVER.
 *
 * Menggantikan pola lama "muat seluruh tabel pelanggan lalu saring di klien",
 * yang membuat `customers` masuk `FULL_LIST` (menembus cap 1000 baris dengan
 * perulangan) dan dibayar tiap halaman yang punya kotak cari pelanggan.
 *
 * Bentuknya sengaja meniru `useServiceArchive`: tunda 300 ms, minimal 3 huruf,
 * kunci di bawah `['collection','customers',…]` supaya perubahan koleksi
 * mengenainya lewat `invalidateCollection`.
 *
 * Hasilnya SUPERSET — pemanggil tetap menyaring dengan `searchCustomers`,
 * sehingga aturan pencocokan hanya hidup di fungsi murni itu.
 *
 * Adapter lokal/demo tidak punya `queryCustomers`; di sana daftarnya sudah
 * lengkap di memori dan pemanggil memakai jalur mundurnya.
 */
export function useCustomerSearch(opts: { enabled: boolean; term: string }): Customer[] {
  // Pelanggan TIDAK outlet-scoped (lihat OUTLET_SCOPED di supabase-adapter),
  // jadi cabang aktif tidak ikut jadi kunci.
  const [term, setTerm] = useState(opts.term.trim());
  useEffect(() => {
    const timer = setTimeout(() => setTerm(opts.term.trim()), 300);
    return () => clearTimeout(timer);
  }, [opts.term]);

  const active = opts.enabled && !!repository.queryCustomers && term.length >= 3;

  const { data } = useQuery({
    queryKey: ['collection', 'customers', 'search', term],
    queryFn: () => repository.queryCustomers!({ term, limit: 50 }),
    enabled: active,
  });

  return active ? (data ?? NONE) : NONE;
}
