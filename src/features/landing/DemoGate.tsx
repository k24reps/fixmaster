import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { useT, type TranslationKey } from '@/i18n';
import { interpolate } from '@/lib/business/notify';
import {
  DEMO_LEAD_RETENTION_DAYS,
  SHOP_NAME_MAX,
  cleanShopName,
  demoLeadErrors,
  type DemoLeadErrors,
  type DemoLeadSource,
} from '@/lib/business/demoLead';
import { clearDemoVisitor, readDemoVisitor, saveDemoVisitor } from '@/lib/demoVisitor';
import { DemoLeadRejectedError, submitDemoLead } from '@/data/supabase-client';
import { useSettingsStore } from '@/stores/settings';
import { trackEvent } from '@/lib/analytics';
import styles from './DemoGate.module.css';

interface DemoGateProps {
  source: DemoLeadSource;
  title: TranslationKey;
  /** Dipanggil saat nama toko diketik, untuk kop adegan di hero. */
  onShopNameChange?: (name: string) => void;
  /** Bawaan: pindah ke /demo. Halaman /demo sendiri memulai demonya di tempat. */
  onPassed?: (shopName: string) => void;
  /** Tanpa <Link>: halaman /demo berjalan di luar router aplikasi. */
  privacyHref?: string;
}

type Status = 'idle' | 'sending' | 'failed' | 'limited';

function openDemo() {
  window.location.assign('/demo');
}

/**
 * Gerbang demo: nama toko + nomor WhatsApp, lalu demo terbuka dengan nama toko
 * itu (migrasi 0102). Pengunjung yang sudah lolos di perangkat ini langsung
 * mendapat tombol buka; isian kosong hanya muncul lagi bila ia minta ganti toko.
 */
