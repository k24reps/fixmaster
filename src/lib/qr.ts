/**
 * Encoder QR minimal — mode byte, koreksi galat level M, versi 1–10.
 *
 * Ditulis sendiri alih-alih menarik dependensi: yang dibutuhkan produk ini
 * cuma satu bentuk (URL lacak, ±80 karakter ASCII) pada satu level koreksi,
 * dan hasilnya dicetak ke kertas, bukan dirender di aplikasi. Level M dipilih
 * karena nota termal gampang kotor dan buram — M memulihkan ±15% modul yang
 * rusak, cukup untuk noda tinta tanpa memperbesar simbolnya berlebihan.
 *
 * Batas versi 10 (57×57 modul, 213 byte) disengaja: di atas itu simbolnya
 * terlalu rapat untuk lebar nota 58mm, dan URL lacak tidak pernah sepanjang
 * itu. Melebihi kapasitas melempar galat, bukan diam-diam memotong data.
 */

// ---------- GF(256), polinomial primitif 0x11D ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Polinomial generator Reed-Solomon berderajat `degree`: ∏(x + α^i). */
function rsGenerator(degree: number): Uint8Array {
  let poly = Uint8Array.from([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Sisa pembagian data terhadap generator — itulah codeword koreksi galat. */
function rsRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(ecLen);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

// ---------- Tabel versi (level M saja) ----------

interface VersionSpec {
  /** Codeword koreksi galat per blok. */
  ec: number;
  /** [jumlah blok, codeword data per blok] — dua grup untuk versi campuran. */
  groups: [number, number][];
  /** Titik pusat pola perataan (kombinasi baris × kolom). */
  align: number[];
  /** Bit sisa yang ditambahkan setelah interleaving. */
  remainder: number;
}

const VERSIONS: Record<number, VersionSpec> = {
  1: { ec: 10, groups: [[1, 16]], align: [], remainder: 0 },
  2: { ec: 16, groups: [[1, 28]], align: [6, 18], remainder: 7 },
  3: { ec: 26, groups: [[1, 44]], align: [6, 22], remainder: 7 },
  4: { ec: 18, groups: [[2, 32]], align: [6, 26], remainder: 7 },
  5: { ec: 24, groups: [[2, 43]], align: [6, 30], remainder: 7 },
  6: { ec: 16, groups: [[4, 27]], align: [6, 34], remainder: 7 },
  7: { ec: 18, groups: [[4, 31]], align: [6, 22, 38], remainder: 0 },
  8: { ec: 22, groups: [[2, 38], [2, 39]], align: [6, 24, 42], remainder: 0 },
  9: { ec: 22, groups: [[3, 36], [2, 37]], align: [6, 26, 46], remainder: 0 },
  10: { ec: 26, groups: [[4, 43], [1, 44]], align: [6, 28, 50], remainder: 0 },
};

/** Bit informasi format (level M) untuk mask 0–7, sudah termasuk BCH + XOR. */
const FORMAT_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

/** Bit informasi versi (BCH 18-bit), hanya dipakai mulai versi 7. */
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

function dataCapacity(version: number): number {
  return VERSIONS[version].groups.reduce((sum, [count, size]) => sum + count * size, 0);
}

/** Versi terkecil yang muat. Indikator panjang jadi 16 bit mulai versi 10. */
function pickVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const header = 4 + (v < 10 ? 8 : 16);
    if (byteLen * 8 + header <= dataCapacity(v) * 8) return v;
  }
  throw new Error('QR: data terlalu panjang (maksimum versi 10, level M)');
}

// ---------- Aliran bit ----------

function toCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const bits: number[] = [];
  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // mode byte
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const capacityBits = dataCapacity(version) * 8;
  // Terminator maksimal 4 bit, lalu rata ke batas byte.
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(dataCapacity(version));
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
    out[i] = byte;
  }
  // Byte pengisi bergantian, sesuai spesifikasi.
  for (let i = bits.length / 8; i < out.length; i++) {
    out[i] = i % 2 === (bits.length / 8) % 2 ? 0xec : 0x11;
  }
  return out;
}

/** Pecah jadi blok, hitung EC tiap blok, lalu interleave keduanya. */
function interleave(codewords: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version];
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i++) {
      const block = codewords.subarray(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(rsRemainder(block, spec.ec));
    }
  }

  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return Uint8Array.from(out);
}

// ---------- Matriks ----------

type Grid = boolean[][];

function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

/**
 * Gambar semua pola tetap (pencari, pemisah, perataan, pewaktu, modul gelap)
 * dan tandai area yang tidak boleh diisi data — termasuk area informasi
 * format dan versi yang isinya ditulis belakangan.
 */
function drawFunctionPatterns(version: number): { matrix: Grid; reserved: Grid } {
  const size = 17 + 4 * version;
  const matrix = emptyGrid(size);
  const reserved = emptyGrid(size);

  const set = (y: number, x: number, dark: boolean) => {
    matrix[y][x] = dark;
    reserved[y][x] = true;
  };

  // Pola pencari + pemisahnya, di tiga sudut.
  for (const [oy, ox] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const y = oy + dy;
        const x = ox + dx;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const ring = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
        set(y, x, ring !== 2 && ring <= 3);
      }
    }
  }

  // Pola perataan, kecuali yang bertabrakan dengan pola pencari.
  const centers = VERSIONS[version].align;
  for (const cy of centers) {
    for (const cx of centers) {
      const nearFinder =
        (cy <= 8 && cx <= 8) || (cy <= 8 && cx >= size - 9) || (cy >= size - 9 && cx <= 8);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(cy + dy, cx + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
        }
      }
    }
  }

  // Pola pewaktu pada baris dan kolom 6.
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Modul gelap yang selalu menyala.
  set(size - 8, 8, true);

  // Area informasi format: dicadangkan sekarang, diisi setelah mask dipilih.
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // Informasi versi (dua blok 3×6) mulai versi 7.
  if (version >= 7) {
    const info = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
      const bit = ((info >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(b, a, bit);
      set(a, b, bit);
    }
  }

  return { matrix, reserved };
}

