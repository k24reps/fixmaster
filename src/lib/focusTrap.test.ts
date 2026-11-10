import { describe, expect, it } from 'vitest';
import { FOCUSABLE_SELECTOR, trapTarget } from './focusTrap';

describe('trapTarget', () => {
  it('Tab dari elemen terakhir berputar ke yang pertama', () => {
    expect(trapTarget(4, 3, false)).toBe(0);
  });

  it('Shift+Tab dari elemen pertama berputar ke yang terakhir', () => {
    expect(trapTarget(4, 0, true)).toBe(3);
  });

  it('di tengah daftar browser berjalan sendiri (null), ke dua arah', () => {
    expect(trapTarget(4, 1, false)).toBeNull();
    expect(trapTarget(4, 2, true)).toBeNull();
    // Ujung yang berlawanan juga bukan alasan melompat.
    expect(trapTarget(4, 0, false)).toBeNull();
    expect(trapTarget(4, 3, true)).toBeNull();
  });

  it('dari luar daftar: Tab masuk ke ujung yang searah, Shift+Tab ke ujung lawannya', () => {
    expect(trapTarget(4, -1, false)).toBe(0);
    expect(trapTarget(4, -1, true)).toBe(3);
  });

  it('satu elemen: Tab dan Shift+Tab tetap di elemen itu', () => {
    expect(trapTarget(1, 0, false)).toBe(0);
    expect(trapTarget(1, 0, true)).toBe(0);
  });

  it('daftar kosong: tak ada tujuan (pemanggil yang membatalkan Tab)', () => {
    expect(trapTarget(0, -1, false)).toBeNull();
    expect(trapTarget(0, -1, true)).toBeNull();
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('mengecualikan yang dinonaktifkan dan tabindex=-1', () => {
    document.body.innerHTML = `
      <button id="a">a</button>
      <button id="b" disabled>b</button>
      <a id="c" href="#c">c</a>
      <input id="d" />
      <input id="e" disabled />
      <div id="f" tabindex="0"></div>
      <div id="g" tabindex="-1"></div>`;
    const ids = [...document.querySelectorAll(FOCUSABLE_SELECTOR)].map((el) => el.id);
    expect(ids).toEqual(['a', 'c', 'd', 'f']);
    document.body.innerHTML = '';
  });
});
