import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  FormError,
  FormFields,
  FormRow,
  Icon,
  Input,
  Textarea,
} from '@/components/ui';
import {
  PUBLIC_NOTE_MAX,
  setPublicNote,
  setReceiptSettings,
  setTermsSettings,
} from '@/config/orgConfig';
import { useCollection } from '@/hooks/useCollection';
import { useT, type TranslationKey } from '@/i18n';
import { saleReceiptDoc } from '@/features/pos/printSaleReceipt';
import {
  openReceiptWindow,
  receiptPreviewHtml,
  serviceReceiptDoc,
  type ReceiptDoc,
} from '@/features/services/printReceipt';
import { interpolate } from '@/lib/business/notify';
import {
  TERMS_EXTRA_MAX,
  currentTerms,
  isValidPickupDays,
  isValidTermsFee,
  termsClauses,
  termsSentenceText,
  termsToSave,
} from '@/lib/business/serviceTerms';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { fmtDate, localDateStr } from '@/lib/time';
import {
  PAPER_WIDTHS,
  charsPerLine,
  normalizePaperWidth,
  paperSpec,
  type PaperWidth,
} from '@/lib/business/receiptPaper';
import {
  RECEIPT_TEXT_MAX,
  cleanReceiptText,
  resolveReceiptSettings,
  type ResolvedReceiptSettings,
} from '@/lib/business/receiptTemplate';
import { demoGuard } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import type { Organization, ReceiptSettings, ServiceTerms } from '@/data/types';
import { sampleSale, sampleService } from './receiptSample';
import styles from './ReceiptTab.module.css';

/**
 * Pengaturan › Nota & Struk: satu rumah untuk semua yang menentukan isi dan
 * bentuk kertas yang dibawa pelanggan. Dulu tersebar: nama dan logo di
 * Usaha, Catatan Toko di kartu keenam Operasional, dan sisanya tertanam di kode.
 *
 * Saklar dan lebar kertas tersimpan seketika; teks bebas lewat satu tombol
 * Simpan. Pratinjau membaca yang SAMA dengan yang dicetak (saklar tersimpan +
 * teks yang sedang diketik), jadi pemilik toko melihat hasil sebelum menyimpan.
 */

interface TextDraft {
  header: string;
  footer: string;
  serviceTerms: string;
  saleTerms: string;
  note: string;
}

const fromOrg = (org: Organization | null): TextDraft => {
  const r = resolveReceiptSettings(org?.settings?.receipt);
  return {
    header: r.header,
    footer: r.footer,
    serviceTerms: r.serviceTerms,
    saleTerms: r.saleTerms,
    note: (org?.settings?.publicNote ?? '').trim(),
  };
};

const cleanDraft = (d: TextDraft): TextDraft => ({
  header: cleanReceiptText(d.header, RECEIPT_TEXT_MAX.header),
  footer: cleanReceiptText(d.footer, RECEIPT_TEXT_MAX.footer),
  serviceTerms: cleanReceiptText(d.serviceTerms, RECEIPT_TEXT_MAX.terms),
  saleTerms: cleanReceiptText(d.saleTerms, RECEIPT_TEXT_MAX.terms),
  note: cleanReceiptText(d.note, PUBLIC_NOTE_MAX),
});

export function ReceiptTab() {
  const org = useSessionStore((s) => s.org);
  const [draft, setDraft] = useState<TextDraft>(() => fromOrg(org));
  const [terms, setTerms] = useState<TermsDraft>(() => termsDraftOf(currentTerms(org?.settings?.terms)));

  return (
    <div className={styles.stage}>
      <div className={styles.layout}>
        <div className={styles.forms}>
          <PaperCard />
          <ContentCard draft={draft} onChange={setDraft} />
          <ShowCard />
          <TermsCard draft={terms} onChange={setTerms} />
        </div>
        <div className={styles.previewCol}>
          <PreviewCard draft={draft} terms={terms} />
        </div>
      </div>
    </div>
  );
}