/** Isi modul data dengan pola zigzag dua kolom dari kanan bawah ke atas. */
function placeData(matrix: Grid, reserved: Grid, bytes: Uint8Array): void {
  const size = matrix.length;
  let bit = 0;
  const nextBit = (): boolean => {
    const byteIndex = bit >> 3;
    const value = byteIndex < bytes.length ? (bytes[byteIndex] >> (7 - (bit & 7))) & 1 : 0;
    bit++;
    return value === 1;
  };

  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    // Kolom 6 adalah pewaktu vertikal — lompati seluruh kolomnya.
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (!reserved[y][x]) matrix[y][x] = nextBit();
      }
    }
    upward = !upward;
  }
}

const MASKS: ((y: number, x: number) => boolean)[] = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

function applyMask(matrix: Grid, reserved: Grid, mask: number): Grid {
  const fn = MASKS[mask];
  return matrix.map((row, y) => row.map((cell, x) => (reserved[y][x] ? cell : cell !== fn(y, x))));
}

function writeFormat(matrix: Grid, mask: number): void {
  const size = matrix.length;
  const bits = FORMAT_M[mask];
  for (let i = 0; i < 15; i++) {
    const dark = ((bits >> i) & 1) === 1;
    // Salinan pertama: mengitari pola pencari kiri atas.
    if (i < 6) matrix[8][i] = dark;
    else if (i === 6) matrix[8][7] = dark;
    else if (i === 7) matrix[8][8] = dark;
    else if (i === 8) matrix[7][8] = dark;
    else matrix[14 - i][8] = dark;
    // Salinan kedua: terbelah antara kanan atas dan kiri bawah.
    if (i < 8) matrix[8][size - 1 - i] = dark;
    else matrix[size - 15 + i][8] = dark;
  }
}

/** Penalti pemilihan mask sesuai empat aturan spesifikasi. */
function penalty(matrix: Grid): number {
  const size = matrix.length;
  let score = 0;

  // Aturan 1 — deret sewarna sepanjang 5 modul atau lebih.
  for (let i = 0; i < size; i++) {
    for (const read of [(k: number) => matrix[i][k], (k: number) => matrix[k][i]]) {
      let run = 1;
      for (let k = 1; k < size; k++) {
        if (read(k) === read(k - 1)) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }

  // Aturan 2 — blok 2×2 sewarna.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = matrix[y][x];
      if (c === matrix[y][x + 1] && c === matrix[y + 1][x] && c === matrix[y + 1][x + 1]) score += 3;
    }
  }

  // Aturan 3 — pola 1:1:3:1:1 yang menyerupai pola pencari.
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (read: (k: number) => boolean, start: number, pattern: boolean[]) => {
    for (let k = 0; k < pattern.length; k++) if (read(start + k) !== pattern[k]) return false;
    return true;
  };
  for (let i = 0; i < size; i++) {
    for (const read of [(k: number) => matrix[i][k], (k: number) => matrix[k][i]]) {
      for (let start = 0; start + 11 <= size; start++) {
        if (matches(read, start, A) || matches(read, start, B)) score += 40;
      }
    }
  }

  // Aturan 4 — penyimpangan proporsi modul gelap dari 50%.
  let dark = 0;
  for (const row of matrix) for (const cell of row) if (cell) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/**
 * Matriks QR untuk `text`. `true` berarti modul gelap. Tanpa quiet zone —
 * penambahan marginnya urusan perender, karena satuannya berbeda per media.
 */
export function qrMatrix(text: string): Grid {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const payload = interleave(toCodewords(bytes, version), version);
  const { matrix, reserved } = drawFunctionPatterns(version);
  placeData(matrix, reserved, payload);

  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = applyMask(matrix, reserved, mask);
    writeFormat(candidate, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best as Grid;
}

export interface QrSvgOptions {
  /** Sisi simbol dalam px (tanpa satuan di atribut, agar bisa dipakai di CSS). */
  size?: number;
  /** Quiet zone dalam satuan modul. Spesifikasi menuntut minimal 4. */
  margin?: number;
  /** Warna modul gelap. Dokumen cetak tidak punya token, jadi nilainya literal. */
  dark?: string;
}

/**
 * SVG mandiri, tanpa dependensi perender. Semua modul digambar sebagai satu
 * `<path>` supaya nota yang dicetak tidak berisi ribuan elemen — printer
 * termal murah tersendat pada dokumen dengan node sebanyak itu.
 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { size = 132, margin = 4, dark = '#000000' } = options;
  const matrix = qrMatrix(text);
  const modules = matrix.length;
  const side = modules + margin * 2;

  let path = '';
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (matrix[y][x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ` +
    `width="${size}" height="${size}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="Kode QR menuju halaman lacak servis">` +
    `<path fill="${dark}" d="${path}"/></svg>`
  );
}

/** Dibuka untuk pengujian; bukan bagian dari API yang dipakai fitur. */
export const __test = {
  VERSIONS,
  FORMAT_M,
  VERSION_INFO,
  MASKS,
  dataCapacity,
  pickVersion,
  toCodewords,
  interleave,
  drawFunctionPatterns,
};
