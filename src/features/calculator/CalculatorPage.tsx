import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, Icon, Input } from '@/components/ui';
import { EmptyValue } from '@/components/ui/EmptyValue';
import { isManager, roleAllows } from '@/config/plans';
import type { QuoteChip, QuoteField, QuoteRates } from '@/data/types';
import { useT, type TranslationKey } from '@/i18n';
import { fmtPctInput, fmtPercent, fmtRp, fmtRpInput, parsePctInput, parseRpInput } from '@/lib/format';
import { interpolate } from '@/lib/business/notify';
import { QUOTE_FIELDS, computeQuote, quoteDefaults, sanitizeQuoteRates } from '@/lib/business/quote';
import { useSessionStore } from '@/stores/session';
import styles from './CalculatorPage.module.css';

/*
 * Kalkulator Biaya: lima kolom sheet price list (modal, ongkir/waste, jasa
 * pasang, cover garansi, target profit) → harga rekomendasi. Empat kolom
 * terakhir punya template chip dari Pengaturan → Tarif; modal selalu diketik.
 */

interface Entry {
  text: string;
  /** Chip yang terakhir diketuk. Menyala hanya selama nilainya belum diubah. */
  chipId: string | null;
}
type Entries = Record<QuoteField, Entry>;

const LABEL: Record<QuoteField, TranslationKey> = {
  ongkir: 'quote.ongkir',
  jasa: 'quote.jasa',
  coverPct: 'quote.coverPct',
  targetProfit: 'quote.targetProfit',
};
const SAMPLE: Record<QuoteField, string> = {
  ongkir: '30.000',
  jasa: '150.000',
  coverPct: '10',
  targetProfit: '150.000',
};

const isPct = (field: QuoteField) => field === 'coverPct';
const pctText = (n: number) => String(n).replace('.', ',');
const valueText = (field: QuoteField, n: number) => (isPct(field) ? pctText(n) : fmtRpInput(String(n)));
const parseValue = (field: QuoteField, text: string) =>
  isPct(field) ? parsePctInput(text) : parseRpInput(text);

function initialEntries(rates: QuoteRates): Entries {
  const defaults = quoteDefaults(rates);
  return Object.fromEntries(
    QUOTE_FIELDS.map((field) => {
      const { chipId, value } = defaults[field];
      return [field, { text: chipId ? valueText(field, value) : '', chipId }];
    }),
  ) as Entries;
}

export function CalculatorPage() {
  const me = useSessionStore((s) => s.currentEmployee);
  const stored = useSessionStore((s) => s.org?.settings?.quoteRates);
  const rates = useMemo(() => sanitizeQuoteRates(stored), [stored]);
  const owner = me ? roleAllows(me.role, '*') : false;
  const manager = me ? isManager(me.role) : false;
  // Template yang berubah saat halaman terbuka tidak menghapus hitungan yang
  // sedang diketik: chip yang hilang cukup padam, default baru dipakai saat
  // "Mulai ulang".
  return <Calculator rates={rates} owner={owner} manager={manager} />;
}

