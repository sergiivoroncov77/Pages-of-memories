import { splitStoryParagraphs } from '../../lib/storyText';

export interface StoryTextPage {
  text: string;
  /** The first line continues the same author line from the preceding page. */
  startsMidParagraph: boolean;
  /** The author's line/paragraph boundary (or a plain space) that fell between pages. */
  separatorBefore: '' | ' ' | '\n' | '\n\n';
}

/**
 * "Does this part fit on its page?" The caller knows what else is on the page
 * (heading, players, other sections); `last` tells whether the part ends the text,
 * because the last part also carries the signature.
 */
export type PartFits = (part: StoryTextPage, index: number, last: boolean) => boolean;

export interface PaginationHint {
  /** About how many characters a full page holds; learned as pages are laid out. */
  chars: number;
}

export interface PaginateOptions {
  hint?: PaginationHint;
  /** About how many characters make a line: a new paragraph is not left with less than a line at the page bottom. */
  lineChars?: number;
  /**
   * The first page has something above the words (a heading, players). When less
   * than about two lines of text would fit under it, the words start on the next
   * page instead of leaving a word or a lone line there.
   */
  emptyFirstPage?: boolean;
}

/** Blank lines start paragraphs; a single line break starts a new line of the same block. */
export function storyParagraphs(text: string): string[] {
  return splitStoryParagraphs(text)
    .map((paragraph) => paragraph.split('\n').map((line) => line.replace(/[\t ]+/g, ' ').trim()).join('\n'));
}

