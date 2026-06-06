import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Button, Input as BaseInput, Icon } from '@/components/ui';
import { fmtRpInput, parseRpInput } from '@/lib/format';
import { derivePrefix } from '@/lib/id';
import { toast } from '@/stores/toast';
import { isSupabaseConfigured } from '@/data/supabase-client';
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

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'karyawan', label: 'Karyawan' },
];

interface WizardProps {
  onComplete: (orgId: string, ownerId: string) => void;
}

export function Wizard({ onComplete }: WizardProps) {
  // Cloud mode: employees are Supabase Auth accounts, no PIN needed.
  // Wizard shows 4 steps (no Tim/PIN step); owner name lives in step 1.
  const isCloud = isSupabaseConfigured;
  const STEPS = isCloud
    ? ['Profil', 'Wallet', 'Kategori', 'Target']
    : ['Profil', 'Wallet', 'Kategori', 'Tim', 'Target'];
  // In cloud mode UI step 4 = Target (business step 5 has no validation).
  const validationStep = (uiStep: number) => (isCloud && uiStep === 4 ? 5 : uiStep);

  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(emptyWizardData());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Must be after useState to reference `step`.
  const isTargetStep = isCloud ? step === 4 : step === 5;

  const update = (patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch }));

  const errorMap = (): Record<string, string> => {
    const list = validateStep(validationStep(step), data);
    return Object.fromEntries(list.map((e) => [e.field, e.message]));
  };

  const next = () => {
    const map = errorMap();
    if (Object.keys(map).length) {
      setErrors(map);
      toast.error('Periksa kembali isian yang ditandai');
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length));
  };
  const prev = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
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
      toast.success('Workspace berhasil dibuat!');
      onComplete(org.id, owner.id);
    } catch {
      toast.error('Gagal membuat workspace. Coba lagi.');
      setBusy(false);
    }
  };

  // DEV-ONLY: populate a demo workspace and sign in as owner. The seed module
  // is dynamically imported so it never lands in production bundles. The seed
  // sets boot='ready', so AuthGate swaps the app in without onComplete.
  const runDevSeed = async () => {
    setSeeding(true);
    try {
      const { seedDemoWorkspace } = await import('@/dev/seed');
      await seedDemoWorkspace();
    } catch {
      toast.error('Gagal memuat data demo');
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
          <p className={styles.subtitle}>Setup awal untuk memulai dashboard Anda</p>
        </header>

        {/* Demo seed button — local dev only (seed uses IndexedDB, not Supabase). */}
        {import.meta.env.DEV && !isCloud && (
          <div className={styles.devBar}>
            <button
              type="button"
              className={styles.devBtn}
              onClick={() => void runDevSeed()}
              disabled={seeding}
            >
              <Icon name="lightning" aria-hidden />
              {seeding ? 'Memuat data demo…' : 'Isi data demo & masuk'}
            </button>
            <span className={styles.devHint}>Mode dev · login sebagai Owner (PIN 1234)</span>
          </div>
        )}

        <div className={styles.progress}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? 'done' : n === step ? 'active' : '';
            return (
              <div key={label} className={styles.progressItem}>
                <span className={[styles.dot, styles[state]].join(' ')}>
                  {n < step ? <Icon name="check" aria-hidden /> : n}
                </span>
                <span className={styles.dotLabel}>{label}</span>
                {n < STEPS.length && <span className={styles.line} />}
              </div>
            );
          })}
        </div>

        <div className={styles.card}>
          {step === 1 && (
            <Step title="Profil Usaha" desc="Informasi dasar tentang usaha reparasi Anda">
              <Input
                label="Nama Usaha"
                placeholder="Contoh: TechFix Center"
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
              <div className={styles.row}>
                <Input
                  label="Alamat"
                  placeholder="Jl. Sudirman No. 25, Jakarta"
                  value={data.address}
                  onChange={(e) => update({ address: e.target.value })}
                />
                <Input
                  label="Inisial Servis"
                  placeholder="TFC"
                  maxLength={5}
                  value={data.servicePrefix}
                  onChange={(e) => update({ servicePrefix: e.target.value.toUpperCase() })}
                />
              </div>
              <Input
                label="No. Telepon"
                placeholder="0812-3456-7890"
                value={data.phone}
                onChange={(e) => update({ phone: e.target.value })}
              />
              {/* Cloud mode: owner name displayed in sidebar — collected here since
                  there is no Tim step. Local mode has a dedicated Tim step. */}
              {isCloud && (
                <Input
                  label="Nama Anda (tampil di aplikasi)"
                  placeholder="Nama lengkap"
                  value={data.employees[0]?.name ?? ''}
                  onChange={(e) => {
                    const employees = [{ ...data.employees[0], name: e.target.value }];
                    update({ employees });
                  }}
                />
              )}
            </Step>
          )}

          {step === 2 && (
            <Step title="Wallet / Kas" desc="Metode pembayaran & saldo awal">
              {errors.wallets && <p className={styles.formError}>{errors.wallets}</p>}
              <div className={styles.list}>
                {data.wallets.map((w, i) => (
                  <div key={i} className={styles.listRow}>
                    <Input
                      placeholder="Nama wallet"
                      value={w.name}
                      onChange={(e) => {
                        const wallets = [...data.wallets];
                        wallets[i] = { ...w, name: e.target.value };
                        update({ wallets });
                      }}
                    />
                    <Input
                      placeholder="Saldo awal"
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
                      aria-label="Hapus"
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
                Tambah Wallet
              </Button>
            </Step>
          )}

          {step === 3 && (
            <Step title="Kategori Perangkat" desc="Jenis perangkat yang Anda servis">
              {errors.categories && <p className={styles.formError}>{errors.categories}</p>}
              <div className={styles.chips}>
                {data.categories.map((c, i) => (
                  <span key={i} className={styles.chip}>
                    {c}
                    <button
                      onClick={() =>
                        update({ categories: data.categories.filter((_, j) => j !== i) })
                      }
                      aria-label="Hapus"
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

          {/* Tim/PIN step — local mode only. In cloud mode each employee is a
              separate Supabase Auth account; invitations are handled post-onboarding. */}
          {!isCloud && step === 4 && (
            <Step title="Tim / Karyawan" desc="Minimal 1 Owner dengan PIN 4 digit">
              {errors.employees && <p className={styles.formError}>{errors.employees}</p>}
              <div className={styles.list}>
                {data.employees.map((emp, i) => (
                  <div key={i} className={styles.empRow}>
                    <Input
                      placeholder="Nama lengkap"
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
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="PIN"
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
                      aria-label="Hapus"
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
                Tambah Anggota
              </Button>
            </Step>
          )}

          {isTargetStep && (
            <Step title="Target & Biaya Tetap" desc="Proyeksi bulanan (bisa diubah nanti)">
              <div className={styles.row}>
                <Input
                  label="Target Pendapatan / bln"
                  placeholder="15.000.000"
                  value={data.targetRevenue ? fmtRpInput(String(data.targetRevenue)) : ''}
                  onChange={(e) => update({ targetRevenue: parseRpInput(e.target.value) })}
                />
                <Input
                  label="Target Jumlah Servis"
                  type="number"
                  placeholder="50"
                  value={data.targetServiceCount || ''}
                  onChange={(e) => update({ targetServiceCount: Number(e.target.value) })}
                />
              </div>
              <Input
                label="Overhead Budget / bln"
                placeholder="5.000.000"
                value={data.overheadBudget ? fmtRpInput(String(data.overheadBudget)) : ''}
                onChange={(e) => update({ overheadBudget: parseRpInput(e.target.value) })}
              />
            </Step>
          )}

          <div className={styles.actions}>
            {step > 1 ? (
              <Button
                variant="secondary"
                onClick={prev}
                iconLeft={<Icon name="arrow-left" aria-hidden />}
              >
                Kembali
              </Button>
            ) : (
              <span />
            )}
            {step < STEPS.length ? (
              <Button onClick={next} iconRight={<Icon name="arrow-right" aria-hidden />}>
                Lanjut
              </Button>
            ) : (
              <Button
                variant="success"
                onClick={finish}
                loading={busy}
                iconLeft={<Icon name="check-circle" aria-hidden />}
              >
                Selesai & Mulai
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
      <h3 className={styles.stepTitle}>{title}</h3>
      <p className={styles.stepDesc}>{desc}</p>
      <div className={styles.stepBody}>{children}</div>
    </div>
  );
}

function CategoryAdder({ onAdd }: { onAdd: (name: string) => void }) {
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
        placeholder="Tambah kategori baru"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Button variant="secondary" onClick={add} iconLeft={<Icon name="plus" aria-hidden />}>
        Tambah
      </Button>
    </div>
  );
}
