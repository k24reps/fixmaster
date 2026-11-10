import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Icon, Input } from '@/components/ui';
import type { IconName } from '@/components/ui/Icon';
import { setQuoteRates } from '@/config/orgConfig';
import type { QuoteField, QuoteRates } from '@/data/types';
import { fmtPctInput, fmtRp, fmtRpInput, parsePctInput, parseRpInput } from '@/lib/format';
import { newId } from '@/lib/id';
import { interpolate } from '@/lib/business/notify';
import {
  QUOTE_FIELDS,
  QUOTE_LIMITS,
  quoteRatesIssues,
  quoteValue,
  sanitizeQuoteRates,
} from '@/lib/business/quote';
import { useT, type TranslationKey } from '@/i18n';
import { demoGuard } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import styles from './QuoteRatesTab.module.css';

/*
 * Pengaturan → Tarif: template chip untuk empat kolom Kalkulator Biaya. Satu
 * draf untuk seluruh tab karena keempat kartu adalah satu objek `quoteRates`:
 * menyimpan per kartu akan menimpa kartu lain dengan nilai lama. Angka
 * disimpan sebagai teks selama diedit supaya "12,5" dan "150.000" tidak
 * melompat saat diketik.
 */

interface ChipDraft {
  id: string;
  label: string;
  value: string;
}
interface PresetDraft {
  chips: ChipDraft[];
  defaultId: string | null;
}
type Draft = Record<QuoteField, PresetDraft>;

const FIELD_COPY: Record<
  QuoteField,
  { icon: IconName; title: TranslationKey; hint: TranslationKey; placeholder: TranslationKey; sample: string }
> = {
  ongkir: {
    icon: 'box-open',
    title: 'quoteRates.ongkirTitle',
    hint: 'quoteRates.ongkirHint',
    placeholder: 'quoteRates.ongkirPlaceholder',
    sample: '15.000',
  },
  jasa: {
    icon: 'screwdriver-wrench',
    title: 'quoteRates.jasaTitle',
    hint: 'quoteRates.jasaHint',
    placeholder: 'quoteRates.jasaPlaceholder',
    sample: '150.000',
  },
  coverPct: {
    icon: 'shield-halved',
    title: 'quoteRates.coverTitle',
    hint: 'quoteRates.coverHint',
    placeholder: 'quoteRates.coverPlaceholder',
    sample: '10',
  },
  targetProfit: {
    icon: 'bullseye',
    title: 'quoteRates.profitTitle',
    hint: 'quoteRates.profitHint',
    placeholder: 'quoteRates.profitPlaceholder',
    sample: '100.000',
  },
};

const isPct = (field: QuoteField) => field === 'coverPct';
const valueText = (field: QuoteField, n: number) =>
  isPct(field) ? String(n).replace('.', ',') : fmtRpInput(String(n));
const parseValue = (field: QuoteField, s: string) =>
  quoteValue(field, isPct(field) ? parsePctInput(s) : parseRpInput(s));

/** Mengikuti urutan QUOTE_FIELDS = urutan kunci sanitizeQuoteRates. */
function byField<T>(make: (field: QuoteField) => T): Record<QuoteField, T> {
  return Object.fromEntries(QUOTE_FIELDS.map((f) => [f, make(f)])) as Record<QuoteField, T>;
}

function toDraft(r: QuoteRates): Draft {
  return byField((field) => ({
    chips: r[field].chips.map((c) => ({ id: c.id, label: c.label, value: valueText(field, c.value) })),
    defaultId: r[field].defaultId,
  }));
}

// Urutan kunci sengaja sama dengan sanitizeQuoteRates: draf dibandingkan
// dengan nilai tersimpan lewat JSON.stringify untuk tahu ada perubahan.
function fromDraft(d: Draft): QuoteRates {
  return byField((field) => ({
    chips: d[field].chips.map((c) => ({
      id: c.id,
      label: c.label.trim(),
      value: parseValue(field, c.value),
    })),
    defaultId: d[field].defaultId,
  }));
}

/** Saklar panel: LED + nilai (Lit-Signal Rule). */
function LedSwitch({
  on,
  label,
  onLabel,
  offLabel,
  ariaLabel,
  onToggle,
}: {
  on: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={styles.switch}
      data-on={on}
      onClick={onToggle}
    >
      <span className={styles.switchLed} aria-hidden />
      <span>{label}</span>
      <span className={styles.switchState}>{on ? onLabel : offLabel}</span>
    </button>
  );
}

export function QuoteRatesTab() {
  const stored = useSessionStore((s) => s.org?.settings?.quoteRates);
  const current = useMemo(() => sanitizeQuoteRates(stored), [stored]);
  // Draf dibuat ulang hanya bila nilai tersimpan berubah dari luar (simpan,
  // perangkat lain), bukan setiap render.
  return <QuoteRatesEditor key={JSON.stringify(current)} current={current} />;
}

