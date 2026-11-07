import { useCallback, useState } from 'react';

/**
 * Galat validasi form: satu pesan untuk `FormError` di puncak form, plus kolom
 * mana yang menyebabkannya. Dulu hanya pesannya yang tampil; kolomnya tetap
 * bertepi netral, jadi di form panjang pengguna harus mencari sendiri mana
 * yang kurang. `setError` tetap ada untuk galat tanpa kolom (duplikat, server).
 */
export function useFormFault<F extends string>() {
  const [fault, setFault] = useState<{ msg: string; field?: F }>({ msg: '' });
  const setError = useCallback((msg: string) => setFault({ msg }), []);
  const fail = useCallback((field: F, msg: string) => setFault({ msg, field }), []);
  const invalid = (field: F) => fault.msg !== '' && fault.field === field;
  return { error: fault.msg, setError, fail, invalid };
}
