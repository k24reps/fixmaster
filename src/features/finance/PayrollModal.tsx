import { useState } from 'react';
import { Modal, Input, Button, Select, FormFields, FormRow, FormError } from '@/components/ui';
import { useCollection } from '@/hooks/useCollection';
import { useSessionStore, mustPickOutlet } from '@/stores/session';
import { fmtRp, fmtRpInput, parseRpInput } from '@/lib/format';
import { localDateStr } from '@/lib/time';
import { entryDateError, walletsForOutlet } from '@/lib/business/finance';
import { netPay, type PayrollRow } from '@/lib/business/payroll';
import { loadPayrollOverview, paySalary } from '@/data/payroll';
import { logActivity } from '@/lib/activity';
import { toast } from '@/stores/toast';
import { interpolate } from '@/lib/business/notify';
import { useT } from '@/i18n';
import type { Wallet } from '@/data/types';
import styles from './FinancePage.module.css';

interface PayrollModalProps {
  open: boolean;
  onClose: () => void;
  wallets: Wallet[];
}

/**
 * Bayar Gaji: gaji penuh (beban) + potongan kasbon (pelunasan piutang) dalam
 * satu simpan. Dulu dua catatan manual dan sisa kasbon dihitung sendiri dari
 * keterangan. Sisa kasbon & gaji terakhir tiap karyawan dimuat saat dibuka.
 */
