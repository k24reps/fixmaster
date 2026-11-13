import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { Input } from './Input';

afterEach(cleanup);

function Search({ onEsc }: { onEsc?: () => void }) {
  const [q, setQ] = useState('');
  return (
    <div onKeyDown={(e) => e.key === 'Escape' && onEsc?.()}>
      <Input aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ('')} clearLabel="Hapus pencarian" />
    </div>
  );
}

describe('Input: tombol hapus isi', () => {
  it('tampil hanya selama kolom berisi, mengosongkan, lalu fokus kembali ke kolom', () => {
    render(<Search />);
    const input = screen.getByLabelText('Cari') as HTMLInputElement;
    expect(screen.queryByRole('button', { name: 'Hapus pencarian' })).toBeNull();

    fireEvent.change(input, { target: { value: 'Reno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hapus pencarian' }));

    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('button', { name: 'Hapus pencarian' })).toBeNull();
  });

  it('Esc mengosongkan kolom berisi tanpa diteruskan; kolom kosong meneruskan Esc', () => {
    let escaped = 0;
    render(<Search onEsc={() => (escaped += 1)} />);
    const input = screen.getByLabelText('Cari') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Reno' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(escaped).toBe(0);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(escaped).toBe(1);
  });

  it('kolom password tetap memakai tombol mata, bukan tombol hapus', () => {
    render(<Input aria-label="Sandi" type="password" revealable value="rahasia" onChange={() => {}} onClear={() => {}} clearLabel="Hapus" />);
    expect(screen.queryByRole('button', { name: 'Hapus' })).toBeNull();
  });
});