function QuoteRatesEditor({ current }: { current: QuoteRates }) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(() => toDraft(current));
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);

  const next = useMemo(() => fromDraft(draft), [draft]);
  const duplicates = useMemo(() => quoteRatesIssues(next), [next]);
  // Kolom nilai kosong tersimpan sebagai 0 tanpa disadari; "0" yang diketik boleh.
  const blanks = QUOTE_FIELDS.flatMap((field) =>
    draft[field].chips.flatMap((c, index) => (c.value.trim() === '' ? [{ field, index }] : [])),
  );
  const issueCount = duplicates.length + blanks.length;
  const dirty = JSON.stringify(next) !== JSON.stringify(current);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patchPreset = (field: QuoteField, change: (p: PresetDraft) => PresetDraft) =>
    setDraft((d) => ({ ...d, [field]: change(d[field]) }));
  const patchChip = (field: QuoteField, index: number, change: Partial<ChipDraft>) =>
    patchPreset(field, (p) => ({
      ...p,
      chips: p.chips.map((c, i) => (i === index ? { ...c, ...change } : c)),
    }));

  const save = async () => {
    if (demoGuard()) return;
    if (issueCount > 0) {
      setShowIssues(true);
      toast.warning(t('quoteRates.fixIssues'));
      return;
    }
    setBusy(true);
    try {
      await setQuoteRates(next);
      toast.success(t('quoteRates.saved'));
    } catch {
      toast.error(t('quoteRates.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const chipName = (field: QuoteField, chip: ChipDraft) =>
    chip.label.trim() ||
    (isPct(field) ? `${chip.value || '0'}%` : fmtRp(parseRpInput(chip.value)));

  return (
    <>
      <p className={styles.intro}>{t('quoteRates.intro')}</p>

      {QUOTE_FIELDS.map((field) => {
        const copy = FIELD_COPY[field];
        const preset = draft[field];
        const title = t(copy.title);
        return (
          <Card key={field}>
            <CardHeader icon={<Icon name={copy.icon} aria-hidden />} title={title} />
            <CardBody>
              <p className={styles.hint}>{t(copy.hint)}</p>
              {preset.chips.length === 0 ? (
                <p className={styles.empty}>{t('quoteRates.empty')}</p>
              ) : (
                <ul className={styles.chipList}>
                  {preset.chips.map((chip, index) => {
                    const duplicate =
                      showIssues && duplicates.some((i) => i.field === field && i.index === index);
                    const blank = showIssues && blanks.some((i) => i.field === field && i.index === index);
                    const on = preset.defaultId === chip.id;
                    const name = chipName(field, chip);
                    return (
                      <li key={chip.id} className={styles.chipRow}>
                        <Input
                          label={t('quoteRates.chipLabel')}
                          value={chip.label}
                          maxLength={QUOTE_LIMITS.label}
                          placeholder={t(copy.placeholder)}
                          error={duplicate ? t('quoteRates.duplicate') : undefined}
                          onChange={(e) => patchChip(field, index, { label: e.target.value })}
                        />
                        <Input
                          label={isPct(field) ? t('quoteRates.valuePct') : t('quoteRates.valueRp')}
                          inputMode={isPct(field) ? 'decimal' : 'numeric'}
                          className={styles.num}
                          value={chip.value}
                          placeholder={copy.sample}
                          error={blank ? t('quoteRates.valueMissing') : undefined}
                          onChange={(e) =>
                            patchChip(field, index, {
                              value: isPct(field) ? fmtPctInput(e.target.value) : fmtRpInput(e.target.value),
                            })
                          }
                          // Di atas 100% dipotong saat kolom ditinggalkan, bukan diam-diam saat disimpan.
                          onBlur={(e) =>
                            isPct(field) &&
                            parsePctInput(e.target.value) > 100 &&
                            patchChip(field, index, { value: '100' })
                          }
                        />
                        <div className={[styles.bare, styles.autoCell].join(' ')}>
                          <LedSwitch
                            on={on}
                            label={t('quoteRates.auto')}
                            onLabel={t('quoteRates.yes')}
                            offLabel={t('quoteRates.no')}
                            ariaLabel={interpolate(t('quoteRates.autoAria'), { name })}
                            onToggle={() =>
                              patchPreset(field, (p) => ({ ...p, defaultId: on ? null : chip.id }))
                            }
                          />
                        </div>
                        <div className={[styles.bare, styles.removeCell].join(' ')}>
                          <button
                            type="button"
                            className={styles.remove}
                            aria-label={interpolate(t('quoteRates.removeChip'), { name })}
                            title={t('common.delete')}
                            onClick={() =>
                              patchPreset(field, (p) => ({
                                chips: p.chips.filter((_, i) => i !== index),
                                defaultId: on ? null : p.defaultId,
                              }))
                            }
                          >
                            <Icon name="trash" aria-hidden />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button
                variant="secondary"
                iconLeft={<Icon name="plus" aria-hidden />}
                disabled={preset.chips.length >= QUOTE_LIMITS.chips}
                onClick={() =>
                  patchPreset(field, (p) => ({
                    ...p,
                    chips: [...p.chips, { id: newId(), label: '', value: '' }],
                  }))
                }
              >
                {interpolate(t('quoteRates.addChip'), { field: title })}
              </Button>
            </CardBody>
          </Card>
        );
      })}

      <div className={styles.bar} data-dirty={dirty}>
        <span className={styles.barState}>
          <span className={styles.barLed} aria-hidden />
          {dirty ? t('quoteRates.unsaved') : t('quoteRates.upToDate')}
        </span>
        <Link to="/calculator" className={styles.barLink}>
          {t('quoteRates.openCalculator')}
        </Link>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(toDraft(current));
              setShowIssues(false);
            }}
          >
            {t('quoteRates.discard')}
          </Button>
        )}
        <Button onClick={() => void save()} loading={busy} disabled={!dirty}>
          {t('quoteRates.save')}
        </Button>
      </div>
    </>
  );
}
