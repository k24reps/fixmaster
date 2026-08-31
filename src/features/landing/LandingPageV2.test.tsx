import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings';
import { LandingPageV2 } from './LandingPageV2';

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
    fireEvent.click(
      within(proPlate as HTMLElement).getByRole('button', { name: 'Mulai uji coba 14 hari' }),
    );

    expect(onStart).toHaveBeenCalledWith({
      mode: 'signup',
      source: 'pricing_pro',
      plan: 'enterprise',
    });
  });
});
