import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useDrawerFocus } from './useDrawerFocus';

afterEach(cleanup);

/**
 * Harness meniru AppLayout: tombol menu di luar laci, laci berisi tiga tautan,
 * dan isi halaman (#konten) sebagai cadangan fokus. `inert` ikut keadaan laci
 * seperti di Sidebar sungguhan.
 */
function Harness({
  open,
  onClose = () => {},
  current = true,
  toggleDisabled = false,
}: {
  open: boolean;
  onClose?: () => void;
  current?: boolean;
  toggleDisabled?: boolean;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  useDrawerFocus({ active: open, containerRef: asideRef, returnRef: toggleRef, onClose });
  return (
    <>
      <button ref={toggleRef} disabled={toggleDisabled}>
        menu
      </button>
      <aside ref={asideRef} inert={!open}>
        <a href="#dashboard">Dashboard</a>
        <a href="#servis" aria-current={current ? 'page' : undefined}>
          Servis
        </a>
        <a href="#kasir">Kasir</a>
      </aside>
      <main id="konten" tabIndex={-1}>
        <input aria-label="isi halaman" />
      </main>
    </>
  );
}

const active = () => document.activeElement;
const link = (name: string) => screen.getByText(name);
const tab = (shiftKey = false) => fireEvent.keyDown(active() ?? document.body, { key: 'Tab', shiftKey });

describe('useDrawerFocus: laci terbuka', () => {
  it('fokus masuk ke tautan halaman yang sedang dibuka', () => {
    const { rerender } = render(<Harness open={false} />);
    rerender(<Harness open />);
    expect(active()).toBe(link('Servis'));
  });

  it('tanpa tautan aktif, fokus masuk ke elemen pertama laci', () => {
    const { rerender } = render(<Harness open={false} current={false} />);
    rerender(<Harness open current={false} />);
    expect(active()).toBe(link('Dashboard'));
  });

  it('Tab dari elemen terakhir berputar ke yang pertama; Shift+Tab dari yang pertama ke yang terakhir', () => {
    render(<Harness open />);
    link('Kasir').focus();
    // fireEvent mengembalikan false bila Tab dibatalkan (preventDefault).
    expect(tab()).toBe(false);
    expect(active()).toBe(link('Dashboard'));
    expect(tab(true)).toBe(false);
    expect(active()).toBe(link('Kasir'));
  });

  it('Tab di tengah daftar tak dibatalkan: browser memilih tetangganya sendiri', () => {
    render(<Harness open />);
    link('Servis').focus();
    expect(tab()).toBe(true);
    expect(tab(true)).toBe(true);
    expect(active()).toBe(link('Servis'));
  });

  it('fokus yang bocor ke halaman ditarik kembali ke laci', () => {
    render(<Harness open />);
    screen.getByLabelText('isi halaman').focus();
    expect(tab()).toBe(false);
    expect(active()).toBe(link('Dashboard'));

    screen.getByLabelText('isi halaman').focus();
    expect(tab(true)).toBe(false);
    expect(active()).toBe(link('Kasir'));
  });

  it('Esc menutup laci; Esc yang sudah ditangani kontrol di dalamnya tidak', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    link('Servis').addEventListener('keydown', (e) => e.preventDefault(), { once: true });
    fireEvent.keyDown(link('Servis'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(link('Servis'), { key: 'Escape' })).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onClose inline yang berganti tiap render tak merebut fokus lagi', () => {
    const { rerender } = render(<Harness open onClose={() => {}} />);
    link('Kasir').focus();
    rerender(<Harness open onClose={() => {}} />);
    expect(active()).toBe(link('Kasir'));
  });
});

describe('useDrawerFocus: laci ditutup', () => {
  it('fokus kembali ke tombol menu', () => {
    const { rerender } = render(<Harness open />);
    link('Kasir').focus();
    rerender(<Harness open={false} />);
    expect(active()).toBe(screen.getByText('menu'));
  });

  it('fokus yang sudah jatuh ke <body> (klik latar) juga kembali ke tombol menu', () => {
    const { rerender } = render(<Harness open />);
    (active() as HTMLElement).blur();
    expect(active()).toBe(document.body);
    rerender(<Harness open={false} />);
    expect(active()).toBe(screen.getByText('menu'));
  });

  it('tak merebut fokus yang sudah pindah ke luar laci', () => {
    const { rerender } = render(<Harness open />);
    screen.getByLabelText('isi halaman').focus();
    rerender(<Harness open={false} />);
    expect(active()).toBe(screen.getByLabelText('isi halaman'));
  });

  it('tombol menu tak bisa difokus (di <=720px disembunyikan): fokus ke isi halaman, bukan hilang', () => {
    const { rerender } = render(<Harness open toggleDisabled />);
    link('Kasir').focus();
    rerender(<Harness open={false} toggleDisabled />);
    expect(active()).toBe(document.getElementById('konten'));
  });
});

describe('useDrawerFocus: tidak aktif (rail desktop)', () => {
  it('Tab dan Esc tak disentuh, fokus tak dipindah', () => {
    const onClose = vi.fn();
    render(<Harness open={false} onClose={onClose} />);
    screen.getByLabelText('isi halaman').focus();
    expect(tab()).toBe(true);
    expect(fireEvent.keyDown(active()!, { key: 'Escape' })).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(active()).toBe(screen.getByLabelText('isi halaman'));
  });
});