function Calculator({ rates, owner, manager }: { rates: QuoteRates; owner: boolean; manager: boolean }) {
  const t = useT();
  const [modal, setModal] = useState('');
  const [entries, setEntries] = useState<Entries>(() => initialEntries(rates));
  const tapeRef = useRef<HTMLDivElement>(null);

  const value = (field: QuoteField) => parseValue(field, entries[field].text);
  const result = computeQuote({
    modal: parseRpInput(modal),
    ongkir: value('ongkir'),
    jasa: value('jasa'),
    coverPct: value('coverPct'),
    targetProfit: value('targetProfit'),
  });

  const setEntry = (field: QuoteField, entry: Entry) => setEntries((e) => ({ ...e, [field]: entry }));
  const activeChip = (field: QuoteField): QuoteChip | undefined => {
    const chip = rates[field].chips.find((c) => c.id === entries[field].chipId);
    return chip && chip.value === value(field) ? chip : undefined;
  };

  const reset = () => {
    setModal('');
    setEntries(initialEntries(rates));
  };

  const noChips = QUOTE_FIELDS.every((field) => rates[field].chips.length === 0);
  const priceText = fmtRp(result.price);

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <Card>
          <CardHeader icon={<Icon name="calculator" aria-hidden />} title={t('quote.title')} />
          <CardBody>
            {noChips && owner && (
              <p className={styles.setup}>
                {t('quote.noChips')}{' '}
                <Link to="/settings?tab=tarif" className={styles.setupLink}>
                  {t('quote.noChipsAction')}
                </Link>
              </p>
            )}
            <ol className={styles.fields}>
              <li className={styles.field}>
                <Input
                  label={t('quote.modal')}
                  inputMode="numeric"
                  className={styles.num}
                  value={modal}
                  placeholder="680.000"
                  onChange={(e) => setModal(fmtRpInput(e.target.value))}
                />
                <div className={styles.side}>
                  <p className={styles.sideHint}>{t('quote.modalHint')}</p>
                </div>
              </li>
              {QUOTE_FIELDS.map((field) => {
                const chips = rates[field].chips;
                const label = t(LABEL[field]);
                const active = activeChip(field);
                return (
                  <li key={field} className={styles.field}>
                    <Input
                      label={label}
                      inputMode={isPct(field) ? 'decimal' : 'numeric'}
                      className={styles.num}
                      value={entries[field].text}
                      placeholder={chips.length > 0 ? '0' : SAMPLE[field]}
                      onChange={(e) =>
                        setEntry(field, {
                          text: isPct(field) ? fmtPctInput(e.target.value) : fmtRpInput(e.target.value),
                          chipId: entries[field].chipId,
                        })
                      }
                      onBlur={(e) =>
                        isPct(field) &&
                        parsePctInput(e.target.value) > 100 &&
                        setEntry(field, { text: '100', chipId: entries[field].chipId })
                      }
                    />
                    {chips.length > 0 && (
                      <div className={styles.side}>
                        <div
                          className={styles.chips}
                          role="group"
                          aria-label={interpolate(t('quote.chipsAria'), { field: label })}
                        >
                          {chips.map((chip) => {
                            const on = active?.id === chip.id;
                            const amount = isPct(field) ? `${pctText(chip.value)}%` : fmtRp(chip.value);
                            return (
                              <button
                                key={chip.id}
                                type="button"
                                className={styles.chip}
                                aria-pressed={on}
                                onClick={() =>
                                  setEntry(
                                    field,
                                    on
                                      ? { text: '', chipId: null }
                                      : { text: valueText(field, chip.value), chipId: chip.id },
                                  )
                                }
                              >
                                <span className={styles.chipLed} aria-hidden />
                                {chip.label && <span className={styles.chipName}>{chip.label}</span>}
                                <span className={styles.chipValue}>{amount}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>

        {/* Bukan <section>: di layar sempit wadah ini display:contents supaya
            LCD bisa menempel di bawah layar sepanjang kolom isian. */}
        <div className={styles.quote}>
          <div className={styles.register}>
            {/* Sempit: pita yang menempel jadi tombol ke struk, seperti dok
                keranjang Kasir. Di dua kolom CSS menyembunyikannya. */}
            <button
              type="button"
              className={styles.jump}
              aria-label={t('quote.jumpToTape')}
              onClick={() => {
                // CSS reduced-motion global tidak menjangkau gulir dari JS.
                const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                tapeRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
              }}
            />
            <div className={styles.registerTop}>
              <span className={styles.registerLabel}>
                {t('quote.priceLabel')}
                <Icon name="arrow-down" className={styles.jumpCue} aria-hidden />
              </span>
            </div>
            <div className={styles.lcd} style={{ '--lcd-chars': priceText.length } as CSSProperties}>
              {priceText}
            </div>
          </div>

          <div className={styles.tape} ref={tapeRef}>
            <ul className={styles.lines}>
              <li className={styles.line}>
                <span className={styles.lineName}>{t('quote.lineSubtotal')}</span>
                <span className={styles.lineAmount}>{fmtRp(result.subtotal)}</span>
              </li>
              <li className={styles.line}>
                <span className={styles.lineName}>
                  {interpolate(t('quote.lineCover'), { pct: pctText(result.coverPct) })}
                </span>
                <span className={styles.lineAmount}>{fmtRp(result.cover)}</span>
              </li>
              <li className={styles.line}>
                <span className={styles.lineName}>{t('quote.lineJasa')}</span>
                <span className={styles.lineAmount}>{fmtRp(result.jasa)}</span>
              </li>
              <li className={styles.line}>
                <span className={styles.lineName}>{t('quote.lineTarget')}</span>
                <span className={styles.lineAmount}>{fmtRp(result.targetProfit)}</span>
              </li>
              <li className={[styles.line, styles.lineTotal].join(' ')}>
                <span className={styles.lineName}>{t('quote.linePrice')}</span>
                <span className={styles.lineAmount}>{priceText}</span>
              </li>
            </ul>

            <div className={styles.actions}>
              <Button variant="ghost" iconLeft={<Icon name="arrows-rotate" aria-hidden />} onClick={reset}>
                {t('quote.reset')}
              </Button>
            </div>

            {manager && (
              <div className={styles.owner}>
                <p className={styles.ownerTitle}>
                  <Icon name="eye" aria-hidden />
                  {t('quote.ownerTitle')}
                </p>
                <dl className={styles.ownerGrid}>
                  <dt>{t('quote.ownerProfit')}</dt>
                  <dd data-tone={result.profit > 0 ? 'gain' : 'flat'}>{fmtRp(result.profit)}</dd>
                  <dt>{t('quote.ownerMarkup')}</dt>
                  <dd data-tone={result.profit > 0 ? 'gain' : 'flat'}>
                    {result.markup === null ? <EmptyValue /> : fmtPercent(result.markup, 1)}
                  </dd>
                </dl>
                <p className={styles.ownerNote}>{t('quote.ownerNote')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
