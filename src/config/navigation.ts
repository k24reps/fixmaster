import type { Feature } from './plans';
import type { TranslationKey } from '@/i18n';

export interface NavItem {
  to: string;
  /** i18n key for the label. */
  labelKey: TranslationKey;
  icon: string;
  /** Font Awesome color hue for the icon. */
  color: string;
  /** Plan feature required to see this item (undefined = always shown). */
  feature?: Feature;
  /** Manager-only (owner/admin). Hidden from karyawan — mirrors RLS. */
  managerOnly?: boolean;
  /** Owner-only. Hidden from admin + karyawan — mirrors RLS. */
  ownerOnly?: boolean;
}

/**
 * Primary navigation. FixMaster goes beyond FixNova with a dedicated
 * "Tugas Internal" (internal tasks) section, and groups items logically.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: 'fa-chart-pie', color: '#f7b733' },
  { to: '/services', labelKey: 'nav.services', icon: 'fa-screwdriver-wrench', color: '#3dd9c4', feature: 'services' },
  { to: '/pos', labelKey: 'nav.pos', icon: 'fa-cash-register', color: '#10b981', feature: 'pos' },
  { to: '/customers', labelKey: 'nav.customers', icon: 'fa-users', color: '#f59e0b', feature: 'customers' },
  { to: '/inventory', labelKey: 'nav.inventory', icon: 'fa-boxes-stacked', color: '#3dd9c4', feature: 'inventory' },
  { to: '/suppliers', labelKey: 'nav.suppliers', icon: 'fa-truck-field', color: '#60a5fa', feature: 'suppliers' },
  { to: '/finance', labelKey: 'nav.finance', icon: 'fa-wallet', color: '#ec4899', feature: 'finance', managerOnly: true },
  { to: '/tasks', labelKey: 'nav.tasks', icon: 'fa-list-check', color: '#fbbf24', feature: 'tasks' },
  { to: '/attendance', labelKey: 'nav.attendance', icon: 'fa-calendar-check', color: '#34d399', feature: 'attendance' },
  { to: '/reports', labelKey: 'nav.reports', icon: 'fa-chart-line', color: '#f97316', feature: 'reports', ownerOnly: true },
  { to: '/activity', labelKey: 'nav.activity', icon: 'fa-list-check', color: '#a78bfa', ownerOnly: true },
  { to: '/settings', labelKey: 'nav.settings', icon: 'fa-gear', color: '#9aa4b3', ownerOnly: true },
];
