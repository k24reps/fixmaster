/* eslint-disable react-refresh/only-export-components -- route config module: lazy() route components live here by design. */
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { ManagerRoute } from './ManagerRoute';
import { OwnerRoute } from './OwnerRoute';
import { NotFoundPage } from '@/components/NotFoundPage';

// Route pages are code-split: each becomes its own chunk loaded on demand.
// Shared by the real app (createBrowserRouter at '/') AND the public demo
// (MemoryRouter in DemoApp), so the two never drift apart.
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
const ActivityLogPage = lazy(() =>
  import('@/features/activity/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })),
);
const SuppliersPage = lazy(() =>
  import('@/features/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

/** The authenticated app's child routes (rendered inside AppLayout's Outlet). */
export const appChildRoutes: RouteObject[] = [
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
  { path: 'reports', element: <OwnerRoute><ReportsPage /></OwnerRoute> },
  { path: 'activity', element: <OwnerRoute><ActivityLogPage /></OwnerRoute> },
  { path: 'settings', element: <OwnerRoute><SettingsPage /></OwnerRoute> },
  { path: '*', element: <NotFoundPage /> },
];