const PAPER_LABEL: Record<PaperWidth, TranslationKey> = {
  58: 'receipt.paper.w58',
  80: 'receipt.paper.w80',
};
const PAPER_HINT: Record<PaperWidth, TranslationKey> = {
  58: 'receipt.paper.w58Hint',
  80: 'receipt.paper.w80Hint',
};

/** Roving focus untuk radiogroup: panah, Home, End. */
function radioStep(key: string, index: number, last: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return index >= last ? 0 : index + 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return index <= 0 ? last : index - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return null;
}

function PaperCard() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const current = normalizePaperWidth(org?.settings?.receipt?.paperWidth);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  // Di ponsel empat langkah dialog cetak tertutup supaya "Yang dicetak" tak
  // terdorong satu layar ke bawah; di lebar lapang CSS selalu menampilkannya.
  const [setupOpen, setSetupOpen] = useState(false);
  const setupId = useId();

  const choose = async (width: PaperWidth) => {
    if (width === current) return;
    if (demoGuard()) return;
    try {
      await setReceiptSettings({ paperWidth: width });
      toast.success(t('receipt.paper.saved'));
    } catch {
      toast.error(t('receipt.paper.saveFailed'));
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = PAPER_WIDTHS.indexOf(current);
    const next = radioStep(e.key, index, PAPER_WIDTHS.length - 1);
    if (next === null) return;
    e.preventDefault();
    void choose(PAPER_WIDTHS[next]);
    cells.current[next]?.focus();
  };

  return (
    <Card>
      <CardHeader icon={<Icon name="receipt" aria-hidden />} title={t('receipt.paper.title')} />
      <CardBody>
        <p className={styles.hint}>{t('receipt.paper.hint')}</p>
        <div
          role="radiogroup"
          aria-label={t('receipt.paper.title')}
          className={styles.papers}
          onKeyDown={onKeyDown}
        >
          {PAPER_WIDTHS.map((w, i) => {
            const checked = w === current;
            return (
              <button
                key={w}
                ref={(el) => {
                  cells.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={styles.paper}
                onClick={() => void choose(w)}
              >
                <span className={styles.paperName}>
                  <span className={styles.led} aria-hidden />
                  {t(PAPER_LABEL[w])}
                </span>
                <span className={styles.paperHint}>{t(PAPER_HINT[w])}</span>
                <span className={styles.paperCols}>
                  {charsPerLine(paperSpec(w))} {t('receipt.paper.cols')}
                </span>
                <span className={styles.strip} data-width={w} aria-hidden>
                  <span />
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.setup} data-open={setupOpen ? 'true' : undefined}>
          <div className={styles.setupHead}>
            <h3 className={styles.setupTitle}>{t('receipt.setup.title')}</h3>
            <button
              type="button"
              className={styles.setupToggle}
              aria-expanded={setupOpen}
              aria-controls={setupId}
              onClick={() => setSetupOpen((v) => !v)}
            >
              {setupOpen ? t('receipt.setup.close') : t('receipt.setup.open')}
              <Icon name="chevron-down" className={styles.caret} aria-hidden />
            </button>
          </div>
          <ul id={setupId} className={styles.setupList}>
            <li>{t('receipt.setup.margin')}</li>
            <li>{t('receipt.setup.headers')}</li>
            <li>{t('receipt.setup.scale')}</li>
            <li>{t('receipt.setup.android')}</li>
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Isi kertas

interface TextFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  max: number;
  rows: number;
  /** Teks bawaan, tampil redup selama kolom kosong. */
  placeholder?: string;
  onChange: (value: string) => void;
}

function TextField({ id, label, hint, value, max, rows, placeholder, onChange }: TextFieldProps) {
  const t = useT();
  const left = max - value.length;
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </p>
      )}
      <textarea
        id={id}
        className={styles.textarea}
        value={value}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={styles.count} data-low={left <= Math.min(40, max / 4) ? 'true' : undefined}>
        {interpolate(t('receipt.field.left'), { n: String(left) })}
      </span>
    </div>
  );
}

function ContentCard({ draft, onChange }: { draft: TextDraft; onChange: (d: TextDraft) => void }) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const [busy, setBusy] = useState(false);
  const saved = useMemo(() => cleanDraft(fromOrg(org)), [org]);
  const dirty = JSON.stringify(cleanDraft(draft)) !== JSON.stringify(saved);

  const set = (key: keyof TextDraft) => (value: string) => onChange({ ...draft, [key]: value });

  const save = async () => {
    if (demoGuard()) return;
    const next = cleanDraft(draft);
    setBusy(true);
    try {
      await setReceiptSettings({
        header: next.header,
        footer: next.footer,
        serviceTerms: next.serviceTerms,
        saleTerms: next.saleTerms,
      });
      if (next.note !== saved.note) await setPublicNote(next.note);
      onChange(next);
      toast.success(t('receipt.content.saved'));
    } catch {
      toast.error(t('receipt.content.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={styles.cardContent}>
      <CardHeader icon={<Icon name="note" aria-hidden />} title={t('receipt.content.title')} />
      <CardBody>
        <p className={styles.hint}>{t('receipt.content.hint')}</p>
        <TextField
          id="receipt-header"
          label={t('receipt.field.header')}
          hint={t('receipt.field.headerHint')}
          value={draft.header}
          max={RECEIPT_TEXT_MAX.header}
          rows={2}
          onChange={set('header')}
        />
        <TextField
          id="receipt-footer"
          label={t('receipt.field.footer')}
          hint={t('receipt.field.footerHint')}
          value={draft.footer}
          max={RECEIPT_TEXT_MAX.footer}
          rows={2}
          placeholder={t('receipt.foot.thanks')}
          onChange={set('footer')}
        />
        <TextField
          id="receipt-service-terms"
          label={t('receipt.field.serviceTerms')}
          value={draft.serviceTerms}
          max={RECEIPT_TEXT_MAX.terms}
          rows={3}
          placeholder={t('receipt.service.fine')}
          onChange={set('serviceTerms')}
        />
        <TextField
          id="receipt-sale-terms"
          label={t('receipt.field.saleTerms')}
          hint={t('receipt.field.saleTermsHint')}
          value={draft.saleTerms}
          max={RECEIPT_TEXT_MAX.terms}
          rows={3}
          placeholder={t('receipt.sale.fine')}
          onChange={set('saleTerms')}
        />
        <TextField
          id="receipt-note"
          label={t('settingsPage.catatanToko')}
          hint={t('receipt.field.noteHint')}
          value={draft.note}
          max={PUBLIC_NOTE_MAX}
          rows={3}
          onChange={set('note')}
        />
        <div className={styles.saveFoot}>
          <span className={styles.dirty} data-on={dirty ? 'true' : undefined} role="status">
            {dirty && (
              <>
                <span className={styles.dirtyLed} aria-hidden />
                {t('receipt.content.unsaved')}
              </>
            )}
          </span>
          <Button onClick={() => void save()} disabled={busy || !dirty} loading={busy}>
            {t('receipt.content.save')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Yang dicetak

type SwitchKey = 'showQr' | 'showTrackUrl' | 'showImei' | 'showTechnician' | 'showTime';

const SWITCHES: { key: SwitchKey; label: TranslationKey; hint: TranslationKey }[] = [
  { key: 'showQr', label: 'receipt.show.qr', hint: 'receipt.show.qrHint' },
  { key: 'showTrackUrl', label: 'receipt.show.trackUrl', hint: 'receipt.show.trackUrlHint' },
  { key: 'showImei', label: 'receipt.show.imei', hint: 'receipt.show.imeiHint' },
  { key: 'showTechnician', label: 'receipt.show.technician', hint: 'receipt.show.technicianHint' },
  { key: 'showTime', label: 'receipt.show.time', hint: 'receipt.show.timeHint' },
];

function ShowCard() {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const cfg = resolveReceiptSettings(org?.settings?.receipt);
  const [busy, setBusy] = useState<SwitchKey | null>(null);

  const flip = async (key: SwitchKey) => {
    if (busy || demoGuard()) return;
    setBusy(key);
    try {
      await setReceiptSettings({ [key]: !cfg[key] } as Partial<ReceiptSettings>);
      toast.success(t('receipt.show.saved'));
    } catch {
      toast.error(t('receipt.show.saveFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className={styles.cardShow}>
      <CardHeader icon={<Icon name="receipt" aria-hidden />} title={t('receipt.show.title')} />
      <CardBody>
        <p className={styles.hint}>{t('receipt.show.hint')}</p>
        <ul className={styles.switches}>
          {SWITCHES.map((s) => {
            const on = cfg[s.key];
            return (
              <li key={s.key} className={styles.switchRow}>
                <div className={styles.switchText}>
                  <span id={`${s.key}-label`} className={styles.switchLabel}>
                    {t(s.label)}
                  </span>
                  <span id={`${s.key}-hint`} className={styles.switchHint}>
                    {t(s.hint)}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`${s.key}-label`}
                  aria-describedby={`${s.key}-hint`}
                  className={styles.switch}
                  data-on={on}
                  disabled={busy === s.key}
                  onClick={() => void flip(s.key)}
                >
                  <span className={styles.switchLed} aria-hidden />
                  {on ? t('receipt.show.on') : t('receipt.show.off')}
                </button>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Syarat & Ketentuan

/** Isian S&K sebagai teks yang sedang diketik; angka dibaca saat disimpan. */
interface TermsDraft {
  pickupDays: string;
  storageFee: string;
  checkFee: string;
  extra: string;
}

const termsDraftOf = (t: ServiceTerms): TermsDraft => ({
  pickupDays: String(t.pickupDays),
  storageFee: t.storageFee ? fmtRpInput(String(t.storageFee)) : '',
  checkFee: t.checkFee ? fmtRpInput(String(t.checkFee)) : '',
  extra: t.extra,
});

function termsValues(d: TermsDraft) {
  const days = d.pickupDays.replace(/\D/g, '');
  return {
    pickupDays: days ? Number(days) : Number.NaN,
    storageFee: parseRpInput(d.storageFee),
    checkFee: parseRpInput(d.checkFee),
    extra: d.extra,
  };
}

/**
 * S&K yang akan berlaku bila isian ini disimpan sekarang, atau `null` bila
 * isiannya belum sah. Satu fungsi untuk tombol Simpan, LED "belum tersimpan",
 * dan pratinjau nota, supaya ketiganya tak pernah berbeda pendapat.
 */
function termsFromDraft(saved: ServiceTerms, d: TermsDraft): ServiceTerms | null {
  const v = termsValues(d);
  if (!isValidPickupDays(v.pickupDays) || !isValidTermsFee(v.storageFee) || !isValidTermsFee(v.checkFee))
    return null;
  return termsToSave(saved, v, localDateStr());
}

function TermsClauseList({ terms }: { terms: ServiceTerms }) {
  const t = useT();
  return (
    <ol className={styles.termsList}>
      {termsClauses(terms).map((c) => (
        <li key={c.title}>
          <span>
            <strong>{t(c.title)}.</strong> {c.body.map((b) => termsSentenceText(b, t)).join(' ')}
          </span>
        </li>
      ))}
      {terms.extra && (
        <li>
          <span className={styles.termsExtra}>
            <strong>{t('terms.extra.title')}.</strong> {terms.extra}
          </span>
        </li>
      )}
    </ol>
  );
}

function TermsCard({ draft, onChange }: { draft: TermsDraft; onChange: (d: TermsDraft) => void }) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  const saved = useMemo(() => currentTerms(org?.settings?.terms), [org]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const v = termsValues(draft);
  const badDays = !isValidPickupDays(v.pickupDays);
  const next = termsFromDraft(saved, draft);
  const dirty = next !== saved;
  const shown = next ?? saved;

  const set = (key: keyof TermsDraft, money = false) => (value: string) => {
    setError('');
    onChange({ ...draft, [key]: money ? fmtRpInput(value) : value });
  };

  const save = async () => {
    if (!next) {
      setError(t(badDays ? 'terms.settings.invalidDays' : 'terms.settings.invalidFee'));
      return;
    }
    if (demoGuard()) return;
    setBusy(true);
    try {
      await setTermsSettings(next);
      onChange(termsDraftOf(next));
      toast.success(t('terms.settings.saved'));
    } catch {
      toast.error(t('terms.settings.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={styles.cardTerms}>
      <CardHeader icon={<Icon name="scale-balanced" aria-hidden />} title={t('terms.settings.title')} />
      <CardBody>
        <p className={styles.hint}>{t('terms.settings.hint')}</p>
        <FormFields>
          <FormError>{error}</FormError>
          <Input
            id="terms-pickup-days"
            label={t('terms.settings.pickupDays')}
            hint={t('terms.settings.pickupDaysHint')}
            inputMode="numeric"
            autoComplete="off"
            value={draft.pickupDays}
            invalid={!!error && badDays}
            onChange={(e) => set('pickupDays')(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
          <FormRow>
            <Input
              id="terms-storage-fee"
              label={t('terms.settings.storageFee')}
              hint={t('terms.settings.storageFeeHint')}
              inputMode="numeric"
              autoComplete="off"
              value={draft.storageFee}
              invalid={!!error && !isValidTermsFee(v.storageFee)}
              onChange={(e) => set('storageFee', true)(e.target.value)}
            />
            <Input
              id="terms-check-fee"
              label={t('terms.settings.checkFee')}
              hint={t('terms.settings.checkFeeHint')}
              inputMode="numeric"
              autoComplete="off"
              value={draft.checkFee}
              invalid={!!error && !isValidTermsFee(v.checkFee)}
              onChange={(e) => set('checkFee', true)(e.target.value)}
            />
          </FormRow>
          <Textarea
            id="terms-extra"
            label={t('terms.settings.extra')}
            hint={t('terms.settings.extraHint')}
            value={draft.extra}
            maxLength={TERMS_EXTRA_MAX}
            rows={3}
            onChange={(e) => set('extra')(e.target.value)}
          />
        </FormFields>

        <div className={styles.termsVersion}>
          <span className={styles.termsVersionLabel}>
            <span className={styles.led} aria-hidden />
            {t('terms.settings.version')}
          </span>
          <span className={styles.termsVersionValue}>{fmtDate(shown.version)}</span>
        </div>
        <p className={styles.fieldHint}>{t('terms.settings.versionHint')}</p>

        <details className={styles.termsView}>
          <summary className={styles.termsSummary}>
            {t('terms.settings.view')}
            <Icon name="chevron-down" className={styles.caret} aria-hidden />
          </summary>
          <TermsClauseList terms={shown} />
        </details>

        <div className={styles.saveFoot}>
          <span className={styles.dirty} data-on={dirty ? 'true' : undefined} role="status">
            {dirty && (
              <>
                <span className={styles.dirtyLed} aria-hidden />
                {t('receipt.content.unsaved')}
              </>
            )}
          </span>
          <Button onClick={() => void save()} disabled={busy || !dirty} loading={busy}>
            {t('terms.settings.save')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pratinjau

type Sample = 'service' | 'sale';

/**
 * Zoom pratinjau paling besar: kertas 58mm hanya 219px, terlalu kecil untuk
 * dibaca di layar. Zoom yang dipakai mengecil sendiri bila meja kerjanya lebih
 * sempit dari kertas yang diperbesar (kertas 80mm di kolom 470px atau di ponsel):
 * menggeser kertas ke samping di dalam kartu lebih buruk daripada kertas kecil.
 */
const PREVIEW_ZOOM = 1.5;

function PreviewCard({ draft, terms }: { draft: TextDraft; terms: TermsDraft }) {
  const t = useT();
  const org = useSessionStore((s) => s.org);
  // S&K yang akan berlaku bila disimpan sekarang; isian yang belum sah = yang tersimpan.
  const previewTerms = useMemo(() => {
    const saved = currentTerms(org?.settings?.terms);
    return termsFromDraft(saved, terms) ?? saved;
  }, [org, terms]);
  const { data: outlets } = useCollection('outlets');
  const [which, setWhich] = useState<Sample>('service');
  const [oneBit, setOneBit] = useState(false);
  const [height, setHeight] = useState(0);
  const [avail, setAvail] = useState(0);
  // Hanya bermakna di bawah ambang dua kolom: kartu jadi dok yang menempel di
  // dasar layar dan panelnya terbuka ke atas. Di lebar lapang CSS mengabaikannya.
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const peek = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const watcher = useRef<ResizeObserver | null>(null);

  // Panel yang terbuka menutupi bagian bawah layar: begitu pemilik toko
  // menyentuh kolom atau saklar lain, panel menyingkir supaya yang diketik
  // tak tertutup.
  useEffect(() => {
    if (!open) return;
    const dock = peek.current?.closest('[data-dock]');
    const away = (e: FocusEvent) => {
      if (dock && e.target instanceof Node && !dock.contains(e.target)) setOpen(false);
    };
    document.addEventListener('focusin', away);
    return () => document.removeEventListener('focusin', away);
  }, [open]);

  // Lebar bersih meja kerja (tanpa padding) diukur dari DOM-nya, bukan ditebak
  // dari breakpoint: ia menyusut oleh sidebar, kolom, dan zoom aplikasi sekaligus.
  const watchBench = useCallback((el: HTMLDivElement | null) => {
    watcher.current?.disconnect();
    watcher.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const cs = getComputedStyle(el);
      setAvail(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
    };
    read();
    watcher.current = new ResizeObserver(read);
    watcher.current.observe(el);
  }, []);

  // Organisasi bayangan: setelan tersimpan + teks yang sedang diketik.
  const previewOrg = useMemo<Organization | null>(() => {
    if (!org) return null;
    const next = cleanDraft(draft);
    return {
      ...org,
      settings: {
        ...org.settings,
        publicNote: next.note,
        receipt: {
          ...org.settings?.receipt,
          header: next.header,
          footer: next.footer,
          serviceTerms: next.serviceTerms,
          saleTerms: next.saleTerms,
        },
      },
    };
  }, [org, draft]);

  const cfg: ResolvedReceiptSettings = resolveReceiptSettings(previewOrg?.settings?.receipt);
  const paper = paperSpec(cfg.paperWidth);

  const doc = useMemo<ReceiptDoc | null>(() => {
    if (!previewOrg) return null;
    const text = {
      complaint: t('receipt.sample.complaint'),
      condition: t('receipt.sample.condition'),
      accessories: t('receipt.sample.accessories'),
      item1: t('receipt.sample.item1'),
      item2: t('receipt.sample.item2'),
    };
    if (which === 'service')
      return serviceReceiptDoc(sampleService(text), previewOrg, window.location.origin, outlets, {
        terms: previewTerms,
      });
    const { sale, change } = sampleSale(text);
    return saleReceiptDoc(sale, previewOrg, {
      change,
      outlets,
      walletName: (id) => (id === 'sample-cash' ? t('receipt.sample.cash') : ''),
    });
  }, [previewOrg, which, outlets, t, previewTerms]);

  if (!previewOrg || !doc) return null;
  const html = receiptPreviewHtml(previewOrg, doc);

  // Tinggi isi diukur dari dokumennya sendiri: baris yang membungkus bergantung
  // pada font mono yang ada di mesin ini, bukan pada angka yang kami tebak.
  const measure = () => {
    // body, bukan documentElement: scrollHeight html tak bisa lebih kecil dari
    // tinggi iframe, jadi nota pendek akan terukur setinggi bingkainya.
    const body = frame.current?.contentDocument?.body;
    if (body) setHeight(Math.ceil(body.getBoundingClientRect().height));
  };

  const print = () => openReceiptWindow(previewOrg, doc);
  const mmPx = (mm: number) => (mm * 96) / 25.4;
  const paperPx = mmPx(cfg.paperWidth);
  // Dibulatkan ke bawah per 0,01: ukuran kertas tak ikut bergetar bersama sub-piksel.
  const zoom =
    avail > 0 ? Math.min(PREVIEW_ZOOM, Math.floor((avail / paperPx) * 100) / 100) : PREVIEW_ZOOM;

  const closeOnEscape = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return;
    setOpen(false);
    peek.current?.focus();
  };

  return (
    // Escape ditangkap di kartunya: fokus bisa sedang di tombol pilih atau saklar
    // di dalam panel, bukan di tombol dok.
    <Card
      className={styles.monitorCard}
      data-dock=""
      data-open={open ? 'true' : undefined}
      onKeyDown={closeOnEscape}
    >
      <CardHeader
        icon={<Icon name="receipt" aria-hidden />}
        className={styles.dockHead}
        titleClassName={styles.dockTitle}
        actionClassName={styles.dockAction}
        // Satu h2, dua isi: label biasa di lebar lapang, tombol buka-tutup di
        // lebar sempit. CSS menyembunyikan yang tak dipakai (display:none, jadi
        // hilang juga dari pohon aksesibilitas), sehingga di lebar lapang tak
        // ada tombol mati yang bisa difokus.
        title={
          <>
            <span className={styles.dockStatic}>{t('receipt.preview.title')}</span>
            <button
              ref={peek}
              type="button"
              className={styles.peek}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              <span className={styles.peekLed} aria-hidden />
              <span className={styles.peekText}>{t('receipt.preview.title')}</span>
              <Icon name="chevron-down" className={styles.caret} aria-hidden />
            </button>
          </>
        }
        action={
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Icon name="print" aria-hidden />}
            onClick={print}
          >
            {t('receipt.preview.print')}
          </Button>
        }
      />
      <CardBody id={panelId} className={styles.panel}>
        <div role="group" aria-label={t('receipt.preview.title')} className={styles.pick}>
          {(['service', 'sale'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={styles.pickBtn}
              aria-pressed={which === k}
              onClick={() => setWhich(k)}
            >
              {t(k === 'service' ? 'receipt.preview.service' : 'receipt.preview.sale')}
            </button>
          ))}
        </div>

        <div className={styles.readout}>
          <span>
            {cfg.paperWidth} mm · {charsPerLine(paper)} {t('receipt.paper.cols')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={oneBit}
            className={styles.switch}
            data-on={oneBit}
            onClick={() => setOneBit((v) => !v)}
          >
            <span className={styles.switchLed} aria-hidden />
            {t('receipt.preview.bw')}
          </button>
        </div>
        {oneBit && <p className={styles.fieldHint}>{t('receipt.preview.bwHint')}</p>}

        <div className={styles.bench} ref={watchBench}>
          <div
            className={styles.sheet}
            style={{
              width: paperPx * zoom,
              height: height ? height * zoom : undefined,
            }}
          >
            <iframe
              ref={frame}
              key={cfg.paperWidth}
              title={interpolate(t('receipt.preview.frame'), { width: String(cfg.paperWidth) })}
              srcDoc={html}
              sandbox="allow-same-origin"
              scrolling="no"
              className={styles.frame}
              data-onebit={oneBit ? 'true' : undefined}
              style={{ width: paperPx, height: height || 480, zoom }}
              onLoad={measure}
            />
          </div>
        </div>
        <p className={styles.fieldHint}>{t('receipt.preview.sample')}</p>
      </CardBody>
    </Card>
  );
}
