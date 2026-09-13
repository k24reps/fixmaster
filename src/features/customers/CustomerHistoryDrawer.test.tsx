import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSettingsStore } from '@/stores/settings';
import type { LoadQuery } from '@/components/ui/loadPending';
import type { Customer } from '@/data/types';
import { CustomerHistoryDrawer } from './CustomerHistoryDrawer';

const customer = { id: 'c1', name: 'Andi' } as Customer;

function renderDrawer(over: Partial<LoadQuery>) {
  const servicesLoad: LoadQuery = { loading: false, error: null, refetch: vi.fn(), ...over };
  render(
    <MemoryRouter>
      <CustomerHistoryDrawer
        open
        onClose={() => {}}
        customer={customer}
        services={[]}
        servicesLoad={servicesLoad}
      />
    </MemoryRouter>,
  );
}

describe('CustomerHistoryDrawer', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'id' });
  });
  afterEach(cleanup);

  it('servis masih dimuat → status, bukan "Belum ada servis · Rp 0"', () => {
    renderDrawer({ loading: true });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Belum ada servis')).toBeNull();
    expect(screen.queryByText(/Rp\s?0$/)).toBeNull();
  });

  it('servis termuat dan kosong → baru "Belum ada servis"', () => {
    renderDrawer({});
    expect(screen.getByText('Belum ada servis')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
