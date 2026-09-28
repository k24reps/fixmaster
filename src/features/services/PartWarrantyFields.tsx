import { Input } from '@/components/ui';
import type { ServiceSparepart } from '@/data/types';
import styles from './PartWarrantyFields.module.css';
import { useT } from '@/i18n';
import { interpolate } from '@/lib/business/notify';

/** Pilihan cepat hari garansi. "Tanpa" = 0, supaya tanpa garansi selalu disengaja. */
export function WarrantyPresets({
  presets,
  onPick,
  what,
}: {
  presets: number[];
  onPick: (days: number) => void;
  what: string;
}) {
  const t = useT();
  return (
    <div className={styles.presetRow}>
      {[0, ...presets.filter((d) => d > 0)].map((d) => (
        <button
          key={d}
          type="button"
          className={styles.presetChip}
          onClick={() => onPick(d)}
          title={
            d === 0
              ? interpolate(t('partWarranty.noneTitle'), { what })
              : interpolate(t('partWarranty.daysTitle'), { what, n: String(d) })
          }
        >
          {d === 0 ? t('partWarranty.none') : interpolate(t('partWarranty.days'), { n: String(d) })}
        </button>
      ))}
    </div>
  );
}

/**
 * Garansi per sparepart (hari), untuk part dari stok maupun modal dadakan.
 * `values[i]` milik `parts[i]`; 0 = tanpa garansi. Dipakai form Selesai dan
 * modal "Garansi part" di detail servis.
 */
export function PartWarrantyFields({
  parts,
  values,
  onChange,
  presets,
}: {
  parts: ServiceSparepart[];
  values: string[];
  onChange: (index: number, value: string) => void;
  presets: number[];
}) {
  const t = useT();
  return (
    <div className={styles.list}>
      {parts.map((p, i) => (
        <div key={`${p.itemId ?? 'm'}-${i}`} className={styles.row}>
          <span className={styles.name} title={p.name}>
            {p.name}
            {p.kind === 'manual' ? '' : ` ×${p.qty}`}
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={values[i] ?? ''}
            onChange={(e) => onChange(i, e.target.value)}
            placeholder="0"
            aria-label={interpolate(t('partWarranty.fieldAria'), { name: p.name })}
          />
          <WarrantyPresets presets={presets} onPick={(d) => onChange(i, String(d))} what={p.name} />
        </div>
      ))}
    </div>
  );
}
