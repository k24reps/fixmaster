import { describe, expect, it } from 'vitest';
import modalRaw from './ServiceModal.tsx?raw';

/**
 * Tanggal masuk mundur (0105): kolomnya hanya milik Pemilik dan hanya tiket baru.
 * Tes ini menjaga bentuk kodenya; penegakan sebenarnya ada di trigger database
 * (tier3l) dan logika tanggalnya di intakeDate.test.ts.
 */
describe('ServiceModal: tanggal masuk mundur', () => {
  it('kolom hanya tampil untuk Pemilik pada tiket baru', () => {
    expect(modalRaw).toContain('const canBackdate = !editing && !!me && isOwner(me.role);');
    const field = modalRaw.indexOf("label={t('serviceForm.intakeDate')}");
    expect(field).toBeGreaterThan(-1);
    // Satu-satunya pemakaian kolom berada di dalam blok `canBackdate &&`.
    const gate = modalRaw.lastIndexOf('{canBackdate && (', field);
    expect(gate).toBeGreaterThan(-1);
    expect(field - gate).toBeLessThan(200);
  });

  it('peran lain tidak pernah mengirim tanggal: validasi dan hasilnya bergantung pada canBackdate', () => {
    expect(modalRaw).toContain('const intake = canBackdate ? resolveIntakeAt(intakeDate, clock) : null;');
  });

  it('tanggal tidak ikut draf, supaya tak terbawa ke tiket berikutnya', () => {
    const snap = modalRaw.slice(modalRaw.indexOf('const snapshot = (): IntakeDraft => ({'));
    const body = snap.slice(0, snap.indexOf('});'));
    expect(body).not.toContain('intakeDate');
    expect(modalRaw).toContain("setIntakeDate('');");
  });

  it('form memakai noValidate: pesan tanggal datang dari FormError, bukan tooltip browser', () => {
    expect(modalRaw).toMatch(/<form\s+id="service-intake"\s+noValidate/);
  });

  it('kolom dibatasi sampai hari ini', () => {
    expect(modalRaw).toContain('max={today}');
  });
});
