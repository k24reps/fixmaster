import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings';
import { useZoomStore } from '@/stores/zoom';
import { LandingPage } from './LandingPage';
import { DemoGate } from './DemoGate';

const submitDemoLead = vi.fn();

vi.mock('@/data/supabase-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/supabase-client')>();
  return { ...actual, submitDemoLead: (...args: unknown[]) => submitDemoLead(...args) };
});

const VISITOR_KEY = 'fixmaster-demo-visitor';

function renderLanding(onStart = vi.fn()) {
  render(
    <MemoryRouter>
      <LandingPage onStart={onStart} />
    </MemoryRouter>,
  );
  return onStart;
}

function renderGate(onPassed = vi.fn()) {
  render(
    <MemoryRouter>
      <DemoGate source="hero" title="demoGate.title" onPassed={onPassed} />
    </MemoryRouter>,
  );
  return onPassed;
}

beforeEach(() => {
  useSettingsStore.setState({ language: 'id' });
  localStorage.removeItem(VISITOR_KEY);
  submitDemoLead.mockReset();
});

afterEach(() => {
  localStorage.removeItem(VISITOR_KEY);
});

describe('LandingPage density', () => {
  it('selalu 100% + Lapang, bukan tampilan app yang tersimpan, lalu memulihkannya', () => {
    try {
      useZoomStore.getState().setZoom(1.25);
      useZoomStore.getState().setDensity('padat');

      const { unmount } = render(
        <MemoryRouter>
          <LandingPage onStart={vi.fn()} />
        </MemoryRouter>,
      );
      expect(document.documentElement.style.zoom).toBe('');
      expect(document.documentElement.dataset.density).toBeUndefined();

      unmount();
      expect(document.documentElement.style.zoom).toBe('1.25');
      expect(document.documentElement.dataset.density).toBe('padat');
    } finally {
      useZoomStore.getState().setZoom(1);
      useZoomStore.getState().setDensity('lapang');
    }
  });
});

describe('LandingPage auth intent', () => {
  it('Masuk di header membuka login', () => {
    const onStart = renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(onStart).toHaveBeenCalledWith({ mode: 'login', source: 'header' });
  });

  it('Mulai gratis di header membuka pendaftaran', () => {
    const onStart = renderLanding();
    fireEvent.click(screen.getByRole('button', { name: 'Mulai gratis' }));
    expect(onStart).toHaveBeenCalledWith({ mode: 'signup', source: 'header' });
  });

  it('bagian harga membuka pendaftaran dengan 50 unit gratis', () => {
    const onStart = renderLanding();
    const pricing = screen.getByRole('heading', { name: /per unit masuk/i }).closest('section');
    expect(pricing).not.toBeNull();
    fireEvent.click(within(pricing as HTMLElement).getByRole('button', { name: 'Mulai gratis, 50 unit' }));
    expect(onStart).toHaveBeenCalledWith({ mode: 'signup', source: 'pricing' });
  });
});

describe('LandingPage dua adegan', () => {
  it('nama toko yang diketik di gerbang menjadi kop meja dan ponsel', () => {
    renderLanding();
    const desk = screen.getByRole('figure', { name: /meja penerimaan/i });
    expect(within(desk).getByText('Toko Anda')).toBeInTheDocument();

    const [nameField] = screen.getAllByLabelText('Nama toko');
    fireEvent.change(nameField, { target: { value: '  Sinar   Servis ' } });

    expect(within(desk).getByText('Sinar Servis')).toBeInTheDocument();
    const phone = screen.getByRole('figure', { name: /ponsel pemilik/i });
    expect(within(phone).getByText('Sinar Servis')).toBeInTheDocument();
  });

  it('tombol meja menggerakkan angka di ponsel pemilik', () => {
    renderLanding();
    const desk = screen.getByRole('figure', { name: /meja penerimaan/i });
    const phone = screen.getByRole('figure', { name: /ponsel pemilik/i });
    expect(within(phone).getByText('Rp 1.240.000')).toBeInTheDocument();

    fireEvent.click(within(desk).getByRole('button', { name: 'Pasang keyboard dari stok' }));
    expect(within(phone).getByText('Rp 170.000')).toBeInTheDocument();
    fireEvent.click(within(desk).getByRole('button', { name: 'Tandai selesai' }));
    fireEvent.click(within(desk).getByRole('button', { name: 'Terima bayar Rp 350.000' }));
    expect(within(phone).getByText('Rp 1.590.000')).toBeInTheDocument();
    expect(within(desk).getByRole('button', { name: 'Ulangi dari awal' })).toBeInTheDocument();
  });
});

describe('DemoGate', () => {
  it('menolak nomor yang bukan seluler Indonesia tanpa memanggil server', () => {
    const onPassed = renderGate();
    fireEvent.change(screen.getByLabelText('Nama toko'), { target: { value: 'Sinar Servis' } });
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp'), { target: { value: '021 555 1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buka demo' }));

    expect(screen.getByText(/Nomor WhatsApp belum benar/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nomor WhatsApp')).toHaveAttribute('aria-invalid', 'true');
    expect(submitDemoLead).not.toHaveBeenCalled();
    expect(onPassed).not.toHaveBeenCalled();
  });

  it('isian sah dikirim, nama toko diingat, lalu demo dibuka', async () => {
    submitDemoLead.mockResolvedValue(undefined);
    const onPassed = renderGate();
    fireEvent.change(screen.getByLabelText('Nama toko'), { target: { value: ' Sinar  Servis ' } });
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp'), { target: { value: '0812-3456-7890' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buka demo' }));
    });

    expect(submitDemoLead).toHaveBeenCalledWith({
      shopName: 'Sinar Servis',
      phone: '0812-3456-7890',
      source: 'hero',
      locale: 'id',
      trap: '',
    });
    expect(onPassed).toHaveBeenCalledWith('Sinar Servis');
    expect(JSON.parse(localStorage.getItem(VISITOR_KEY) ?? '{}')).toEqual({ shopName: 'Sinar Servis' });
    // Nomor WhatsApp tidak pernah disimpan di browser.
    expect(localStorage.getItem(VISITOR_KEY)).not.toContain('0812');
  });

  it('gagal simpan dijelaskan jujur dan bisa diulang', async () => {
    submitDemoLead.mockRejectedValueOnce(new Error('Failed to fetch'));
    const onPassed = renderGate();
    fireEvent.change(screen.getByLabelText('Nama toko'), { target: { value: 'Sinar Servis' } });
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp'), { target: { value: '081234567890' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buka demo' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/koneksi ke server gagal/);
    expect(onPassed).not.toHaveBeenCalled();

    submitDemoLead.mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    });
    await waitFor(() => expect(onPassed).toHaveBeenCalledWith('Sinar Servis'));
  });

  it('pengunjung yang kembali di perangkat ini tidak mengisi lagi', () => {
    localStorage.setItem(VISITOR_KEY, JSON.stringify({ shopName: 'Sinar Servis' }));
    const onPassed = renderGate();
    expect(screen.queryByLabelText('Nomor WhatsApp')).toBeNull();
    expect(screen.getByText('Sinar Servis')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Buka demo' }));
    expect(onPassed).toHaveBeenCalledWith('Sinar Servis');

    fireEvent.click(screen.getByRole('button', { name: /Ganti nama toko/ }));
    expect(localStorage.getItem(VISITOR_KEY)).toBeNull();
    expect(screen.getByLabelText('Nomor WhatsApp')).toBeInTheDocument();
  });
});