// The same line markers the story markup understands (see lib/storyMarkup).
const HEADING = /^##\s+/;
const BULLET = /^[•▪◦]\s+/;
const NUMBER = /^\d{1,2}[.)]\s+/;
const QUOTE = /^>\s?/;
const BLOCK_START = /^(##\s|[•▪◦]\s|\d{1,2}[.)]\s|>)/;

type LineKind = 'text' | 'heading' | 'bullet' | 'number' | 'quote';

function lineKind(line: string): { kind: LineKind; prefix: number } {
  for (const [kind, pattern] of [['heading', HEADING], ['bullet', BULLET], ['number', NUMBER], ['quote', QUOTE]] as const) {
    const match = pattern.exec(line);
    if (match) return { kind, prefix: match[0].length };
  }
  return { kind: 'text', prefix: 0 };
}

const MARKERS = ['**', '__', '++', '*'];

/** The markers that are open (and have their pair) at `pos` of a line's text, in the order they were opened. */
export function openMarkersAt(line: string, pos: number): string[] {
  const tokens: { at: number; length: number; token: string }[] = [];
  for (let i = 0; i < line.length;) {
    const token = MARKERS.find((item) => line.startsWith(item, i));
    if (token && !(token === '*' && /\w/.test(line[i - 1] ?? '') && /\w/.test(line[i + 1] ?? ''))) {
      tokens.push({ at: i, length: token.length, token });
      i += token.length;
    } else i += 1;
  }
  const open = new Map<string, number>();
  const paired = new Set<number>();
  tokens.forEach((item, index) => {
    const start = open.get(item.token);
    if (start === undefined) open.set(item.token, index);
    else { paired.add(start); paired.add(index); open.delete(item.token); }
  });
  const active: string[] = [];
  tokens.forEach((item, index) => {
    if (!paired.has(index) || item.at + item.length > pos) return;
    const at = active.indexOf(item.token);
    if (at >= 0) active.splice(at, 1);
    else active.push(item.token);
  });
  return active;
}

interface Cut {
  /** Index of the separator in the text. */
  at: number;
  /** Where the text after the separator starts. */
  next: number;
  sep: ' ' | '\n' | '\n\n';
  lineStart: number;
  lineEnd: number;
  kind: LineKind;
  prefix: number;
}

/** Every place the text may be cut: between lines and paragraphs, and between words. */
function findCuts(text: string, limit: number): Cut[] {
  const cuts: Cut[] = [];
  let lineStart = 0;
  const lineAt = (start: number) => {
    const end = text.indexOf('\n', start);
    return { end: end < 0 ? text.length : end, ...lineKind(text.slice(start, end < 0 ? undefined : end)) };
  };
  let line = lineAt(0);
  for (let i = 0; i < text.length && i <= limit; i += 1) {
    const char = text[i];
    if (char === '\n') {
      const paragraph = text[i + 1] === '\n';
      const next = paragraph ? i + 2 : i + 1;
      cuts.push({ at: i, next, sep: paragraph ? '\n\n' : '\n', lineStart, lineEnd: line.end, kind: line.kind, prefix: line.prefix });
      i = next - 1;
      lineStart = next;
      line = lineAt(lineStart);
    } else if (char === ' ') {
      cuts.push({ at: i, next: i + 1, sep: ' ', lineStart, lineEnd: line.end, kind: line.kind, prefix: line.prefix });
    }
  }
  return cuts;
}

/** Plain lines are cut at any word; headings, lists and quotes only between lines, unless a line alone is too long. */
function allowed(text: string, cut: Cut, relaxed: boolean): boolean {
  if (cut.sep !== ' ') return true;
  // Nothing of the line (past its marker) would stay on this page.
  if (cut.at <= cut.lineStart + cut.prefix) return false;
  if (cut.kind !== 'text') return relaxed;
  // The rest of the line must not start to look like a heading, list item or quote.
  return !BLOCK_START.test(text.slice(cut.next, cut.next + 6)) || openMarkersAt(text.slice(cut.lineStart, cut.lineEnd), cut.at - cut.lineStart).length > 0;
}

/** The two sides of a cut: formatting open at a word cut is closed on this page and reopened on the next. */
function split(text: string, cut: Cut): { head: string; tail: string } {
  if (cut.sep !== ' ') return { head: text.slice(0, cut.at), tail: text.slice(cut.next) };
  const open = openMarkersAt(text.slice(cut.lineStart + cut.prefix, cut.lineEnd), cut.at - cut.lineStart - cut.prefix);
  const reopen = (cut.kind === 'heading' ? '## ' : cut.kind === 'quote' ? '> ' : '') + open.join('');
  return { head: text.slice(0, cut.at) + [...open].reverse().join(''), tail: reopen + text.slice(cut.next) };
}

function lastAtMost(list: Cut[], chars: number): number {
  let found = -1;
  for (let i = 0; i < list.length && list[i].at <= chars; i += 1) found = i;
  return found;
}

/**
 * The index of the last cut that fits, by galloping from a guess and then
 * bisecting; -1 when none does. `fits` is assumed to be monotonic.
 */
function longestFit(count: number, start: number, fits: (index: number) => boolean): number {
  const seen = new Map<number, boolean>();
  const test = (index: number) => {
    let result = seen.get(index);
    if (result === undefined) { result = fits(index); seen.set(index, result); }
    return result;
  };
  let low = -1;
  let high = count;
  let probe = Math.min(Math.max(0, start), count - 1);
  let step = Math.max(1, Math.round((probe + 1) * 0.06));
  for (let guard = 0; high - low > 1 && guard < 48; guard += 1) {
    if (test(probe)) {
      low = probe;
      probe = high === count ? Math.min(count - 1, probe + step) : (low + high) >> 1;
    } else {
      high = probe;
      probe = low < 0 ? Math.max(0, probe - step) : (low + high) >> 1;
    }
    step *= 2;
  }
  return low;
}

/**
 * Cut a story into pages. Each page takes the longest run of words for which
 * `fits` says the page still fits, so pages are as full as the real page allows.
 * A paragraph starting in the last line of a page moves to the next one, a few
 * words are never left alone at the top of the next page, and a heading never
 * ends a page. Only the author's own line breaks are written into `text`; a cut
 * between words is recorded in `separatorBefore`, so resizing never turns it
 * into a new paragraph. The generator yields after each page so a caller can
 * give the screen a moment between pages.
 */
export function* paginateStoryPages(text: string, fits: PartFits, options: PaginateOptions = {}): Generator<void, StoryTextPage[]> {
  let remaining = storyParagraphs(text).join('\n\n');
  const pages: StoryTextPage[] = [];
  const hint = options.hint ?? { chars: 500 };
  const lineChars = options.lineChars ?? 36;
  let startsMidParagraph = false;
  let separatorBefore: StoryTextPage['separatorBefore'] = '';
  let growth = 1;
  while (remaining) {
    const index = pages.length;
    const part = (value: string): StoryTextPage => ({ text: value, startsMidParagraph, separatorBefore });
    const cap = Math.max(200, hint.chars * 2.5 * growth);
    if (remaining.length <= cap && fits(part(remaining), index, true)) {
      pages.push(part(remaining));
      break;
    }
    const cuts = findCuts(remaining, cap);
    const reachable = cuts.length > 0 && remaining.length > cap;
    let list = cuts.filter((cut) => allowed(remaining, cut, false));
    let found = -1;
    const search = () => longestFit(list.length, lastAtMost(list, hint.chars * growth),
      (at) => fits(part(split(remaining, list[at]).head), index, false));
    if (list.length) found = search();
    if (found < 0) {
      // A line, item or word that alone is wider than the page: cut it where it fits.
      list = cuts.filter((cut) => allowed(remaining, cut, true));
      if (list.length) found = search();
    }
    if (found >= 0 && found === list.length - 1 && reachable) {
      // Every cut we looked at fits: the guess was too small.
      growth *= 2.5;
      continue;
    }
    growth = 1;
    if (index === 0 && options.emptyFirstPage && (found < 0 || list[found].at < lineChars * 1.5)) {
      pages.push(part(''));
      yield;
      continue;
    }
    // Nothing fits (an unbreakable word, or a page too small): take the first cut and move on.
    let chosen = found >= 0 ? found : 0;
    if (!list.length) {
      pages.push(part(remaining));
      break;
    }

    // A paragraph that would only get its first line here starts the next page instead.
    const cut = list[chosen];
    if (cut.sep !== '\n\n') {
      const paragraph = remaining.lastIndexOf('\n\n', cut.at);
      if (paragraph > 0 && cut.at - (paragraph + 2) <= lineChars * 1.2) {
        const back = list.findIndex((item) => item.at === paragraph);
        if (back >= 0 && back < chosen) chosen = back;
      }
    }
    // A heading is never the last line of a page.
    const headEnd = list[chosen].at;
    const lastLine = remaining.lastIndexOf('\n', headEnd - 1) + 1;
    if (lastLine > 0 && lineKind(remaining.slice(lastLine, headEnd)).kind === 'heading') {
      const back = list.findIndex((item) => item.sep !== ' ' && item.next === lastLine);
      if (back >= 0) chosen = back;
    }
    // Do not strand one or two words of a line at the top of the next page.
    const word = list[chosen];
    if (word.sep === ' ' && word.kind === 'text') {
      const words = (value: Cut) => remaining.slice(value.next, value.lineEnd).split(' ').length;
      let back = chosen;
      while (back > 0 && words(list[back]) < 3 && list[back - 1].sep === ' ' && list[back - 1].lineStart === word.lineStart) back -= 1;
      chosen = back;
    }

    const { head, tail } = split(remaining, list[chosen]);
    const sep = list[chosen].sep;
    pages.push(part(head.replace(/[ \n]+$/, '')));
    if (index > 0) hint.chars = Math.max(60, list[chosen].at);
    separatorBefore = sep;
    startsMidParagraph = sep === ' ';
    remaining = tail;
    yield;
  }
  return pages;
}

/** Run the pagination to the end at once (for callers without a screen to share, and for tests). */
export function paginateStoryText(text: string, fits: PartFits, options?: PaginateOptions): StoryTextPage[] {
  const steps = paginateStoryPages(text, fits, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