export function PayrollModal({ open, onClose, wallets }: PayrollModalProps) {
  const t = useT();
  const orgId = useSessionStore((s) => s.org?.id ?? '');
  const activeOutletId = useSessionStore((s) => s.activeOutletId);
  const allowedOutletIds = useSessionStore((s) => s.allowedOutletIds);
  const { data: employees } = useCollection('employees');
  const { data: outlets } = useCollection('outlets');
  const [overview, setOverview] = useState<Map<string, PayrollRow>>(new Map());
  const [employeeId, setEmployeeId] = useState('');
  const [gross, setGross] = useState('');
  const [deduction, setDeduction] = useState('');
  const [walletId, setWalletId] = useState('');
  const [outletId, setOutletId] = useState('');
  const [date, setDate] = useState(localDateStr());
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<string[]>([]);

  const needOutlet = mustPickOutlet(outlets.length);
  const payOutlet = needOutlet ? outletId || null : activeOutletId;
  const usableWallets = walletsForOutlet(wallets, payOutlet);
  const staff = employees.filter((e) => e.active);
  const employee = staff.find((e) => e.id === employeeId) ?? null;
  const row = employee ? overview.get(employee.id) : undefined;
  const outstanding = row?.advanceOutstanding ?? 0;
  const grossNum = parseRpInput(gross);
  const deductNum = parseRpInput(deduction);
  const today = localDateStr();

  const refresh = () => {
    void loadPayrollOverview(orgId)
      .then(setOverview)
      .catch(() => setOverview(new Map()));
  };

  const [wasOpen, setWasOpen] = useState(false);
  if (!open && wasOpen) setWasOpen(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setEmployeeId('');
    setGross('');
    setDeduction('');
    setWalletId(walletsForOutlet(wallets, activeOutletId)[0]?.id ?? '');
    setOutletId('');
    setDate(localDateStr());
    setDescription('');
    setError('');
    setPaid([]);
    refresh();
  }

  const pickEmployee = (id: string) => {
    setEmployeeId(id);
    setError('');
    const r = overview.get(id);
    const g = r?.lastSalary ?? 0;
    setGross(g ? fmtRpInput(String(g)) : '');
    const d = Math.min(r?.advanceOutstanding ?? 0, g || (r?.advanceOutstanding ?? 0));
    setDeduction(d ? fmtRpInput(String(d)) : '');
  };

  const save = async (another: boolean) => {
    if (!employee) return setError(t('payroll.employeeRequired'));
    if (grossNum <= 0) return setError(t('payroll.grossRequired'));
    if (deductNum > outstanding) {
      return setError(interpolate(t('payroll.deductTooBig'), { amount: fmtRp(outstanding) }));
    }
    if (deductNum > grossNum) return setError(t('payroll.deductOverGross'));
    if (needOutlet && !outletId) return setError(t('finance.outletRequired'));
    if (!walletId) return setError(t('payroll.walletRequired'));
    const dateErr = entryDateError(date, today);
    if (dateErr) return setError(dateErr);
    setBusy(true);
    try {
      await paySalary({
        orgId,
        employeeId: employee.id,
        employeeName: employee.name,
        gross: grossNum,
        deduction: deductNum,
        walletId,
        outletId: payOutlet,
        date,
        description,
      });
      logActivity({
        action: 'expense.create',
        entityType: 'expense',
        entityLabel: description.trim() || `Gaji ${employee.name}`,
        meta: { amount: grossNum, category: 'Gaji', advanceDeduction: deductNum },
      });
      toast.success(
        interpolate(t('payroll.saved'), { name: employee.name, amount: fmtRp(netPay(grossNum, deductNum)) }),
      );
      if (another) {
        setPaid((p) => [...p, employee.id]);
        setEmployeeId('');
        setGross('');
        setDeduction('');
        setDescription('');
        refresh();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('payroll.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('payroll.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" onClick={() => void save(true)} loading={busy}>
            {t('payroll.saveAnother')}
          </Button>
          <Button onClick={() => void save(false)} loading={busy}>
            {/* Nominal rupiah tak bisa dipatah: di ponsel tombol 3 kolom meluber. Jumlahnya ada di readout. */}
            {t('payroll.payShort')}
          </Button>
        </>
      }
    >
      <FormFields>
        <FormError>{error}</FormError>
        {needOutlet && (
          <Select
            label={t('finance.outlet')}
            value={outletId}
            onChange={(e) => setOutletId(e.target.value)}
            options={outlets
              .filter((o) => allowedOutletIds.length === 0 || allowedOutletIds.includes(o.id))
              .map((o) => ({ value: o.id, label: o.name }))}
            placeholder={t('finance.outletPlaceholder')}
          />
        )}
        <Select
          label={t('payroll.employee')}
          value={employeeId}
          onChange={(e) => pickEmployee(e.target.value)}
          placeholder={t('payroll.pickEmployee')}
          options={staff.map((e) => {
            const r = overview.get(e.id);
            const tags = [
              paid.includes(e.id) ? t('payroll.tagPaid') : '',
              r && r.advanceOutstanding > 0 ? interpolate(t('payroll.tagAdvance'), { amount: fmtRp(r.advanceOutstanding) }) : '',
            ].filter(Boolean);
            return { value: e.id, label: tags.length ? `${e.name} · ${tags.join(' · ')}` : e.name };
          })}
        />
        <FormRow>
          <Input
            label={t('payroll.gross')}
            inputMode="numeric"
            value={gross}
            onChange={(e) => {
              setGross(fmtRpInput(e.target.value));
              setError('');
            }}
            placeholder="2.500.000"
            hint={row?.lastSalary ? interpolate(t('payroll.lastSalary'), { amount: fmtRp(row.lastSalary) }) : undefined}
          />
          <Input
            label={t('payroll.deduction')}
            inputMode="numeric"
            value={deduction}
            onChange={(e) => {
              setDeduction(fmtRpInput(e.target.value));
              setError('');
            }}
            placeholder="0"
            disabled={!employee || outstanding <= 0}
            hint={employee ? interpolate(t('payroll.outstanding'), { amount: fmtRp(outstanding) }) : undefined}
          />
        </FormRow>
        <FormRow>
          <Select
            label={t('payroll.wallet')}
            value={walletId}
            onChange={(e) => {
              setWalletId(e.target.value);
              const picked = wallets.find((w) => w.id === e.target.value);
              if (needOutlet && picked?.outletId) setOutletId(picked.outletId);
            }}
            options={usableWallets.map((w) => ({ value: w.id, label: `${w.name} · ${fmtRp(w.balance)}` }))}
          />
          <Input
            label={t('finance.date')}
            type="date"
            value={date}
            min={today.slice(0, 8) + '01'}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </FormRow>
        <Input
          label={t('finance.noteOptional')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={employee ? interpolate(t('payroll.notePh'), { name: employee.name }) : ''}
        />
        {employee && grossNum > 0 && (
          <div className={styles.payReadout} aria-live="polite">
            <span>
              {t('payroll.rGross')} <b>{fmtRp(grossNum)}</b>
            </span>
            {deductNum > 0 && (
              <span>
                {t('payroll.rDeduct')} <b>−{fmtRp(deductNum)}</b>
              </span>
            )}
            <span className={styles.payNet}>
              {t('payroll.rNet')} <b>{fmtRp(netPay(grossNum, deductNum))}</b>
            </span>
            {outstanding > 0 && (
              <span>
                {t('payroll.rRemaining')} <b>{fmtRp(Math.max(0, outstanding - deductNum))}</b>
              </span>
            )}
          </div>
        )}
      </FormFields>
    </Modal>
  );
}
