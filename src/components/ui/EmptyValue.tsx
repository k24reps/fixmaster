import { useT } from '@/i18n';
import { EMPTY_VALUE } from '@/lib/format';

/**
 * Isi sel yang memang kosong (belum ada teknisi, belum ada SKU, belum jam
 * keluar). Mata melihat tanda pisah pendek; pembaca layar mendengar "kosong",
 * bukan "en dash" atau diam yang membuat sel terdengar hilang.
 * Jangan dipakai untuk angka yang masih dimuat: itu bukan kosong, pakai
 * `EMPTY_VALUE` saja.
 */
export function EmptyValue() {
  const t = useT();
  return (
    <>
      <span aria-hidden="true">{EMPTY_VALUE}</span>
      <span className="fm-visually-hidden">{t('common.emptyValue')}</span>
    </>
  );
}
