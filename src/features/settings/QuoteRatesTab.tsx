import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Icon, Input, Select, Textarea } from '@/components/ui';
import { getCategories, setQuoteRates } from '@/config/orgConfig';
import type { QuoteExtra, QuoteRates, QuoteRounding } from '@/data/types';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { newId } from '@/lib/id';
import { interpolate } from '@/lib/business/notify';
import {
  QUOTE_LIMITS,
  QUOTE_ROUNDING_STEPS,
  quoteRatesIssues,
  sanitizeQuoteRates,
  sellsPartsAtCost,
  type QuoteRatesIssue,
} from '@/lib/business/quote';
import { useT } from '@/i18n';
import { demoGuard } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import styles from './QuoteRatesTab.module.css';

/*
 * Pengaturan → Tarif. Satu draf untuk seluruh tab karena keempat kartu adalah
 * satu objek `quoteRates`: menyimpan per kartu akan menimpa kartu lain dengan
 * nilai lama. Angka disimpan sebagai teks selama diedit supaya "0,7" dan
 * "150.000" tidak melompat saat diketik.
 */

interface TierDraft {
  id: string;
  name: string;
  note: string;
  labor: string;
  byCategory: Record<string, string>;
  warrantyPct: string;
  highRisk: boolean;
  /** Kosong = pakai DP bawaan. */
  riskDpPct: string;
  riskNote: string;
}

interface ExtraDraft {
  id: string;
  name: string;
  kind: QuoteExtra['kind'];
  amount: string;
  defaultOn: boolean;
}

interface Draft {
  tiers: TierDraft[];
  partMarkupPct: string;
  minPartProfit: string;
  extras: ExtraDraft[];
  rounding: QuoteRounding;
  dpPct: string;
}

const PCT_MAX = { warranty: 100, markup: 1000, dp: 100, extra: 100 } as const;

const rpText = (n: number) => fmtRpInput(String(n));
const pctText = (n: number) => String(n).replace('.', ',');

/** Angka dan satu koma desimal (titik diubah jadi koma), maksimal dua desimal. */
function cleanPct(raw: string): string {
  const s = raw.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '').slice(0, 2);
}

function parsePct(s: string): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Nilai di atas batas dipotong saat kolom ditinggalkan, bukan diam-diam saat disimpan. */
const clampPct = (s: string, max: number) => (parsePct(s) > max ? String(max) : s);

function toDraft(r: QuoteRates): Draft {
  return {
    tiers: r.tiers.map((t) => ({
      id: t.id,
      name: t.name,
      note: t.note,
      labor: rpText(t.labor),
      byCategory: Object.fromEntries(
        Object.entries(t.laborByCategory).map(([c, v]) => [c, rpText(v)]),
      ),
      warrantyPct: pctText(t.warrantyPct),
      highRisk: t.highRisk,
      riskDpPct: t.riskDpPct === null ? '' : pctText(t.riskDpPct),
      riskNote: t.riskNote,
    })),
    partMarkupPct: pctText(r.partMarkupPct),
    minPartProfit: rpText(r.minPartProfit),
    extras: r.extras.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      amount: e.kind === 'percent' ? pctText(e.amount) : rpText(e.amount),
      defaultOn: e.defaultOn,
    })),
    rounding: r.rounding,
    dpPct: pctText(r.dpPct),
  };
}

// Urutan kunci sengaja sama dengan sanitizeQuoteRates: draf dibandingkan
// dengan nilai tersimpan lewat JSON.stringify untuk tahu ada perubahan.
function fromDraft(d: Draft): QuoteRates {
  return {
    tiers: d.tiers.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      note: t.note.trim(),
      labor: parseRpInput(t.labor),
      laborByCategory: Object.fromEntries(
        Object.entries(t.byCategory)
          .filter(([, v]) => v.trim() !== '')
          .map(([c, v]) => [c, parseRpInput(v)]),
      ),
      warrantyPct: parsePct(t.warrantyPct),
      highRisk: t.highRisk,
      riskDpPct: t.riskDpPct.trim() === '' ? null : parsePct(t.riskDpPct),
      riskNote: t.riskNote.trim(),
    })),
    partMarkupPct: parsePct(d.partMarkupPct),
    minPartProfit: parseRpInput(d.minPartProfit),
    extras: d.extras.map((e) => ({
      id: e.id,
      name: e.name.trim(),
      kind: e.kind,
      amount: e.kind === 'percent' ? parsePct(e.amount) : parseRpInput(e.amount),
      defaultOn: e.defaultOn,
    })),
    rounding: d.rounding,
    dpPct: parsePct(d.dpPct),
  };
}

