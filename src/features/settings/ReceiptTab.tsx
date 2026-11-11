import { useRef, type KeyboardEvent } from 'react';
import { Card, CardBody, CardHeader, Icon } from '@/components/ui';
import { setReceiptSettings } from '@/config/orgConfig';
import { useT, type TranslationKey } from '@/i18n';
import {
  PAPER_WIDTHS,
  charsPerLine,
  normalizePaperWidth,
  paperSpec,
  type PaperWidth,
} from '@/lib/business/receiptPaper';
import { demoGuard } from '@/stores/demo';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import styles from './ReceiptTab.module.css';

/**
 * Pengaturan › Nota & Struk: satu rumah untuk semua yang menentukan isi dan
 * bentuk kertas yang dibawa pulang pelanggan. Dulu tersebar: nama dan logo di
 * Usaha, Catatan Toko di kartu keenam Operasional, dan sisanya tertanam di kode.
 */
export function ReceiptTab() {
  return (
    <>
      <PaperCard />
    </>
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

        <div className={styles.setup}>
          <h3 className={styles.setupTitle}>{t('receipt.setup.title')}</h3>
          <ul className={styles.setupList}>
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
