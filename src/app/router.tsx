/* eslint-disable react-refresh/only-export-components -- router config module: lazy() route components live here by design, not a fast-refreshed component file. */
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthGate } from './AuthGate';
import { ManagerRoute } from './ManagerRoute';
import { NotFoundPage } from '@/components/NotFoundPage';

// Route pages are code-split: each becomes its own chunk loaded on demand,
// keeping the initial bundle small. The shell (AppLayout/AuthGate) and the
// tiny NotFoundPage stay eager. A <Suspense> boundary in AppLayout renders a
// fallback while a page chunk loads. Named exports are mapped to `default`.
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ServicesPage = lazy(() =>
  import('@/features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })),
);
const ServiceDetailPage = lazy(() =>
  import('@/features/services/ServiceDetailPage').then((m) => ({ default: m.ServiceDetailPage })),
);
const CustomersPage = lazy(() =>
  import('@/features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const InventoryPage = lazy(() =>
  import('@/features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const PosPage = lazy(() =>
  import('@/features/pos/PosPage').then((m) => ({ default: m.PosPage })),
);
const FinancePage = lazy(() =>
  import('@/features/finance/FinancePage').then((m) => ({ default: m.FinancePage })),
);
const TasksPage = lazy(() =>
  import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })),
);
const AttendancePage = lazy(() =>
  import('@/features/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const TrackingPage = lazy(() =>
  import('@/features/tracking/TrackingPage').then((m) => ({ default: m.TrackingPage })),
);
const SuppliersPage = lazy(() =>
  import('@/features/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const RepairTicketPrototype = lazy(() =>
  import('@/features/prototype/RepairTicketPrototype').then((m) => ({
    default: m.RepairTicketPrototype,
  })),
);
const PrivacyPage = lazy(() =>
  import('@/features/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import('@/features/legal/TermsPage').then((m) => ({ default: m.TermsPage })),
);

export const router = createBrowserRouter([
  {
    // Public design prototype (no auth) — for visual evaluation only.
    path: '/prototype/ticket',
    element: (
      <Suspense fallback={null}>
        <RepairTicketPrototype />
      </Suspense>
    ),
  },
  {
    // Public, no-login service tracking.
    path: '/track',
    element: (
      <Suspense fallback={null}>
        <TrackingPage />
      </Suspense>
    ),
  },
  {
    // Public legal pages — linkable from signup consent, payment gateway,
    // and app store listings (no auth required).
    path: '/privacy',
    element: (
      <Suspense fallback={null}>
        <PrivacyPage />
      </Suspense>
    ),
  },
  {
    path: '/terms',
    element: (
      <Suspense fallback={null}>
        <TermsPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <AuthGate>
        <AppLayout />
      </AuthGate>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'services/:id', element: <ServiceDetailPage /> },
      { path: 'pos', element: <PosPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'finance', element: <ManagerRoute><FinancePage /></ManagerRoute> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'attendance', element: <AttendancePage /> },
      { path: 'reports', element: <ManagerRoute><ReportsPage /></ManagerRoute> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