export function DemoGate({
  source,
  title,
  onShopNameChange,
  onPassed = openDemo,
  privacyHref,
}: DemoGateProps) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const formId = useId();
  const [returning, setReturning] = useState(() => readDemoVisitor());
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [trap, setTrap] = useState('');
  const [errors, setErrors] = useState<DemoLeadErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [serverError, setServerError] = useState<TranslationKey | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const changeName = (value: string) => {
    setShopName(value);
    onShopNameChange?.(cleanShopName(value));
    if (attempted) setErrors(demoLeadErrors({ shopName: value, phone }));
  };

  const changePhone = (value: string) => {
    setPhone(value);
    if (attempted) setErrors(demoLeadErrors({ shopName, phone: value }));
  };

  const pass = (name: string) => {
    trackEvent('landing_cta_clicked', { location: source, intent: 'demo', plan: 'none' });
    onPassed(name);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;
    setAttempted(true);
    const found = demoLeadErrors({ shopName, phone });
    setErrors(found);
    setServerError(null);
    if (found.shopName) {
      nameRef.current?.focus();
      return;
    }
    if (found.phone) {
      phoneRef.current?.focus();
      return;
    }

    const name = cleanShopName(shopName);
    setStatus('sending');
    try {
      await submitDemoLead({ shopName: name, phone, source, locale: language, trap });
      saveDemoVisitor(name);
      setStatus('idle');
      pass(name);
    } catch (err) {
      if (err instanceof DemoLeadRejectedError && err.reason !== 'rate_limited') {
        // Server menolak isian yang lolos pemeriksaan browser: tampilkan di kolomnya.
        const next: DemoLeadErrors =
          err.reason === 'phone'
            ? { phone: 'demoGate.errorPhone' }
            : { shopName: 'demoGate.errorNameLink' };
        setErrors(next);
        setStatus('idle');
        (err.reason === 'phone' ? phoneRef : nameRef).current?.focus();
        return;
      }
      const limited = err instanceof DemoLeadRejectedError;
      setStatus(limited ? 'limited' : 'failed');
      setServerError(limited ? 'demoGate.errorLimited' : 'demoGate.errorSave');
    }
  };

  const privacy = privacyHref ? (
    <a href={privacyHref}>{t('demoGate.privacyLink')}</a>
  ) : (
    <Link to="/privacy">{t('demoGate.privacyLink')}</Link>
  );

  if (returning) {
    return (
      <section className={styles.gate} aria-labelledby={`${formId}-title`}>
        <h2 id={`${formId}-title`} className={styles.title}>
          {t('demoGate.returningTitle')}
        </h2>
        <p className={styles.returningShop}>
          <span className={styles.led} aria-hidden />
          <strong>{returning.shopName}</strong>
        </p>
        <button className={styles.submit} type="button" onClick={() => pass(returning.shopName)}>
          {t('demoGate.openAgain')}
          <Icon name="arrow-right" aria-hidden />
        </button>
        <button
          className={styles.switchShop}
          type="button"
          onClick={() => {
            clearDemoVisitor();
            setReturning(null);
            onShopNameChange?.('');
          }}
        >
          {t('demoGate.switchShop')}
        </button>
      </section>
    );
  }

  const nameErrorId = `${formId}-name-error`;
  const phoneErrorId = `${formId}-phone-error`;
  const serverErrorId = `${formId}-server-error`;
  const sending = status === 'sending';

  return (
    <section className={styles.gate} aria-labelledby={`${formId}-title`}>
      <h2 id={`${formId}-title`} className={styles.title}>
        {t(title)}
      </h2>
      <p className={styles.lead}>{t('demoGate.lead')}</p>

      <form className={styles.form} onSubmit={submit} noValidate aria-busy={sending}>
        <div className={styles.field} data-invalid={errors.shopName ? 'true' : undefined}>
          <label htmlFor={`${formId}-name`}>{t('demoGate.nameLabel')}</label>
          <input
            ref={nameRef}
            id={`${formId}-name`}
            name="shop"
            type="text"
            autoComplete="organization"
            maxLength={SHOP_NAME_MAX + 20}
            placeholder={t('demoGate.namePlaceholder')}
            value={shopName}
            onChange={(e) => changeName(e.target.value)}
            aria-invalid={errors.shopName ? true : undefined}
            aria-describedby={errors.shopName ? nameErrorId : undefined}
          />
          {errors.shopName && (
            <p id={nameErrorId} className={styles.fieldError}>
              {t(errors.shopName)}
            </p>
          )}
        </div>

        <div className={styles.field} data-invalid={errors.phone ? 'true' : undefined}>
          <label htmlFor={`${formId}-phone`}>{t('demoGate.phoneLabel')}</label>
          <input
            ref={phoneRef}
            id={`${formId}-phone`}
            className={styles.mono}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={24}
            placeholder="0812-3456-7890"
            value={phone}
            onChange={(e) => changePhone(e.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? phoneErrorId : undefined}
          />
          {errors.phone && (
            <p id={phoneErrorId} className={styles.fieldError}>
              {t(errors.phone)}
            </p>
          )}
        </div>

        {/* Jebakan bot: tidak terlihat, tidak bisa difokus, tidak dibaca
            pembaca layar. Manusia tidak pernah mengisinya. */}
        <div className={styles.trap} aria-hidden="true">
          <label htmlFor={`${formId}-site`}>Website</label>
          <input
            id={`${formId}-site`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
          />
        </div>

        {serverError && (
          <p id={serverErrorId} className={styles.serverError} role="alert">
            <Icon name="warning" aria-hidden />
            <span>{t(serverError)}</span>
          </p>
        )}

        <button
          className={styles.submit}
          type="submit"
          aria-disabled={sending || undefined}
          aria-describedby={serverError ? serverErrorId : undefined}
        >
          {sending ? (
            <>
              <Icon name="circle-notch" className="spin" aria-hidden />
              {t('demoGate.sending')}
            </>
          ) : (
            <>
              {status === 'failed' || status === 'limited'
                ? t('demoGate.retry')
                : t('demoGate.submit')}
              <Icon name="arrow-right" aria-hidden />
            </>
          )}
        </button>

        <p className={styles.note}>
          {interpolate(t('demoGate.note'), { days: String(DEMO_LEAD_RETENTION_DAYS) })} {privacy}
        </p>
      </form>
    </section>
  );
}
