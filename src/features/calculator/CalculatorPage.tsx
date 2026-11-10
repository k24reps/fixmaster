import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, CardHeader, EmptyState, Icon, Input, Select } from '@/components/ui';
import { EmptyValue } from '@/components/ui/EmptyValue';
import { getCategories } from '@/config/orgConfig';
import { isManager, roleAllows } from '@/config/plans';
import { useCollection } from '@/hooks/useCollection';
import { useT } from '@/i18n';
import { fmtPercent, fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { newId } from '@/lib/id';
import { interpolate } from '@/lib/business/notify';
import {
  computeQuote,
  sanitizeQuoteRates,
  type QuoteLine,
  type QuoteStockPart,
} from '@/lib/business/quote';
import type { QuoteRates } from '@/data/types';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import { quoteText } from './quoteText';
import styles from './CalculatorPage.module.css';

const SEARCH_LIMIT = 6;

interface CustomDraft {
  id: string;
  name: string;
  cost: string;
  qty: string;
}

const pctLabel = (n: number) => String(n).replace('.', ',');

export function CalculatorPage() {
  const me = useSessionStore((s) => s.currentEmployee);
  const stored = useSessionStore((s) => s.org?.settings?.quoteRates);
  const rates = useMemo(() => sanitizeQuoteRates(stored), [stored]);
  const owner = me ? roleAllows(me.role, '*') : false;
  const manager = me ? isManager(me.role) : false;

  if (rates.tiers.length === 0) return <RatesMissing owner={owner} />;
  return <Calculator rates={rates} manager={manager} />;
}

function RatesMissing({ owner }: { owner: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={<Icon name="calculator" aria-hidden />}
          title={t('quote.emptyTitle')}
          description={owner ? t('quote.emptyOwner') : t('quote.emptyStaff')}
          action={
            owner ? (
              <Button onClick={() => navigate('/settings?tab=tarif')}>{t('quote.emptyAction')}</Button>
            ) : undefined
          }
        />
      </CardBody>
    </Card>
  );
}

function Calculator({ rates, manager }: { rates: QuoteRates; manager: boolean }) {
  const t = useT();
  const deviceCategories = useSessionStore((s) => s.org?.settings?.deviceCategories);
  const categories = useMemo(() => {
    void deviceCategories;
    return getCategories();
  }, [deviceCategories]);
  const { data: inventory } = useCollection('inventory');

  const [category, setCategory] = useState('');
  const [tierId, setTierId] = useState(rates.tiers[0].id);
  const [stock, setStock] = useState<{ itemId: string; qty: number }[]>([]);
  const [custom, setCustom] = useState<CustomDraft[]>([]);
  const [extraPick, setExtraPick] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');

  // Tingkat yang dihapus pemilik saat halaman terbuka jatuh ke tingkat pertama.
  const tier = rates.tiers.find((x) => x.id === tierId) ?? rates.tiers[0];
  const itemById = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);

  const stockParts: QuoteStockPart[] = stock.flatMap((p) => {
    const item = itemById.get(p.itemId);
    return item
      ? [{ itemId: item.id, name: item.name, qty: p.qty, sellPrice: item.sellPrice, costPrice: item.costPrice }]
      : [];
  });
  const extraOn = (id: string, defaultOn: boolean) => extraPick[id] ?? defaultOn;
  const result = computeQuote({
    rates,
    tierId: tier.id,
    category,
    stockParts,
    customParts: custom.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      qty: Math.max(1, parseInt(p.qty, 10) || 1),
      cost: parseRpInput(p.cost),
    })),
    extraIds: rates.extras.filter((e) => extraOn(e.id, e.defaultOn)).map((e) => e.id),
  });

  const needle = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const taken = new Set(stock.map((p) => p.itemId));
    return inventory.filter(
      (i) =>
        !taken.has(i.id) &&
        (i.name.toLowerCase().includes(needle) || i.sku.toLowerCase().includes(needle)),
    );
  }, [inventory, needle, stock]);

  if (!result) return null;

  const lineLabel = (line: QuoteLine) => {
    if (line.kind === 'labor') return interpolate(t('quote.labor'), { tier: line.name });
    if (line.kind === 'extra')
      return line.pct !== undefined ? `${line.name} (${pctLabel(line.pct)}%)` : line.name;
    const name = line.name || t('quote.partFallback');
    return line.qty > 1 ? `${name} (${line.qty}×)` : name;
  };

  const dpLabel = interpolate(t('quote.dp'), { pct: pctLabel(result.dpPct) });
  const totalText = fmtRp(result.total);

  const copy = async () => {
    const text = quoteText(result, {
      title: t('quote.textTitle'),
      subtitle: [category, tier.name].filter(Boolean).join(' · '),
      lineLabel,
      totalLabel: t('quote.textTotal'),
      dpLabel,
      riskLabel: t('quote.textRisk'),
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('quote.copied'));
    } catch {
      toast.error(t('quote.copyFailed'));
    }
  };

  const reset = () => {
    setCategory('');
    setTierId(rates.tiers[0].id);
    setStock([]);
    setCustom([]);
    setExtraPick({});
    setQuery('');
  };

  const patchCustom = (id: string, change: Partial<CustomDraft>) =>
    setCustom((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const setStockQty = (itemId: string, qty: number) =>
    setStock((list) => list.map((p) => (p.itemId === itemId ? { ...p, qty: Math.max(1, qty) } : p)));

  const profitTone = result.profit < 0 ? 'loss' : result.profit > 0 ? 'gain' : 'flat';

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.inputs}>
          <Card>
            <CardHeader icon={<Icon name="wrench" aria-hidden />} title={t('quote.jobTitle')} />
            <CardBody>
              <div className={styles.jobGrid}>
                <Select
                  label={t('quote.tier')}
                  value={tier.id}
                  onChange={(e) => setTierId(e.target.value)}
                  options={rates.tiers.map((x) => ({ value: x.id, label: x.name }))}
                  hint={tier.note || undefined}
                />
                <Select
                  label={t('quote.category')}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t('quote.categoryAny')}
                  options={categories.map((c) => ({ value: c, label: c }))}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<Icon name="box-open" aria-hidden />} title={t('quote.partsTitle')} />
            <CardBody>
              <div className={styles.search}>
                <Input
                  type="search"
                  label={t('quote.stockSearch')}
                  placeholder={t('quote.stockSearchPlaceholder')}
                  iconLeft={<Icon name="magnifying-glass" aria-hidden />}
                  value={query}
                  noAutoCap
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                />
                {needle && (
                  <div className={styles.hits}>
                    {hits.length === 0 ? (
                      <p className={styles.hitsEmpty}>{t('quote.stockNone')}</p>
                    ) : (
                      <ul className={styles.hitList}>
                        {hits.slice(0, SEARCH_LIMIT).map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={styles.hit}
                              onClick={() => {
                                setStock((list) => [...list, { itemId: item.id, qty: 1 }]);
                                setQuery('');
                              }}
                            >
                              <Icon name="plus" className={styles.hitIcon} aria-hidden />
                              <span className={styles.hitText}>
                                <span className={styles.hitName}>{item.name}</span>
                                <span className={styles.hitMeta} data-out={item.stock <= 0}>
                                  {interpolate(t('quote.stockLeft'), { n: String(item.stock) })}
                                </span>
                              </span>
                              <span className={styles.hitPrice}>{fmtRp(item.sellPrice)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {hits.length > SEARCH_LIMIT && (
                      <p className={styles.hitsMore}>
                        {interpolate(t('quote.stockMore'), { n: String(hits.length - SEARCH_LIMIT) })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {stockParts.length === 0 && custom.length === 0 && (
                <p className={styles.hint}>{t('quote.partsEmpty')}</p>
              )}

              {stockParts.length > 0 && (
                <ul className={styles.partList} aria-label={t('quote.stockListAria')}>
                  {stockParts.map((part) => {
                    const item = itemById.get(part.itemId);
                    const short = item ? part.qty > item.stock : false;
                    return (
                      <li key={part.itemId} className={styles.stockRow}>
                        <span className={styles.partName}>
                          {part.name}
                          {short && item && (
                            <span className={styles.short}>
                              <span className={styles.shortLed} aria-hidden />
                              {interpolate(t('quote.stockShort'), { n: String(Math.max(0, item.stock)) })}
                            </span>
                          )}
                        </span>
                        <span className={styles.stepper}>
                          <button
                            type="button"
                            aria-label={interpolate(t('quote.qtyLess'), { name: part.name })}
                            disabled={part.qty <= 1}
                            onClick={() => setStockQty(part.itemId, part.qty - 1)}
                          >
                            <Icon name="minus" aria-hidden />
                          </button>
                          <span className={styles.qty}>
                            <span className="fm-visually-hidden">{t('quote.qty')} </span>
                            {part.qty}
                          </span>
                          <button
                            type="button"
                            aria-label={interpolate(t('quote.qtyMore'), { name: part.name })}
                            onClick={() => setStockQty(part.itemId, part.qty + 1)}
                          >
                            <Icon name="plus" aria-hidden />
                          </button>
                        </span>
                        <span className={styles.partAmount}>{fmtRp(part.qty * part.sellPrice)}</span>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={interpolate(t('quote.removePart'), { name: part.name })}
                          title={t('common.delete')}
                          onClick={() => setStock((list) => list.filter((p) => p.itemId !== part.itemId))}
                        >
                          <Icon name="times" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {custom.length > 0 && (
                <ul className={styles.partList} aria-label={t('quote.customListAria')}>
                  {custom.map((part) => (
                    <li key={part.id} className={styles.customRow}>
                      <Input
                        label={t('quote.customName')}
                        value={part.name}
                        placeholder={t('quote.customNamePlaceholder')}
                        onChange={(e) => patchCustom(part.id, { name: e.target.value })}
                      />
                      <Input
                        label={t('quote.customCost')}
                        inputMode="numeric"
                        value={part.cost}
                        placeholder="450.000"
                        onChange={(e) => patchCustom(part.id, { cost: fmtRpInput(e.target.value) })}
                      />
                      <Input
                        label={t('quote.qty')}
                        inputMode="numeric"
                        value={part.qty}
                        onChange={(e) => patchCustom(part.id, { qty: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                        onBlur={(e) => !e.target.value && patchCustom(part.id, { qty: '1' })}
                      />
                      <div className={styles.bare}>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={interpolate(t('quote.removePart'), {
                            name: part.name.trim() || t('quote.partFallback'),
                          })}
                          title={t('common.delete')}
                          onClick={() => setCustom((list) => list.filter((p) => p.id !== part.id))}
                        >
                          <Icon name="times" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className={styles.customFoot}>
                <Button
                  variant="secondary"
                  iconLeft={<Icon name="plus" aria-hidden />}
                  onClick={() => setCustom((list) => [...list, { id: newId(), name: '', cost: '', qty: '1' }])}
                >
                  {t('quote.customAdd')}
                </Button>
                <span className={styles.customHint}>{t('quote.customHint')}</span>
              </div>
            </CardBody>
          </Card>

          {rates.extras.length > 0 && (
            <Card>
              <CardHeader icon={<Icon name="receipt" aria-hidden />} title={t('quote.extrasTitle')} />
              <CardBody>
                <ul className={styles.extraList}>
                  {rates.extras.map((extra) => (
                    <li key={extra.id}>
                      <label className={styles.extra}>
                        <input
                          type="checkbox"
                          checked={extraOn(extra.id, extra.defaultOn)}
                          onChange={(e) => setExtraPick((p) => ({ ...p, [extra.id]: e.target.checked }))}
                        />
                        <span className={styles.extraName}>{extra.name}</span>
                        <span className={styles.extraAmount}>
                          {extra.kind === 'percent' ? `${pctLabel(extra.amount)}%` : fmtRp(extra.amount)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Bukan <section>: di layar sempit wadah ini display:contents supaya
            LCD bisa menempel di bawah layar sepanjang kolom isian. */}
        <div className={styles.quote}>
          <div className={styles.register}>
            <div className={styles.registerTop}>
              <span>{t('quote.totalLabel')}</span>
              {result.highRisk && (
                <span className={styles.riskTag}>
                  <span className={styles.riskTagLed} aria-hidden />
                  {t('quote.riskTag')}
                </span>
              )}
            </div>
            <div className={styles.lcd} style={{ '--lcd-chars': totalText.length } as CSSProperties}>
              {totalText}
            </div>
            <div className={styles.lcdSub}>
              <span>{dpLabel}</span>
              <span>{fmtRp(result.dp)}</span>
            </div>
          </div>

          <div className={styles.tape}>
            {result.highRisk && (
              <div className={styles.risk} role="note">
                <span className={styles.riskLed} aria-hidden />
                <div>
                  <p className={styles.riskTitle}>{t('quote.riskTitle')}</p>
                  {result.riskNote && <p className={styles.riskNote}>{result.riskNote}</p>}
                </div>
              </div>
            )}

            <ul className={styles.lines}>
              {result.lines.map((line) => (
                <li key={`${line.kind}-${line.ref}`} className={styles.line} data-kind={line.kind}>
                  <span className={styles.lineName}>{lineLabel(line)}</span>
                  <span className={styles.lineAmount}>{fmtRp(line.amount)}</span>
                </li>
              ))}
              <li className={[styles.line, styles.lineTotal].join(' ')}>
                <span className={styles.lineName}>{t('quote.textTotal')}</span>
                <span className={styles.lineAmount}>{totalText}</span>
              </li>
            </ul>
            {result.dpRaised && <p className={styles.dpNote}>{t('quote.dpRaised')}</p>}

            <div className={styles.actions}>
              <Button
                variant="secondary"
                iconLeft={<Icon name="copy" aria-hidden />}
                onClick={() => void copy()}
              >
                {t('quote.copy')}
              </Button>
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
                  <dt>{t('quote.ownerCost')}</dt>
                  <dd>{fmtRp(result.cost)}</dd>
                  <dt>{t('quote.ownerWarranty')}</dt>
                  <dd>{fmtRp(result.warrantyReserve)}</dd>
                  <dt>{t('quote.ownerProfit')}</dt>
                  <dd data-tone={profitTone}>{fmtRp(result.profit)}</dd>
                  <dt>{t('quote.ownerRatio')}</dt>
                  <dd data-tone={profitTone}>
                    {result.profitRatio === null ? <EmptyValue /> : fmtPercent(result.profitRatio, 0)}
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
