import { describe, it, expect } from 'vitest';
import { qrMatrix, qrSvg, __test } from './qr';

const { VERSIONS, FORMAT_M, VERSION_INFO, MASKS, dataCapacity, pickVersion, drawFunctionPatterns } =
  __test;

/**
 * Pembaca balik — hanya untuk pengujian. Menempuh jalur yang sama persis
 * dengan encoder tapi berlawanan arah: baca mask dari bit format, lepas
 * mask-nya, telusuri zigzag mundur, urai interleaving, lalu baca header mode
 * dan panjangnya. Kalau teks aslinya kembali utuh, berarti penempatan modul,
 * masking, urutan bit, dan pembagian bloknya konsisten.
 *
 * Parity Reed-Solomon sengaja tidak diverifikasi di sini: pemindai memakainya
 * untuk MEMPERBAIKI modul rusak, jadi ia tidak menentukan apakah simbol yang
 * bersih terbaca. Itu diuji terpisah lewat sifat aljabarnya.
 */
function decode(matrix: boolean[][]): string {
  const size = matrix.length;
  const version = (size - 17) / 4;
  const { reserved } = drawFunctionPatterns(version);

  let format = 0;
  for (let i = 0; i < 15; i++) {
    let bit: boolean;
    if (i < 6) bit = matrix[8][i];
    else if (i === 6) bit = matrix[8][7];
    else if (i === 7) bit = matrix[8][8];
    else if (i === 8) bit = matrix[7][8];
    else bit = matrix[14 - i][8];
    if (bit) format |= 1 << i;
  }
  const mask = FORMAT_M.indexOf(format);
  if (mask < 0) throw new Error('bit format tidak dikenali: 0x' + format.toString(16));

  const plain = matrix.map((row, y) =>
    row.map((cell, x) => (reserved[y][x] ? cell : cell !== MASKS[mask](y, x))),
  );

  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (!reserved[y][x]) bits.push(plain[y][x] ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const stream: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    stream.push(byte);
  }

  const sizes = VERSIONS[version].groups.flatMap(([count, len]: [number, number]) =>
    new Array<number>(count).fill(len),
  );
  const blocks: number[][] = sizes.map(() => []);
  let idx = 0;
  const longest = Math.max(...sizes);
  for (let i = 0; i < longest; i++) {
    for (let b = 0; b < sizes.length; b++) {
      if (i < sizes[b]) blocks[b].push(stream[idx++]);
    }
  }
  const data = blocks.flat();

  const flat: number[] = [];
  for (const byte of data) for (let j = 7; j >= 0; j--) flat.push((byte >> j) & 1);
  const take = (count: number) => {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | flat.shift()!;
    return value;
  };

  expect(take(4), 'indikator mode harus byte').toBe(0b0100);
  const length = take(version < 10 ? 8 : 16);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = take(8);
  return new TextDecoder().decode(bytes);
}

describe('qrMatrix — bolak-balik', () => {
  const samples = [
    'A',
    'https://fixmaster.app/track?org=abc&no=FM-0001',
    'https://fixmaster.app/track?org=3f2b9c14-8d7e-4a51-9b0c-6e2d5a1f7c33&no=FM-0241',
    'Nota servis — perangkat: MacBook Pro 13" 2019 · Rp 1.500.000 · garansi 30 hari',
    'x'.repeat(180),
  ];

  for (const text of samples) {
    it(`memulihkan ${text.length} karakter`, () => {
      expect(decode(qrMatrix(text))).toBe(text);
    });
  }

  it('menaikkan versi mengikuti panjang data, bukan angka bulat', () => {
    expect(qrMatrix('A').length).toBe(21); // versi 1
    expect(qrMatrix('x'.repeat(180)).length).toBeGreaterThan(21);
  });

  it('menolak data yang melebihi kapasitas alih-alih memotongnya', () => {
    expect(() => qrMatrix('x'.repeat(300))).toThrow(/terlalu panjang/);
  });
});

