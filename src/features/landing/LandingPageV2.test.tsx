import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings';
import { useZoomStore } from '@/stores/zoom';
import { LandingPageV2 } from './LandingPageV2';

describe('LandingPageV2 density', () => {
  it('memakai kerapatan kelas perangkat, bukan zoom app yang tersimpan, lalu memulihkannya', () => {
    const originalMatchMedia = window.matchMedia;
    // Desktop bermouse. Landing juga berlangganan media query lain (tema), jadi
    // mock-nya harus berbentuk MediaQueryList lengkap.
    window.matchMedia = vi.fn((media: string) => ({
      matches: true,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      useZoomStore.getState().setZoom(1.25);

      const { unmount } = render(
        <MemoryRouter>
          <LandingPageV2 onStart={vi.fn()} />
        </MemoryRouter>,
      );
      expect(document.documentElement.style.zoom).toBe('0.8');
      expect(localStorage.getItem('fixmaster-zoom')).toBe('1.25');

      unmount();
      expect(document.documentElement.style.zoom).toBe('1.25');
    } finally {
      useZoomStore.getState().setZoom(1);
      localStorage.removeItem('fixmaster-zoom');
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe('LandingPageV2 auth intent', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'id' });
  });

  it('opens login from the header sign-in action', () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingPageV2 onStart={onStart} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(onStart).toHaveBeenCalledWith({ mode: 'login', source: 'header' });
  });

  it('opens signup from the hero trial action', () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingPageV2 onStart={onStart} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Mulai gratis 14 hari/i })[0]);
    expect(onStart).toHaveBeenCalledWith({ mode: 'signup', source: 'hero' });
  });

  it('preserves the Pro plan selection', () => {
    const onStart = vi.fn();
    render(
      <MemoryRouter>
        <LandingPageV2 onStart={onStart} />
      </MemoryRouter>,
    );

    const proPlate = screen.getByRole('heading', { name: 'Pro' }).closest('article');
    expect(proPlate).not.toBeNull();
    // Label CTA menyebut paketnya. Sebelumnya kedua tombol berbunyi identik,
    // sehingga tes ini pun harus mencari lewat pelat induknya untuk tahu mana
    // yang diklik — ambiguitas yang sama yang dihadapi pengunjung.
    fireEvent.click(
      within(proPlate as HTMLElement).getByRole('button', { name: 'Mulai gratis dengan Pro' }),
    );
    expect(screen.getByRole('button', { name: 'Mulai gratis dengan Solo' })).toBeInTheDocument();

    expect(onStart).toHaveBeenCalledWith({
      mode: 'signup',
      source: 'pricing_pro',
      plan: 'enterprise',
    });
  });
});
