import type { Dictionary } from './id';

/**
 * English dictionary. Typed as `Dictionary`, so it MUST contain exactly
 * the keys defined in id.ts — a missing key is a TypeScript error.
 */
export const en: Dictionary = {
  // ---------- Common ----------
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.all': 'All',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading…',
  'common.empty': 'No data yet',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.print': 'Print',
  'common.export': 'Export',
  'common.actions': 'Actions',
  'common.status': 'Status',
  'common.date': 'Date',
  'common.total': 'Total',
  'common.yes': 'Yes',
  'common.no': 'No',

  // ---------- Navigation ----------
  'nav.dashboard': 'Dashboard',
  'nav.services': 'Services',
  'nav.pos': 'POS',
  'nav.customers': 'Customers',
  'nav.inventory': 'Inventory',
  'nav.suppliers': 'Suppliers',
  'nav.finance': 'Finance',
  'nav.tasks': 'Internal Tasks',
  'nav.attendance': 'Attendance',
  'nav.reports': 'Reports',
  'nav.settings': 'Settings',

  // ---------- Page subtitles ----------
  'subtitle.dashboard': "Today's snapshot of your business performance",
  'subtitle.services': 'Manage repair tickets from intake to completion',
  'subtitle.pos': 'Fast, accurate sales transactions',
  'subtitle.customers': 'Customer database & service history',
  'subtitle.inventory': 'Spareparts & product stock',
  'subtitle.suppliers': 'Suppliers and purchase orders',
  'subtitle.finance': 'Cash flow, wallets, and profitability',
  'subtitle.tasks': 'Internal tasks & team SOPs',
  'subtitle.attendance': 'Employee attendance & work hours',
  'subtitle.reports': 'Business analytics & reports',
  'subtitle.settings': 'App & team configuration',

  // ---------- Service statuses ----------
  'status.diterima': 'Received',
  'status.diagnosa': 'Diagnosis',
  'status.konfirmasi': 'Confirmation',
  'status.tunggu': 'Awaiting Part',
  'status.pengerjaan': 'In Progress',
  'status.selesai': 'Completed',
  'status.lunas': 'Paid',
  'status.batal': 'Cancelled',

  // ---------- Settings (language/currency) ----------
  'settings.language': 'Language',
  'settings.currency': 'Currency',
  'settings.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',

  // ---------- Auth / session ----------
  'auth.logout': 'Sign out',
};