describe('qrMatrix — pola tetap', () => {
  const m = qrMatrix('https://fixmaster.app/track?org=abc&no=FM-0001');
  const size = m.length;

  it('menempatkan tiga pola pencari, bukan empat', () => {
    // Cincin luar gelap, cincin tengah terang, inti gelap.
    for (const [oy, ox] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      expect(m[oy][ox], `sudut ${oy},${ox}`).toBe(true);
      expect(m[oy + 1][ox + 1]).toBe(false);
      expect(m[oy + 3][ox + 3]).toBe(true);
    }
  });

  it('memisahkan tiap pola pencari dengan jalur terang selebar satu modul', () => {
    // Tanpa pemisah ini pemindai tidak bisa mengunci sudut simbol.
    for (let i = 0; i <= 7; i++) {
      expect(m[7][i], `pemisah bawah kiri-atas, kolom ${i}`).toBe(false);
      expect(m[i][7], `pemisah kanan kiri-atas, baris ${i}`).toBe(false);
      expect(m[7][size - 1 - i], `pemisah bawah kanan-atas, kolom ${i}`).toBe(false);
      expect(m[size - 1 - i][7], `pemisah kanan kiri-bawah, baris ${i}`).toBe(false);
    }
  });

  it('pola pewaktu berselang-seling dan modul gelap selalu menyala', () => {
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i], `pewaktu baris kolom ${i}`).toBe(i % 2 === 0);
      expect(m[i][6], `pewaktu kolom baris ${i}`).toBe(i % 2 === 0);
    }
    expect(m[size - 8][8]).toBe(true);
  });
});

describe('kapasitas versi', () => {
  // Total codeword tiap versi level M adalah angka tetap di spesifikasi;
  // kalau tabel blok salah ketik, jumlah ini yang pertama meleset.
  const totalCodewords: Record<number, number> = {
    1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346,
  };

  it('jumlah data + koreksi galat cocok dengan spesifikasi', () => {
    for (let v = 1; v <= 10; v++) {
      const spec = VERSIONS[v];
      const blocks = spec.groups.reduce((n: number, [count]: [number, number]) => n + count, 0);
      expect(dataCapacity(v) + blocks * spec.ec, `versi ${v}`).toBe(totalCodewords[v]);
    }
  });

  it('memilih versi terkecil yang muat', () => {
    expect(pickVersion(10)).toBe(1);
    expect(pickVersion(16)).toBe(2); // 16 byte + header 12 bit > kapasitas v1
    expect(pickVersion(50)).toBe(4);
  });
});

describe('qrSvg', () => {
  it('menggambar seluruh modul sebagai satu path', () => {
    const svg = qrSvg('https://fixmaster.app/track?org=abc&no=FM-0001');
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('role="img"');
  });

  it('menyertakan quiet zone di viewBox, bukan hanya di margin CSS', () => {
    const modules = qrMatrix('A').length;
    const svg = qrSvg('A', { margin: 4 });
    expect(svg).toContain(`viewBox="0 0 ${modules + 8} ${modules + 8}"`);
  });
});

/**
 * Tabel bit format dan versi ditulis sebagai konstanta di encoder karena BCH-
 * nya tidak pernah berubah. Konstanta hasil salin-tempel adalah tempat salah
 * ketik paling mudah bersembunyi — dan salah satu bit saja membuat pemindai
 * gagal menemukan mask, meski uji bolak-balik di atas tetap hijau (ia memakai
 * tabel yang sama). Jadi di sini nilainya diturunkan ulang lewat BCH.
 */
describe('tabel BCH', () => {
  it('bit informasi format cocok dengan BCH(15,5) level M', () => {
    for (let mask = 0; mask < 8; mask++) {
      const data = (0b00 << 3) | mask; // 0b00 = level koreksi M
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
      const expected = (((data << 10) | rem) ^ 0x5412) & 0x7fff;
      expect(FORMAT_M[mask], String(mask)).toBe(expected);
    }
  });

  it('bit informasi versi cocok dengan BCH(18,6)', () => {
    for (let v = 7; v <= 10; v++) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
      expect(VERSION_INFO[v], String(v)).toBe((v << 12) | rem);
    }
  });
});
