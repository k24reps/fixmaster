import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthGate } from './AuthGate';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ServicesPage } from '@/features/services/ServicesPage';
import { ServiceDetailPage } from '@/features/services/ServiceDetailPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { PosPage } from '@/features/pos/PosPage';
import { FinancePage } from '@/features/finance/FinancePage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { AttendancePage } from '@/features/attendance/AttendancePage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { TrackingPage } from '@/features/tracking/TrackingPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { NotFoundPage } from '@/components/NotFoundPage';
import { RepairTicketPrototype } from '@/features/prototype/RepairTicketPrototype';

export const router = createBrowserRouter([
  {
    // Public design prototype (no auth) — for visual evaluation only.
    path: '/prototype/ticket',
    element: <RepairTicketPrototype />,
  },
  {
    // Public, no-login service tracking.
    path: '/track',
    element: <TrackingPage />,
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
      { path: 'finance', element: <FinancePage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'attendance', element: <AttendancePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
