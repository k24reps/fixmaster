import { Icon } from './Icon';
import { CATALOG_VIEWS, type CatalogView } from './catalogView';
import styles from './CatalogControls.module.css';

/** Tombol pilihan tampilan katalog: Kartu / Daftar / Ringkas. */
export function ViewToggle({
  value,
  onChange,
  label,
}: {
  value: CatalogView;
  onChange: (view: CatalogView) => void;
  label: string;
}) {
  return (
    <div className={styles.viewToggle} role="group" aria-label={label}>
      {CATALOG_VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={[styles.viewBtn, value === v.id ? styles.viewActive : ''].join(' ')}
          onClick={() => onChange(v.id)}
          aria-pressed={value === v.id}
          aria-label={v.label}
          title={v.label}
        >
          <Icon name={v.icon} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/**
 * Chip kategori beserta jumlahnya. Satu kategori saja tidak butuh pilihan.
 * `labelOf` untuk id yang bukan teks tampil (mis. status 'pengerjaan').
 */
export function CategoryChips({
  categories,
  total,
  value,
  onChange,
  label,
  labelOf,
}: {
  categories: [string, number][];
  total: number;
  value: string;
  onChange: (category: string) => void;
  label: string;
  labelOf?: (id: string) => string;
}) {
  if (categories.length < 2) return null;
  const chip = (id: string, text: string, count: number) => (
    <button
      key={id}
      type="button"
      className={[styles.chip, value === id ? styles.chipActive : ''].join(' ')}
      aria-pressed={value === id}
      onClick={() => onChange(id)}
    >
      {text} <span className={styles.chipCount}>{count}</span>
    </button>
  );
  return (
    <div className={styles.categoryBar} role="group" aria-label={label}>
      {chip('all', 'Semua', total)}
      {categories.map(([name, count]) => chip(name, labelOf ? labelOf(name) : name, count))}
    </div>
  );
}
