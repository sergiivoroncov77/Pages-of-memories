import { splitStoryParagraphs } from '../../lib/storyText';

export interface StoryTextPage {
  text: string;
  /** The first line continues an author's paragraph from the preceding page. */
  startsMidParagraph: boolean;
  /** Preserve the author's line/paragraph boundary when it lands between pages. */
  separatorBefore: '' | ' ' | '\n' | '\n\n';
}

export interface StoryTextBudget {
  firstPageChars: number;
  pageChars: number;
}

/** Blank lines start paragraphs; a single line break stays inside its paragraph. */
export function storyParagraphs(text: string): string[] {
  return splitStoryParagraphs(text)
    .map((paragraph) => paragraph.split('\n').map((line) => line.replace(/[\t ]+/g, ' ').trim()).join('\n'));
}

function pageLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 760;
}

/** Prefer a complete paragraph or sentence while leaving useful room on the page. */
function breakBefore(text: string, limit: number): number {
  const within = text.slice(0, limit + 1);
  const paragraph = within.lastIndexOf('\n\n');
  if (paragraph >= limit * 0.6) return paragraph;

  let sentence = -1;
  for (const match of within.matchAll(/[.!?…]["»”')\]]*(?=[ \n])/g)) {
    const end = match.index + match[0].length;
    if (end <= limit) sentence = end;
  }
  if (sentence >= limit * 0.55) return sentence;

  let word = -1;
  for (const match of within.matchAll(/[ \n]/g)) word = match.index;
  if (word > 0) return word;
  // A name, URL or other unbroken word stays intact even if it exceeds the estimate.
  const nextSpace = text.search(/[ \n]/);
  return nextSpace < 0 ? text.length : nextSpace;
}

/** Do not strand one or two words of a paragraph at the top of its next page. */
function avoidShortContinuation(text: string, end: number, nextLimit: number): number {
  const after = text.slice(end);
  const separator = /^[ \n]*/.exec(after)?.[0] ?? '';
  if (separator.includes('\n')) return end;
  const remainder = after.slice(separator.length).split('\n', 1)[0];
  if (!remainder || remainder.split(/ +/).length >= 3) return end;

  const paragraphStart = text.lastIndexOf('\n', end - 1) + 1;
  let balanced = end;
  // Keep at least three words together, provided the next page can hold them.
  for (const match of [...text.slice(paragraphStart, end).matchAll(/ /g)].reverse()) {
    const candidate = paragraphStart + match.index;
    const nextParagraphEnd = text.indexOf('\n', candidate);
    const continuation = text.slice(candidate, nextParagraphEnd < 0 ? undefined : nextParagraphEnd).trim();
    if (continuation.length > nextLimit || candidate <= 0) break;
    balanced = candidate;
    if (continuation.split(/ +/).length >= 3) break;
  }
  return balanced;
}

/**
 * Paginate once, with a smaller opening-page budget for its heading. Only the
 * author's paragraph boundaries are written into `text`; a page continuation
 * is represented separately, so resizing cannot turn it into a new paragraph.
 */
export function paginateStoryText(text: string, budget: StoryTextBudget): StoryTextPage[] {
  let remaining = storyParagraphs(text).join('\n\n');
  const pages: StoryTextPage[] = [];
  let startsMidParagraph = false;
  let separatorBefore: StoryTextPage['separatorBefore'] = '';
  const nextLimit = pageLimit(budget.pageChars);
  while (remaining) {
    const limit = pages.length === 0 ? pageLimit(budget.firstPageChars) : nextLimit;
    if (remaining.length <= limit) {
      pages.push({ text: remaining, startsMidParagraph, separatorBefore });
      break;
    }
    const end = avoidShortContinuation(remaining, breakBefore(remaining, limit), nextLimit);
    // If the estimate lands inside a blank line, keep the complete separator
    // with the next page instead of dropping half of the paragraph boundary.
    const part = remaining.slice(0, end).replace(/[ \n]+$/, '');
    pages.push({ text: part, startsMidParagraph, separatorBefore });
    const tail = remaining.slice(part.length);
    const separator = /^[ \n]*/.exec(tail)?.[0] ?? '';
    separatorBefore = separator.includes('\n\n') ? '\n\n' : separator.includes('\n') ? '\n' : ' ';
    startsMidParagraph = separatorBefore !== '\n\n';
    remaining = tail.slice(separator.length);
  }
  return pages;
}
