import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Button, Input as BaseInput, Icon } from '@/components/ui';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { derivePrefix } from '@/lib/id';
import { isSupabaseConfigured } from '@/data/supabase-client';
import { useSessionStore } from '@/stores/session';
import { toast } from '@/stores/toast';
import { trackEvent } from '@/lib/analytics';
import { useT, type TranslationKey } from '@/i18n';
import { interpolate } from '@/lib/business/notify';
import {
  emptyWizardData,
  validateStep,
  commitWizard,
  type WizardData,
} from './wizard-logic';
import type { Role } from '@/data/types';
import styles from './Wizard.module.css';

/**
 * Wizard inputs disable auto-capitalization: casing here depends on what the
 * registrant types (business name, email, owner name), so we never force it.
 */
function Input(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput noAutoCap {...props} />;
}

/**
 * Logical step numbers are STABLE (validateStep depends on them and is unit
 * tested by number). The "Tim" step (4) is local-only: in cloud mode the owner
 * IS the signed-in account and staff join later via invite, so there are no
 * PINs to collect during onboarding. We therefore drive navigation by a list
 * of *visible* steps while keeping each step's logical number intact.
 */
const STEP_DEFS = [
  { n: 1, labelKey: 'onboarding.step.profile' },
  { n: 6, labelKey: 'onboarding.step.outlet' },
  { n: 2, labelKey: 'onboarding.step.wallet' },
  { n: 3, labelKey: 'onboarding.step.category' },
  { n: 4, labelKey: 'onboarding.step.team' },
  { n: 5, labelKey: 'onboarding.step.target' },
] as const;

const ROLE_OPTIONS: { value: Role; labelKey: TranslationKey }[] = [
  { value: 'owner', labelKey: 'settingsPage.owner' },
  { value: 'admin', labelKey: 'settingsPage.admin' },
  { value: 'karyawan', labelKey: 'settingsPage.karyawan' },
];

interface WizardProps {
  onComplete: (orgId: string, ownerId: string) => void;
}

