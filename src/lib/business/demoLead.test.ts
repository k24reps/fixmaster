import { describe, it, expect } from 'vitest';
import migration from '../../../supabase/migrations/0102_demo_leads.sql?raw';
import {
  DEMO_LEAD_RETENTION_DAYS,
  ID_MOBILE_PATTERN,
  SHOP_NAME_MAX,
  SHOP_NAME_MIN,
  cleanShopName,
  demoLeadErrors,
  normalizeIdPhone,
} from './demoLead';

describe('normalizeIdPhone', () => {
  it.each([
    ['0812-3456-7890', '6281234567890'],
    ['+62 812 3456 7890', '6281234567890'],
    ['62 0812 3456 7890', '6281234567890'],
    ['812 3456 7890', '6281234567890'],
    ['0812345678', '62812345678'],
    ['0812 3456 78901', '62812345678901'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeIdPhone(raw)).toBe(expected);
  });

  it.each(['', '12345', '021-555-1234', '0812-345', '0812 3456 7890 123', '0800 1234 5678'])(
    'menolak %s',
    (raw) => {
      expect(normalizeIdPhone(raw)).toBeNull();
    },
  );
});

describe('demoLeadErrors', () => {
  it('lolos untuk isian wajar', () => {
    expect(demoLeadErrors({ shopName: 'Sinar Servis', phone: '0812-3456-7890' })).toEqual({});
  });

  it('nama terlalu pendek, terlalu panjang, atau berisi tautan', () => {
    expect(demoLeadErrors({ shopName: ' a ', phone: '081234567890' }).shopName).toBe(
      'demoGate.errorNameShort',
    );
    expect(demoLeadErrors({ shopName: 'x'.repeat(61), phone: '081234567890' }).shopName).toBe(
      'demoGate.errorNameLong',
    );
    expect(demoLeadErrors({ shopName: 'www.toko.id', phone: '081234567890' }).shopName).toBe(
      'demoGate.errorNameLink',
    );
    expect(demoLeadErrors({ shopName: 'Toko <b>', phone: '081234567890' }).shopName).toBe(
      'demoGate.errorNameLink',
    );
  });

  it('nomor bukan seluler Indonesia', () => {
    expect(demoLeadErrors({ shopName: 'Sinar Servis', phone: '021 555 1234' }).phone).toBe(
      'demoGate.errorPhone',
    );
  });

  it('merapikan spasi seperti server', () => {
    expect(cleanShopName('  Sinar   Servis  ')).toBe('Sinar Servis');
  });
});

// Server dan klien memegang aturan masing-masing. Tes ini membaca migrasinya
// supaya perubahan di satu sisi langsung memerahkan sisi lainnya.
describe('aturan gerbang sama dengan migrasi 0102', () => {
  it('pola nomor', () => {
    expect(migration).toContain(`phone ~ '${ID_MOBILE_PATTERN}'`);
    expect(migration).toContain(`v_phone !~ '${ID_MOBILE_PATTERN}'`);
  });

  it('panjang nama toko', () => {
    expect(migration).toContain(`char_length(shop_name) between ${SHOP_NAME_MIN} and ${SHOP_NAME_MAX}`);
    expect(migration).toContain(`char_length(v_name) < ${SHOP_NAME_MIN} or char_length(v_name) > ${SHOP_NAME_MAX}`);
  });

  it('retensi 90 hari yang dijanjikan /privacy', () => {
    expect(migration).toContain(
      `last_seen_at < now() - interval '${DEMO_LEAD_RETENTION_DAYS} days'`,
    );
  });
});