const blankTier = (): TierDraft => ({
  id: newId(),
  name: '',
  note: '',
  labor: '',
  byCategory: {},
  warrantyPct: '0',
  highRisk: false,
  riskDpPct: '',
  riskNote: '',
});

const blankExtra = (): ExtraDraft => ({
  id: newId(),
  name: '',
  kind: 'fixed',
  amount: '',
  defaultOn: false,
});

/** Saklar panel: LED + nilai (Lit-Signal Rule), nadanya mengikuti arti. */
function LedSwitch({
  on,
  label,
  onLabel,
  offLabel,
  tone,
  onToggle,
}: {
  on: boolean;
  label: string;
  onLabel: string;
  offLabel: string;
  tone: 'danger' | 'success';
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={styles.switch}
      data-on={on}
      data-tone={tone}
      onClick={onToggle}
    >
      <span className={styles.switchLed} aria-hidden />
      <span className={styles.switchLabel}>{label}</span>
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
  const deviceCategories = useSessionStore((s) => s.org?.settings?.deviceCategories);
  const [draft, setDraft] = useState<Draft>(() => toDraft(current));
  const [showIssues, setShowIssues] = useState(false);
  const [busy, setBusy] = useState(false);

  const next = useMemo(() => fromDraft(draft), [draft]);
  const issues = useMemo(() => quoteRatesIssues(next), [next]);
  const dirty = JSON.stringify(next) !== JSON.stringify(current);

  // Kategori yang sudah dihapus dari daftar tetap tampil bila masih punya
  // tarif khusus, supaya bisa dikosongkan.
  const categories = useMemo(() => {
    void deviceCategories;
    const list = getCategories();
    const extra = draft.tiers.flatMap((tier) => Object.keys(tier.byCategory));
    return [...list, ...extra.filter((c) => !list.includes(c))].filter(
      (c, i, all) => all.indexOf(c) === i,
    );
  }, [deviceCategories, draft.tiers]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const has = (code: QuoteRatesIssue['code'], index: number) =>
    showIssues && issues.some((i) => i.code === code && i.index === index);

  const patchTier = (index: number, change: Partial<TierDraft>) =>
    setDraft((d) => ({
      ...d,
      tiers: d.tiers.map((tier, i) => (i === index ? { ...tier, ...change } : tier)),
    }));
  const patchExtra = (index: number, change: Partial<ExtraDraft>) =>
    setDraft((d) => ({
      ...d,
      extras: d.extras.map((extra, i) => (i === index ? { ...extra, ...change } : extra)),
    }));

  const save = async () => {
    if (demoGuard()) return;
    if (issues.length > 0) {
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

  const defaultDp = parsePct(draft.dpPct);
  const atCost = sellsPartsAtCost(next);
  const tierError = (index: number) =>
    has('tierName', index)
      ? t('quoteRates.tierNameMissing')
      : has('tierDuplicate', index)
        ? t('quoteRates.tierNameDuplicate')
        : undefined;

  return (
    <>
      <Card>
        <CardHeader
          icon={<Icon name="list-check" aria-hidden />}
          title={t('quoteRates.tiersTitle')}
        />
        <CardBody>
          <p className={styles.hint}>{t('quoteRates.tiersHint')}</p>
          {draft.tiers.length === 0 && (
            <p className={styles.emptyTiers}>{t('quoteRates.tiersEmpty')}</p>
          )}
          <ol className={styles.tierList}>
            {draft.tiers.map((tier, index) => {
              const overrides = Object.values(tier.byCategory).filter((v) => v.trim() !== '').length;
              const riskNoteError = has('riskNote', index);
              return (
                <li key={tier.id} className={styles.tier} data-risk={tier.highRisk}>
                  <div className={styles.tierHead}>
                    <Input
                      label={t('quoteRates.tierName')}
                      value={tier.name}
                      maxLength={QUOTE_LIMITS.name}
                      placeholder={t('quoteRates.tierNamePlaceholder')}
                      error={tierError(index)}
                      onChange={(e) => patchTier(index, { name: e.target.value })}
                    />
                    <Input
                      label={t('quoteRates.labor')}
                      inputMode="numeric"
                      value={tier.labor}
                      placeholder="150.000"
                      onChange={(e) => patchTier(index, { labor: fmtRpInput(e.target.value) })}
                    />
                    <Input
                      label={t('quoteRates.warrantyPct')}
                      inputMode="decimal"
                      value={tier.warrantyPct}
                      onChange={(e) => patchTier(index, { warrantyPct: cleanPct(e.target.value) })}
                      onBlur={(e) =>
                        patchTier(index, { warrantyPct: clampPct(e.target.value, PCT_MAX.warranty) })
                      }
                    />
                    <div className={[styles.bare, styles.removeCell].join(' ')}>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={interpolate(t('quoteRates.removeTier'), {
                          name: tier.name.trim() || t('quoteRates.untitled'),
                        })}
                        title={t('common.delete')}
                        onClick={() =>
                          setDraft((d) => ({ ...d, tiers: d.tiers.filter((_, i) => i !== index) }))
                        }
                      >
                        <Icon name="trash" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <Input
                    label={t('quoteRates.tierNote')}
                    value={tier.note}
                    maxLength={QUOTE_LIMITS.note}
                    placeholder={t('quoteRates.tierNotePlaceholder')}
                    onChange={(e) => patchTier(index, { note: e.target.value })}
                  />

                  {categories.length > 0 && (
                    <details className={styles.override}>
                      <summary>
                        <Icon name="chevron-right" className={styles.caret} aria-hidden />
                        {t('quoteRates.byCategory')}
                        <span className={styles.overrideCount}>
                          {overrides > 0
                            ? interpolate(t('quoteRates.byCategoryCount'), { n: String(overrides) })
                            : t('quoteRates.byCategoryNone')}
                        </span>
                      </summary>
                      <p className={styles.hint}>{t('quoteRates.byCategoryHint')}</p>
                      <div className={styles.catGrid}>
                        {categories.map((category) => (
                          <Input
                            key={category}
                            label={category}
                            inputMode="numeric"
                            value={tier.byCategory[category] ?? ''}
                            placeholder={tier.labor || '0'}
                            onChange={(e) =>
                              patchTier(index, {
                                byCategory: {
                                  ...tier.byCategory,
                                  [category]: fmtRpInput(e.target.value),
                                },
                              })
                            }
                          />
                        ))}
                      </div>
                    </details>
                  )}

                  <div className={styles.riskRow}>
                    <LedSwitch
                      on={tier.highRisk}
                      tone="danger"
                      label={t('quoteRates.highRisk')}
                      onLabel={t('quoteRates.yes')}
                      offLabel={t('quoteRates.no')}
                      onToggle={() => patchTier(index, { highRisk: !tier.highRisk })}
                    />
                    {!tier.highRisk && (
                      <span className={styles.riskHint}>{t('quoteRates.highRiskHint')}</span>
                    )}
                  </div>
                  {tier.highRisk && (
                    <div className={styles.riskFields}>
                      <Input
                        label={t('quoteRates.riskDp')}
                        inputMode="decimal"
                        value={tier.riskDpPct}
                        placeholder={pctText(defaultDp)}
                        hint={interpolate(t('quoteRates.riskDpHint'), { pct: pctText(defaultDp) })}
                        onChange={(e) => patchTier(index, { riskDpPct: cleanPct(e.target.value) })}
                        onBlur={(e) =>
                          patchTier(index, { riskDpPct: clampPct(e.target.value, PCT_MAX.dp) })
                        }
                      />
                      <Textarea
                        label={t('quoteRates.riskNote')}
                        rows={2}
                        value={tier.riskNote}
                        maxLength={QUOTE_LIMITS.riskNote}
                        placeholder={t('quoteRates.riskNotePlaceholder')}
                        error={riskNoteError ? t('quoteRates.riskNoteMissing') : undefined}
                        hint={t('quoteRates.riskNoteHint')}
                        onChange={(e) => patchTier(index, { riskNote: e.target.value })}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <Button
            variant="secondary"
            iconLeft={<Icon name="plus" aria-hidden />}
            disabled={draft.tiers.length >= QUOTE_LIMITS.tiers}
            onClick={() => setDraft((d) => ({ ...d, tiers: [...d.tiers, blankTier()] }))}
          >
            {t('quoteRates.addTier')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Icon name="box-open" aria-hidden />} title={t('quoteRates.partsTitle')} />
        <CardBody>
          <p className={styles.hint}>{t('quoteRates.partsHint')}</p>
          <div className={styles.pair}>
            <Input
              label={t('quoteRates.markup')}
              inputMode="decimal"
              value={draft.partMarkupPct}
              onChange={(e) => setDraft((d) => ({ ...d, partMarkupPct: cleanPct(e.target.value) }))}
              onBlur={(e) =>
                setDraft((d) => ({ ...d, partMarkupPct: clampPct(e.target.value, PCT_MAX.markup) }))
              }
            />
            <Input
              label={t('quoteRates.minProfit')}
              inputMode="numeric"
              value={draft.minPartProfit}
              placeholder="150.000"
              onChange={(e) => setDraft((d) => ({ ...d, minPartProfit: fmtRpInput(e.target.value) }))}
            />
          </div>
          {atCost && (
            <p className={styles.warn} role="status">
              <span className={styles.warnLed} aria-hidden />
              {t('quoteRates.atCostWarning')}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Icon name="receipt" aria-hidden />} title={t('quoteRates.extrasTitle')} />
        <CardBody>
          <p className={styles.hint}>{t('quoteRates.extrasHint')}</p>
          {draft.extras.length > 0 && (
            <ul className={styles.extraList}>
              {draft.extras.map((extra, index) => (
                <li key={extra.id} className={styles.extra}>
                  <Input
                    label={t('quoteRates.extraName')}
                    value={extra.name}
                    maxLength={QUOTE_LIMITS.name}
                    placeholder={t('quoteRates.extraNamePlaceholder')}
                    error={has('extraName', index) ? t('quoteRates.extraNameMissing') : undefined}
                    onChange={(e) => patchExtra(index, { name: e.target.value })}
                  />
                  <Select
                    label={t('quoteRates.extraKind')}
                    value={extra.kind}
                    onChange={(e) =>
                      patchExtra(index, {
                        kind: e.target.value as ExtraDraft['kind'],
                        amount: '',
                      })
                    }
                    options={[
                      { value: 'fixed', label: t('quoteRates.extraFixed') },
                      { value: 'percent', label: t('quoteRates.extraPercent') },
                    ]}
                  />
                  <Input
                    label={extra.kind === 'percent' ? t('quoteRates.extraPct') : t('quoteRates.extraRp')}
                    inputMode={extra.kind === 'percent' ? 'decimal' : 'numeric'}
                    value={extra.amount}
                    placeholder={extra.kind === 'percent' ? '0,7' : '30.000'}
                    onChange={(e) =>
                      patchExtra(index, {
                        amount:
                          extra.kind === 'percent'
                            ? cleanPct(e.target.value)
                            : fmtRpInput(e.target.value),
                      })
                    }
                    onBlur={(e) =>
                      extra.kind === 'percent' &&
                      patchExtra(index, { amount: clampPct(e.target.value, PCT_MAX.extra) })
                    }
                  />
                  <div className={[styles.bare, styles.defaultCell].join(' ')}>
                    <LedSwitch
                      on={extra.defaultOn}
                      tone="success"
                      label={t('quoteRates.extraDefault')}
                      onLabel={t('quoteRates.yes')}
                      offLabel={t('quoteRates.no')}
                      onToggle={() => patchExtra(index, { defaultOn: !extra.defaultOn })}
                    />
                  </div>
                  <div className={[styles.bare, styles.removeCell].join(' ')}>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={interpolate(t('quoteRates.removeExtra'), {
                        name: extra.name.trim() || t('quoteRates.untitled'),
                      })}
                      title={t('common.delete')}
                      onClick={() =>
                        setDraft((d) => ({ ...d, extras: d.extras.filter((_, i) => i !== index) }))
                      }
                    >
                      <Icon name="trash" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="secondary"
            iconLeft={<Icon name="plus" aria-hidden />}
            disabled={draft.extras.length >= QUOTE_LIMITS.extras}
            onClick={() => setDraft((d) => ({ ...d, extras: [...d.extras, blankExtra()] }))}
          >
            {t('quoteRates.addExtra')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={<Icon name="coins" aria-hidden />} title={t('quoteRates.roundingTitle')} />
        <CardBody>
          <p className={styles.hint}>{t('quoteRates.roundingHint')}</p>
          <div className={styles.seg} role="group" aria-label={t('quoteRates.rounding')}>
            {QUOTE_ROUNDING_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                className={styles.segBtn}
                aria-pressed={draft.rounding === step}
                onClick={() => setDraft((d) => ({ ...d, rounding: step }))}
              >
                {step === 0 ? t('quoteRates.roundNone') : fmtRp(step)}
              </button>
            ))}
          </div>
          <div className={styles.dpField}>
            <Input
              label={t('quoteRates.dp')}
              inputMode="decimal"
              value={draft.dpPct}
              hint={t('quoteRates.dpHint')}
              onChange={(e) => setDraft((d) => ({ ...d, dpPct: cleanPct(e.target.value) }))}
              onBlur={(e) => setDraft((d) => ({ ...d, dpPct: clampPct(e.target.value, PCT_MAX.dp) }))}
            />
          </div>
        </CardBody>
      </Card>

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