export function Wizard({ onComplete }: WizardProps) {
  // Cloud onboarding skips the Tim/PIN step (owner = signed-in account).
  const isCloud = isSupabaseConfigured;
  const steps = isCloud ? STEP_DEFS.filter((s) => s.n !== 4) : STEP_DEFS;
  // Kenapa akun ini sampai di layar setup, kalau bukan karena memang mendaftar
  // toko baru. Wajib terlihat: menyelesaikan wizard di sini membuat toko
  // TANDINGAN yang tak bisa lagi diundang ke toko pengundang.
  const setupNotice = useSessionStore((st) => st.setupNotice);
  const t = useT();

  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<WizardData>(emptyWizardData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const step = steps[idx].n; // current logical step number
  const isLast = idx === steps.length - 1;

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  const errorMap = (): Record<string, string> => {
    const list = validateStep(step, data);
    const map: Record<string, string> = Object.fromEntries(
      list.map((e) => [e.field, t(e.messageKey)]),
    );
    // Cloud captures the owner name on the Profil step (no Tim step).
    if (isCloud && step === 1 && !data.employees[0]?.name.trim()) {
      map.ownerName = t('onboarding.ownerNameRequired');
    }
    return map;
  };

  const next = () => {
    const map = errorMap();
    if (Object.keys(map).length) {
      setErrors(map);
      toast.error(t('onboarding.checkFields'));
      return;
    }
    setErrors({});
    setIdx((i) => Math.min(i + 1, steps.length - 1));
  };
  const prev = () => {
    setErrors({});
    setIdx((i) => Math.max(i - 1, 0));
  };

  const finish = async () => {
    const map = errorMap();
    if (Object.keys(map).length) {
      setErrors(map);
      return;
    }
    setBusy(true);
    try {
      const { org, owner } = await commitWizard(data);
      trackEvent('activation_completed', { workspace_mode: isCloud ? 'cloud' : 'local' });
      toast.success(t('onboarding.created'));
      onComplete(org.id, owner.id);
    } catch {
      toast.error(t('onboarding.createFailed'));
      setBusy(false);
    }
  };

  // DEV-ONLY, LOCAL-ONLY: populate a demo workspace and sign in as owner. The
  // seed module is dynamically imported so it never lands in production
  // bundles. Hidden in cloud mode — demo data must never touch a real org.
  const runDevSeed = async () => {
    setSeeding(true);
    try {
      const { seedDemoWorkspace } = await import('@/dev/seed');
      await seedDemoWorkspace();
    } catch {
      toast.error(t('onboarding.seedFailed'));
      setSeeding(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>
              <Icon name="screwdriver-wrench" aria-hidden />
            </span>
            FixMaster
          </div>
          <p className={styles.subtitle}>{t('onboarding.subtitle')}</p>
        </header>

        {import.meta.env.DEV && !isCloud && (
          <div className={styles.devBar}>
            <button
              type="button"
              className={styles.devBtn}
              onClick={() => void runDevSeed()}
              disabled={seeding}
            >
              <Icon name="boxes-stacked" aria-hidden />
              {seeding ? t('onboarding.seeding') : t('onboarding.seed')}
            </button>
            <span className={styles.devHint}>{t('onboarding.devHint')}</span>
          </div>
        )}

        {isCloud && (
          <div className={styles.inviteWarn} role="status">
            <Icon name="info-circle" aria-hidden />
            <span>
              {setupNotice ? (
                <>
                  <strong>{setupNotice}</strong> {t('onboarding.inviteStop')}
                </>
              ) : (
                <>
                  {t('onboarding.inviteQuestion')} <strong>{t('onboarding.inviteDontFill')}</strong>{' '}
                  {t('onboarding.inviteHowTo')}
                </>
              )}
            </span>
          </div>
        )}

        <div className={styles.progress}>
          {steps.map((s, i) => {
            const state = i < idx ? 'done' : i === idx ? 'active' : '';
            return (
              <div key={s.n} className={styles.progressItem}>
                <span className={[styles.dot, styles[state]].join(' ')}>
                  {i < idx ? <Icon name="check" aria-hidden /> : i + 1}
                </span>
                <span className={styles.dotLabel}>{t(s.labelKey)}</span>
                {i < steps.length - 1 && <span className={styles.line} />}
              </div>
            );
          })}
        </div>

        <div className={styles.card}>
          {step === 1 && (
            <Step title={t('onboarding.profileTitle')} desc={t('onboarding.profileDesc')}>
              <Input
                label={t('onboarding.shopName')}
                placeholder={t('onboarding.shopNamePh')}
                value={data.shopName}
                error={errors.shopName}
                onChange={(e) => {
                  const shopName = e.target.value;
                  update({
                    shopName,
                    servicePrefix: data.servicePrefix || derivePrefix(shopName),
                  });
                }}
              />
              {isCloud && (
                <Input
                  label={t('onboarding.ownerName')}
                  placeholder={t('onboarding.ownerNamePh')}
                  value={data.employees[0]?.name ?? ''}
                  error={errors.ownerName}
                  onChange={(e) => {
                    const employees = [...data.employees];
                    employees[0] = {
                      ...(employees[0] ?? { role: 'owner', pin: '' }),
                      name: e.target.value,
                      role: 'owner',
                    };
                    update({ employees });
                  }}
                />
              )}
              <div className={styles.row}>
                <Input
                  label={t('onboarding.address')}
                  placeholder={t('onboarding.addressPh')}
                  value={data.address}
                  onChange={(e) => update({ address: e.target.value })}
                />
                <Input
                  label={t('onboarding.prefix')}
                  placeholder="SGS"
                  maxLength={5}
                  value={data.servicePrefix}
                  onChange={(e) => update({ servicePrefix: e.target.value.toUpperCase() })}
                />
              </div>
              <Input
                label={t('onboarding.phone')}
                placeholder="0812-3456-7890"
                value={data.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
            </Step>
          )}

          {step === 2 && (
            <Step title={t('onboarding.walletTitle')} desc={t('onboarding.walletDesc')}>
              {errors.wallets && <p className={styles.formError}>{errors.wallets}</p>}
              <div className={styles.list}>
                {data.wallets.map((w, i) => (
                  <div key={i} className={styles.listRow}>
                    <Input
                      placeholder={t('onboarding.walletName')}
                      value={w.name}
                      onChange={(e) => {
                        const wallets = [...data.wallets];
                        wallets[i] = { ...w, name: e.target.value };
                        update({ wallets });
                      }}
                    />
                    <Input
                      placeholder={t('onboarding.walletBalance')}
                      value={w.balance ? fmtRpInput(String(w.balance)) : ''}
                      onChange={(e) => {
                        const wallets = [...data.wallets];
                        wallets[i] = { ...w, balance: parseRpInput(e.target.value) };
                        update({ wallets });
                      }}
                    />
                    <button
                      className={styles.removeBtn}
                      onClick={() =>
                        update({ wallets: data.wallets.filter((_, j) => j !== i) })
                      }
                      aria-label={t('common.delete')}
                    >
                      <Icon name="trash" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Icon name="plus" aria-hidden />}
                onClick={() => update({ wallets: [...data.wallets, { name: '', balance: 0 }] })}
              >
                {t('onboarding.addWallet')}
              </Button>
            </Step>
          )}

          {step === 3 && (
            <Step title={t('onboarding.categoryTitle')} desc={t('onboarding.categoryDesc')}>
              {errors.categories && <p className={styles.formError}>{errors.categories}</p>}
              <div className={styles.chips}>
                {data.categories.map((c, i) => (
                  <span key={i} className={styles.chip}>
                    {c}
                    <button
                      onClick={() =>
                        update({ categories: data.categories.filter((_, j) => j !== i) })
                      }
                      aria-label={t('common.delete')}
                    >
                      <Icon name="times" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <CategoryAdder
                onAdd={(name) => update({ categories: [...data.categories, name] })}
              />
            </Step>
          )}

          {step === 4 && (
            <Step title={t('onboarding.teamTitle')} desc={t('onboarding.teamDesc')}>
              {errors.employees && <p className={styles.formError}>{errors.employees}</p>}
              <div className={styles.list}>
                {data.employees.map((emp, i) => (
                  <div key={i} className={styles.empRow}>
                    <Input
                      placeholder={t('onboarding.fullName')}
                      value={emp.name}
                      error={errors[`emp-name-${i}`]}
                      onChange={(e) => {
                        const employees = [...data.employees];
                        employees[i] = { ...emp, name: e.target.value };
                        update({ employees });
                      }}
                    />
                    <select
                      className={styles.roleSelect}
                      value={emp.role}
                      onChange={(e) => {
                        const employees = [...data.employees];
                        employees[i] = { ...emp, role: e.target.value as Role };
                        update({ employees });
                      }}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {t(r.labelKey)}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder={t('onboarding.pin')}
                      maxLength={4}
                      inputMode="numeric"
                      value={emp.pin}
                      error={errors[`emp-pin-${i}`]}
                      onChange={(e) => {
                        const employees = [...data.employees];
                        employees[i] = { ...emp, pin: e.target.value.replace(/\D/g, '') };
                        update({ employees });
                      }}
                    />
                    <button
                      className={styles.removeBtn}
                      onClick={() =>
                        update({ employees: data.employees.filter((_, j) => j !== i) })
                      }
                      aria-label={t('common.delete')}
                    >
                      <Icon name="trash" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Icon name="plus" aria-hidden />}
                onClick={() =>
                  update({
                    employees: [...data.employees, { name: '', role: 'karyawan', pin: '' }],
                  })
                }
              >
                {t('onboarding.addMember')}
              </Button>
            </Step>
          )}

          {step === 5 && (
            <Step title={t('onboarding.targetTitle')} desc={t('onboarding.targetDesc')}>
              <div className={styles.row}>
                <Input
                  label={t('onboarding.targetRevenue')}
                  placeholder="15.000.000"
                  value={data.targetRevenue ? fmtRpInput(String(data.targetRevenue)) : ''}
                  onChange={(e) => update({ targetRevenue: parseRpInput(e.target.value) })}
                />
                <Input
                  label={t('onboarding.targetServices')}
                  type="number"
                  placeholder="50"
                  value={data.targetServiceCount || ''}
                  onChange={(e) => update({ targetServiceCount: Number(e.target.value) })}
                />
              </div>
              <p className={styles.stepHint}>
                <Icon name="info-circle" aria-hidden /> {t('onboarding.targetHint')}
              </p>
            </Step>
          )}

          {step === 6 && (
            <Step title={t('onboarding.outletTitle')} desc={t('onboarding.outletDesc')}>
              {errors.outlets && <p className={styles.formError}>{errors.outlets}</p>}
              <div className={styles.list}>
                {data.outlets.map((o, i) => (
                  <div key={i} className={styles.listRow}>
                    <Input
                      label={i === 0 ? t('onboarding.primaryOutlet') : interpolate(t('onboarding.branchN'), { n: String(i) })}
                      placeholder={
                        i === 0
                          ? data.shopName || t('onboarding.primaryOutletPh')
                          : t('onboarding.branchNamePh')
                      }
                      value={o.name}
                      error={errors[`outlet-name-${i}`]}
                      onChange={(e) => {
                        const outlets = [...data.outlets];
                        outlets[i] = { ...o, name: e.target.value };
                        update({ outlets });
                      }}
                    />
                    <Input
                      label={t('onboarding.address')}
                      placeholder={
                        i === 0
                          ? data.address || t('onboarding.outletAddressPh')
                          : t('onboarding.branchAddressPh')
                      }
                      value={o.address}
                      onChange={(e) => {
                        const outlets = [...data.outlets];
                        outlets[i] = { ...o, address: e.target.value };
                        update({ outlets });
                      }}
                    />
                    {i > 0 && (
                      <button
                        className={styles.removeBtn}
                        onClick={() => update({ outlets: data.outlets.filter((_, j) => j !== i) })}
                        aria-label={t('common.delete')}
                      >
                        <Icon name="trash" aria-hidden />
                      </button>
                    )}
                    <div className={styles.rentLine}>
                      <select
                        className={styles.roleSelect}
                        aria-label={interpolate(t('onboarding.rentModeLabel'), {
                          name:
                            o.name ||
                            (i === 0
                              ? t('onboarding.primaryOutletLower')
                              : interpolate(t('onboarding.branchNLower'), { n: String(i) })),
                        })}
                        value={o.rentMode ?? 'bulanan'}
                        onChange={(e) => {
                          const outlets = [...data.outlets];
                          outlets[i] = { ...o, rentMode: e.target.value as 'bulanan' | 'tahunan' };
                          update({ outlets });
                        }}
                      >
                        <option value="bulanan">{t('onboarding.rentMonthly')}</option>
                        <option value="tahunan">{t('onboarding.rentYearly')}</option>
                      </select>
                      {o.rentMode === 'tahunan' && (
                        <Input
                          aria-label={t('onboarding.rentYearlyLabel')}
                          placeholder={t('onboarding.rentYearlyPh')}
                          inputMode="numeric"
                          value={o.rentYearly ? fmtRpInput(String(o.rentYearly)) : ''}
                          onChange={(e) => {
                            const outlets = [...data.outlets];
                            outlets[i] = { ...o, rentYearly: parseRpInput(e.target.value) };
                            update({ outlets });
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className={styles.stepHint}>
                <Icon name="info-circle" aria-hidden /> {t('onboarding.outletHint')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Icon name="plus" aria-hidden />}
                onClick={() => update({ outlets: [...data.outlets, { name: '', address: '' }] })}
              >
                {t('onboarding.addBranch')}
              </Button>
            </Step>
          )}

          <div className={styles.actions}>
            {idx > 0 ? (
              <Button
                variant="secondary"
                onClick={prev}
                iconLeft={<Icon name="arrow-left" aria-hidden />}
              >
                {t('common.back')}
              </Button>
            ) : (
              <span />
            )}
            {!isLast ? (
              <Button onClick={next} iconRight={<Icon name="arrow-right" aria-hidden />}>
                {t('common.next')}
              </Button>
            ) : (
              <Button
                variant="success"
                onClick={finish}
                loading={busy}
                iconLeft={<Icon name="check-circle" aria-hidden />}
              >
                {t('onboarding.finish')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.step}>
      {/* Satu-satunya heading di layar setup: judul langkah adalah judul halaman. */}
      <h1 className={styles.stepTitle}>{title}</h1>
      <p className={styles.stepDesc}>{desc}</p>
      <div className={styles.stepBody}>{children}</div>
    </div>
  );
}

function CategoryAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const t = useT();
  const [value, setValue] = useState('');
  const add = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue('');
    }
  };
  return (
    <div className={styles.adder}>
      <Input
        placeholder={t('onboarding.categoryPh')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Button variant="secondary" onClick={add} iconLeft={<Icon name="plus" aria-hidden />}>
        {t('common.add')}
      </Button>
    </div>
  );
}
