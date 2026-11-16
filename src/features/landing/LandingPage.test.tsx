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

describe('LandingPage untuk siapa', () => {
  it('narasi menyapa toko yang masih sendiri sampai yang sudah bercabang', () => {
    renderLanding();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Toko servis yang rapi dan teratur, mulai hari ini.' }),
    ).toBeInTheDocument();
    const stages = screen.getByRole('heading', { name: /Dari kerja sendiri sampai buka cabang/ }).closest('section');
    expect(stages).not.toBeNull();
    for (const name of ['Masih kerja sendiri', 'Sudah dibantu karyawan', 'Sudah buka cabang']) {
      expect(within(stages as HTMLElement).getByRole('heading', { level: 3, name })).toBeInTheDocument();
    }
    expect(within(stages as HTMLElement).getByText(/Rp 1\.000 per unit masuk/)).toBeInTheDocument();
    // Bagian cerita founder dicabut atas keputusan pemilik (15 Nov 2026).
    expect(screen.queryByText(/Saya Rif/)).toBeNull();
  });
});

describe('LandingPage perbandingan', () => {
  it('tiap masalah toko yang berantakan berpasangan dengan jawabannya', () => {
    renderLanding();
    const versus = screen.getByRole('heading', { name: /beres di satu aplikasi/ }).closest('section');
    expect(versus).not.toBeNull();
    const rows = within(versus as HTMLElement).getAllByRole('listitem');
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      // Label lajur ikut di tiap sel, jadi pembaca layar tahu sisi mana yang dibaca.
      expect(within(row).getByText('Cara konvensional')).toBeInTheDocument();
      expect(within(row).getByText('Dengan FixMaster')).toBeInTheDocument();
    }
  });
});

describe('LandingPage dua adegan', () => {
  it('nama toko yang diketik di gerbang muncul di kop komputer dan label kedua perangkat', () => {
    renderLanding();
    const desk = screen.getByRole('figure', { name: /komputer/i });
    const phone = screen.getByRole('figure', { name: /^HP$/i });
    expect(within(desk).queryByText('Sinar Servis')).toBeNull();

    const [nameField] = screen.getAllByLabelText('Nama toko');
    fireEvent.change(nameField, { target: { value: '  Sinar   Servis ' } });

    // Kop di layar komputer + label di bawahnya.
    expect(within(desk).getAllByText('Sinar Servis')).toHaveLength(2);
    expect(within(phone).getByText('Sinar Servis')).toBeInTheDocument();
    expect(screen.getByText('Sinar Servis di FixMaster')).toBeInTheDocument();
  });

  it('isian gerbang hero sudah terisi di gerbang penutup', () => {
    renderLanding();
    const [heroName, finalName] = screen.getAllByLabelText('Nama toko');
    const [heroPhone, finalPhone] = screen.getAllByLabelText('Nomor WhatsApp');
    fireEvent.change(heroName, { target: { value: 'Sinar Servis' } });
    fireEvent.change(heroPhone, { target: { value: '0813 1122 4455' } });

    expect(finalName).toHaveValue('Sinar Servis');
    expect(finalPhone).toHaveValue('0813 1122 4455');
  });

  // Layar yang tampil adalah satu-satunya gambar ber-alt; halaman lain aria-hidden.
  const current = (name: RegExp) =>
    within(screen.getByRole('figure', { name })).getByRole('img').getAttribute('src');
  const loadImages = (page: string) =>
    document.querySelectorAll(`img[src*="/${page}-"]`).forEach((img) => fireEvent.load(img));

  it('kedua layar mulai di detail tiket dan pindah bersamaan setelah keduanya siap', () => {
    renderLanding();
    expect(current(/komputer/i)).toBe('/bench/dark/detail-desk.webp');
    expect(current(/^HP$/i)).toBe('/bench/dark/detail-phone.webp');

    const menu = screen.getByRole('group', { name: /buka menu/i });
    fireEvent.click(within(menu).getByRole('button', { name: 'Dashboard' }));
    expect(within(menu).getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Gambar Dashboard belum termuat: layar lama tetap tampil, tidak setengah pindah.
    expect(current(/komputer/i)).toBe('/bench/dark/detail-desk.webp');

    loadImages('dashboard');
    expect(current(/komputer/i)).toBe('/bench/dark/dashboard-desk.webp');
    expect(current(/^HP$/i)).toBe('/bench/dark/dashboard-phone.webp');
  });

  it('klik menu di bottom nav HP memindah komputer juga', () => {
    renderLanding();
    const phone = screen.getByRole('figure', { name: /^HP$/i });
    // Area klik di atas gambar tidak ikut urutan Tab (aria-hidden); deret tombol
    // adalah jalur keyboard.
    const hotspots = phone.querySelectorAll('button[aria-hidden="true"]');
    expect(hotspots.length).toBeGreaterThan(0);
    fireEvent.click(hotspots[1]);
    loadImages('services');
    expect(current(/komputer/i)).toBe('/bench/dark/services-desk.webp');
    expect(current(/^HP$/i)).toBe('/bench/dark/services-phone.webp');
  });

  it('menu yang tidak direkam menawarkan demo lengkap', () => {
    renderLanding();
    const other = document.querySelector('button[data-other="true"]');
    expect(other).not.toBeNull();
    fireEvent.click(other!);
    const desk = screen.getByRole('figure', { name: /komputer/i });
    expect(within(desk).getByText(/ada di demo lengkap/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Coba demo/ })).toHaveAttribute('href', '#coba');

    // Escape menutupnya, begitu pula tombol tutup.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(desk).queryByText(/ada di demo lengkap/)).toBeNull();
    fireEvent.click(other!);
    fireEvent.click(within(desk).getByRole('button', { name: 'Tutup' }));
    expect(within(desk).queryByText(/ada di demo lengkap/)).toBeNull();
  });

  it('ganti nama toko di satu gerbang membuka formulir di kedua gerbang', () => {
    localStorage.setItem(VISITOR_KEY, JSON.stringify({ shopName: 'Sinar Servis' }));
    renderLanding();
    expect(screen.queryAllByLabelText('Nomor WhatsApp')).toHaveLength(0);

    fireEvent.click(screen.getAllByRole('button', { name: /Ganti nama toko/ })[0]);
    expect(screen.getAllByLabelText('Nomor WhatsApp')).toHaveLength(2);
    expect(screen.queryByText('Sinar Servis')).toBeNull();
    // Tombol yang ditekan hilang; fokus pindah ke kolom nama gerbang itu.
    expect(screen.getAllByLabelText('Nama toko')[0]).toHaveFocus();
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
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp'), { target: { value: '0812-4719-3305' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Buka demo' }));
    });

    expect(submitDemoLead).toHaveBeenCalledWith({
      shopName: 'Sinar Servis',
      phone: '0812-4719-3305',
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
    fireEvent.change(screen.getByLabelText('Nomor WhatsApp'), { target: { value: '081247193305' } });
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

  it('fokus mendarat di kolom yang salah sesudah error terpasang', () => {
    renderGate();
    const name = screen.getByLabelText('Nama toko');
    const atFocus: (string | null)[] = [];
    name.addEventListener('focus', () =>
      atFocus.push(name.getAttribute('aria-invalid'), name.getAttribute('aria-describedby')),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Buka demo' }));

    expect(document.activeElement).toBe(name);
    // Pembaca layar membaca atribut saat fokus tiba: keduanya harus sudah ada.
    expect(atFocus[0]).toBe('true');
    expect(atFocus[1]).toBeTruthy();
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
