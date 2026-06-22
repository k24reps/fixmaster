/**
 * Pure text helpers for input auto-capitalization. Kept here (not inline in
 * components) so the behaviour is shared and unit-testable.
 */

/** Capitalize the first character if it's a lowercase letter. Caret-safe (in-place). */
export function capitalizeFirst(value: string): string {
  if (!value) return value;
  const ch = value[0];
  return ch === ch.toUpperCase() ? value : ch.toUpperCase() + value.slice(1);
}

/**
 * Capitalize the first non-space character of EACH line. Ideal for "one item
 * per line" fields. Only changes characters that differ, preserving the caret.
 */
export function capitalizeLines(value: string): string {
  return value
    .split('\n')
    .map((line) => {
      const i = line.search(/\S/);
      if (i < 0) return line;
      const ch = line[i];
      return ch === ch.toUpperCase()
        ? line
        : line.slice(0, i) + ch.toUpperCase() + line.slice(i + 1);
    })
    .join('\n');
}

/**
 * Capitalize the first letter of EACH word (Title Case). Ideal for proper
 * nouns: customer names, device names, product/supplier names. Only forces a
 * *lowercase* letter at a word start to upper-case; letters that are already
 * cased mid-word are left as typed (so "iPhone" keeps its casing after the
 * first char). Changes are made in place, preserving the caret position.
 */
export function capitalizeWords(value: string): string {
  let out = '';
  let atWordStart = true;
  for (const ch of value) {
    if (atWordStart && /[a-z]/.test(ch)) {
      out += ch.toUpperCase();
    } else {
      out += ch;
    }
    // A new word starts after whitespace; everything else continues a word.
    atWordStart = /\s/.test(ch);
  }
  return out;
}
