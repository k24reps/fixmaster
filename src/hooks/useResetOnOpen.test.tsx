import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { useResetOnOpen } from './useResetOnOpen';

/**
 * Harness sederhana meniru sebuah modal form: state-nya bertahan karena
 * komponennya tidak pernah di-unmount, `open` hanya menyembunyikan.
 */
function Harness({ open, editingId }: { open: boolean; editingId: string | null }) {
  const [value, setValue] = useState('');
  useResetOnOpen(open, editingId ?? 'new', () => setValue(editingId ? `isi-${editingId}` : ''));
  return (
    <>
      <span data-testid="value">{value}</span>
      <button onClick={() => setValue('diketik pengguna')}>ketik</button>
    </>
  );
}

const val = () => screen.getByTestId('value').textContent;
const type = () => act(() => screen.getByText('ketik').click());

describe('useResetOnOpen', () => {
  it('mengosongkan form saat dibuka pertama kali', () => {
    render(<Harness open editingId={null} />);
    expect(val()).toBe('');
  });

  it('mengosongkan LAGI saat "baru" dibuka untuk kedua kalinya', () => {
    // Ini bug yang dilaporkan: simpan servis, buka "Servis Baru" lagi, dan
    // formnya masih berisi input sebelumnya. Kuncinya sama ('new') dua kali,
    // jadi pembanding kunci saja tidak pernah melihat perubahan.
    const { rerender } = render(<Harness open editingId={null} />);
    type();
    expect(val()).toBe('diketik pengguna');

    rerender(<Harness open={false} editingId={null} />); // simpan → tutup
    rerender(<Harness open editingId={null} />); // buka lagi
    expect(val()).toBe('');
  });

  it('membuang perubahan yang dibatalkan saat record yang sama dibuka ulang', () => {
    // Lebih buruk daripada form kotor: edit yang tadi DIBATALKAN hidup lagi
    // dan terlihat seperti data tersimpan.
    const { rerender } = render(<Harness open editingId="s1" />);
    expect(val()).toBe('isi-s1');
    type();

    rerender(<Harness open={false} editingId="s1" />); // batal
    rerender(<Harness open editingId="s1" />);
    expect(val()).toBe('isi-s1');
  });

  it('mengisi ulang saat berpindah antar record', () => {
    const { rerender } = render(<Harness open editingId="s1" />);
    expect(val()).toBe('isi-s1');
    rerender(<Harness open editingId="s2" />);
    expect(val()).toBe('isi-s2');
  });

  it('tidak mengisi ulang pada render biasa selagi terbuka', () => {
    // Kalau ini gagal, setiap ketikan pengguna akan terhapus sendiri.
    const { rerender } = render(<Harness open editingId="s1" />);
    type();
    rerender(<Harness open editingId="s1" />);
    expect(val()).toBe('diketik pengguna');
  });

  it('menunggu sampai kuncinya ada', () => {
    // Modal bisa terbuka sebelum recordnya termuat; kunci null berarti "belum".
    // Propnya TIDAK boleh dinamai `key` — itu prop milik React sendiri dan
    // tidak pernah sampai ke komponen. Test versi pertama saya kena jebakan
    // ini dan gagal karena harness-nya, bukan karena hook-nya.
    function MaybeKey({ open, rowId }: { open: boolean; rowId: string | null | undefined }) {
      const [value, setValue] = useState('awal');
      useResetOnOpen(open, rowId, () => setValue('sudah reset'));
      return <span data-testid="value">{value}</span>;
    }
    const { rerender } = render(<MaybeKey open rowId={null} />);
    expect(val()).toBe('awal');
    rerender(<MaybeKey open rowId="ada" />);
    expect(val()).toBe('sudah reset');
  });

  it('memperlakukan undefined sama dengan null', () => {
    // `record?.id` tanpa `?? null` menghasilkan undefined. Kalau itu lolos,
    // form akan dikosongkan sebelum datanya sempat termuat.
    function MaybeKey({ open, rowId }: { open: boolean; rowId: string | null | undefined }) {
      const [value, setValue] = useState('awal');
      useResetOnOpen(open, rowId, () => setValue('sudah reset'));
      return <span data-testid="value">{value}</span>;
    }
    render(<MaybeKey open rowId={undefined} />);
    expect(val()).toBe('awal');
  });
});
