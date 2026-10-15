/** Text helpers shared by the chapter film and the page-flip reader. */

const SENTENCE = /[^.!?…]+(?:[.!?…]+["»”')\]]*|$)\s*/g;

function splitSentences(paragraph: string): string[] {
  return (paragraph.match(SENTENCE) ?? []).map((item) => item.trim()).filter(Boolean);
}

function splitLongSentence(sentence: string, maxChars: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const word of sentence.split(/\s+/)) {
    if (current && current.length + word.length + 1 > maxChars) {
      parts.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Split a story into pages of at most `maxChars`, breaking between sentences
 * (or words, for a very long sentence). Paragraph breaks are kept as `\n`
 * unless `flatten` joins everything into one flowing text.
 */
export function paginateText(text: string, maxChars: number, { flatten = false } = {}): string[] {
  const paragraphs = text.split(/\n\s*\n|\n/).map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const units: { text: string; paragraphStart: boolean }[] = [];
  paragraphs.forEach((paragraph) => {
    splitSentences(paragraph).forEach((sentence, index) => {
      splitLongSentence(sentence, maxChars).forEach((part, partIndex) => {
        units.push({ text: part, paragraphStart: index === 0 && partIndex === 0 });
      });
    });
  });
  const pages: string[] = [];
  let current = '';
  units.forEach(({ text: unit, paragraphStart }) => {
    const separator = !current ? '' : paragraphStart && !flatten ? '\n' : ' ';
    if (current && current.length + separator.length + unit.length > maxChars) {
      pages.push(current);
      current = unit;
    } else {
      current += separator + unit;
    }
  });
  if (current) pages.push(current);
  return pages;
}

/** Seconds a viewer comfortably needs to read a caption on screen. */
export function readingSeconds(text: string, { min = 4.5, max = 15 } = {}): number {
  const seconds = 2.5 + text.replace(/\s+/g, ' ').trim().length / 16;
  return Math.round(Math.min(max, Math.max(min, seconds)) * 10) / 10;
}

const ORDINALS = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая', 'восьмая', 'девятая', 'десятая',
  'одиннадцатая', 'двенадцатая', 'тринадцатая', 'четырнадцатая', 'пятнадцатая', 'шестнадцатая', 'семнадцатая',
  'восемнадцатая', 'девятнадцатая', 'двадцатая'];

/** «Глава первая», «Глава двадцать первая» falls back to «Глава 21». */
export function chapterLabel(order: number): string {
  const word = Number.isInteger(order) && order >= 1 ? ORDINALS[order - 1] : undefined;
  return word ? 'Глава ' + word : 'Глава ' + order;
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value);
  let rest = value;
  return ROMAN.reduce((result, [amount, symbol]) => {
    while (rest >= amount) { result += symbol; rest -= amount; }
    return result;
  }, '');
}

/** Deterministic 0..1 value for a string, so a scene always animates the same way. */
export function seededRandom(seed: string, salt = 0): number {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}
