import { Input } from '@/components/ui';
import type { ServiceSparepart } from '@/data/types';
import styles from './PartWarrantyFields.module.css';

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
  return (
    <div className={styles.presetRow}>
      {[0, ...presets.filter((d) => d > 0)].map((d) => (
        <button
          key={d}
          type="button"
          className={styles.presetChip}
          onClick={() => onPick(d)}
          title={d === 0 ? `${what}: tanpa garansi` : `Garansi ${what} ${d} hari`}
        >
          {d === 0 ? 'Tanpa' : `${d} hari`}
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
            aria-label={`Garansi ${p.name} (hari)`}
          />
          <WarrantyPresets presets={presets} onPick={(d) => onChange(i, String(d))} what={p.name} />
        </div>
      ))}
    </div>
  );
}
