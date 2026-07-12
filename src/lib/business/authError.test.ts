import { describe, it, expect } from 'vitest';
import { mapAuthError } from './authError';

describe('mapAuthError', () => {
  it('translates known Supabase messages to Indonesian', () => {
    expect(mapAuthError('Invalid login credentials')).toMatch(/salah/);
    expect(mapAuthError('User already registered')).toMatch(/sudah terdaftar/);
    expect(mapAuthError('Email rate limit exceeded')).toMatch(/percobaan/);
    expect(mapAuthError('Unable to validate email address: invalid format')).toMatch(/tidak valid/);
    expect(mapAuthError('Failed to fetch')).toMatch(/terhubung/);
  });

  it('falls through unknown messages unchanged', () => {
    expect(mapAuthError('Some novel error')).toBe('Some novel error');
  });

  it('handles null/empty with a generic fallback', () => {
    expect(mapAuthError(null)).toMatch(/kesalahan/);
    expect(mapAuthError('')).toMatch(/kesalahan/);
  });
});
