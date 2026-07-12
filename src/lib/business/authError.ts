/**
 * Translate raw Supabase Auth error messages (English) into Indonesian UI copy,
 * so the auth screens stay consistent with the rest of the product. Matching is
 * substring/case-insensitive because supabase-js phrasing varies by version.
 * Unknown messages fall through unchanged — a real (if English) hint beats a lie.
 */
const RULES: { match: RegExp; msg: string }[] = [
  { match: /invalid login credentials/i, msg: 'Email atau password salah.' },
  { match: /email not confirmed/i, msg: 'Email belum dikonfirmasi. Cek kotak masukmu.' },
  { match: /already registered|already been registered/i, msg: 'Email ini sudah terdaftar. Silakan masuk.' },
  { match: /password should be at least|weak.?password/i, msg: 'Password terlalu lemah — minimal 8 karakter, kombinasi huruf & angka.' },
  { match: /rate limit|only request this after|too many requests/i, msg: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
  { match: /unable to validate email|invalid email|email address.*invalid/i, msg: 'Format email tidak valid.' },
  { match: /failed to fetch|networkerror|fetch failed|network request failed/i, msg: 'Gagal terhubung. Periksa koneksi internetmu.' },
  { match: /new password should be different/i, msg: 'Password baru harus berbeda dari yang lama.' },
];

export function mapAuthError(message: string | null | undefined): string {
  if (!message) return 'Terjadi kesalahan. Coba lagi.';
  for (const r of RULES) if (r.match.test(message)) return r.msg;
  return message;
}
