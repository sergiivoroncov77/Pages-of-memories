/**
 * Light formatting inside a story's plain text, so a story stays readable as
 * text everywhere (older devices, the film, a copy-paste) and a blank line
 * still separates paragraphs:
 *
 *   **жирный**   *курсив*   __подчёркнутый__   ++крупный++
 *   ## Подзаголовок        (a line of its own)
 *   • пункт списка          1. пункт нумерованного списка
 *   > цитата
 *
 * A marker without its pair (a page of the reader may start in the middle of
 * a bold phrase) is dropped rather than shown.
 */
import { normalizeStoryNewlines, splitStoryParagraphs } from './storyText';

export type InlineStyle = 'bold' | 'italic' | 'underline' | 'large';

export interface InlineRun {
  text: string;
  styles: InlineStyle[];
}

export type StoryBlock =
  | { kind: 'paragraph'; lines: InlineRun[][] }
  | { kind: 'heading'; runs: InlineRun[] }
  | { kind: 'bullets'; items: InlineRun[][] }
  | { kind: 'numbers'; start: number; items: InlineRun[][] }
  | { kind: 'quote'; lines: InlineRun[][] };

const MARKERS: { token: string; style: InlineStyle }[] = [
  { token: '**', style: 'bold' },
  { token: '__', style: 'underline' },
  { token: '++', style: 'large' },
  { token: '*', style: 'italic' }
];

const HEADING = /^##\s+/;
const BULLET = /^[•▪◦]\s+/;
const NUMBER = /^(\d{1,2})[.)]\s+/;
const QUOTE = /^>\s?/;

/** Split a line into runs of text with their styles. */
export function parseInline(line: string): InlineRun[] {
  // Find the markers that have a pair; lone ones are dropped.
  type Token = { at: number; length: number; style: InlineStyle };
  const tokens: Token[] = [];
  for (let i = 0; i < line.length;) {
    const marker = MARKERS.find((item) => line.startsWith(item.token, i));
    // An asterisk between letters or digits (2*2) is text, not italics.
    if (marker && !(marker.style === 'italic' && /\w/.test(line[i - 1] ?? '') && /\w/.test(line[i + 1] ?? ''))) {
      tokens.push({ at: i, length: marker.token.length, style: marker.style });
      i += marker.token.length;
    } else i += 1;
  }
  const open = new Map<InlineStyle, number>();
  const paired = new Set<number>();
  tokens.forEach((token, index) => {
    const start = open.get(token.style);
    if (start === undefined) open.set(token.style, index);
    else { paired.add(start); paired.add(index); open.delete(token.style); }
  });
  const runs: InlineRun[] = [];
  const active = new Set<InlineStyle>();
  let cursor = 0;
  const push = (text: string) => {
    if (!text) return;
    const styles = [...active].sort();
    const last = runs[runs.length - 1];
    if (last && last.styles.join() === styles.join()) last.text += text;
    else runs.push({ text, styles });
  };
  tokens.forEach((token, index) => {
    push(line.slice(cursor, token.at));
    cursor = token.at + token.length;
    if (!paired.has(index)) return;
    if (active.has(token.style)) active.delete(token.style);
    else active.add(token.style);
  });
  push(line.slice(cursor));
  return runs;
}

type LineKind = 'heading' | 'bullet' | 'number' | 'quote' | 'text';

function lineKind(line: string): { kind: LineKind; body: string; number?: number } {
  if (HEADING.test(line)) return { kind: 'heading', body: line.replace(HEADING, '') };
  if (BULLET.test(line)) return { kind: 'bullet', body: line.replace(BULLET, '') };
  const number = NUMBER.exec(line);
  if (number) return { kind: 'number', body: line.slice(number[0].length), number: Number(number[1]) };
  if (QUOTE.test(line)) return { kind: 'quote', body: line.replace(QUOTE, '') };
  return { kind: 'text', body: line };
}

/** The story as blocks: paragraphs (with their own line breaks), headings, lists and quotes. */
export function parseStory(text: string): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  splitStoryParagraphs(text).forEach((paragraph) => {
    let current: StoryBlock | null = null;
    const flush = () => { if (current) blocks.push(current); current = null; };
    paragraph.split('\n').forEach((raw) => {
      const line = lineKind(raw.trim());
      const runs = parseInline(line.body);
      const block = current as StoryBlock | null;
      if (line.kind === 'heading') { flush(); blocks.push({ kind: 'heading', runs }); return; }
      if (line.kind === 'bullet') {
        if (block?.kind === 'bullets') block.items.push(runs);
        else { flush(); current = { kind: 'bullets', items: [runs] }; }
        return;
      }
      if (line.kind === 'number') {
        if (block?.kind === 'numbers') block.items.push(runs);
        else { flush(); current = { kind: 'numbers', start: line.number ?? 1, items: [runs] }; }
        return;
      }
      if (line.kind === 'quote') {
        if (block?.kind === 'quote') block.lines.push(runs);
        else { flush(); current = { kind: 'quote', lines: [runs] }; }
        return;
      }
      if (block?.kind === 'paragraph') block.lines.push(runs);
      else { flush(); current = { kind: 'paragraph', lines: [runs] }; }
    });
    flush();
  });
  return blocks;
}

/** The words without formatting marks: for the film, search and short previews. */
export function stripStoryMarkup(text: string): string {
  return normalizeStoryNewlines(text).split('\n').map((raw) => {
    const line = lineKind(raw.trim());
    const body = parseInline(line.body).map((run) => run.text).join('');
    if (!raw.trim()) return '';
    return line.kind === 'bullet' ? '• ' + body : line.kind === 'number' ? `${line.number}. ${body}` : body;
  }).join('\n');
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

function runsToHtml(runs: InlineRun[]): string {
  return runs.map((run) => run.styles.reduce((html, style) => {
    if (style === 'bold') return `<strong>${html}</strong>`;
    if (style === 'italic') return `<em>${html}</em>`;
    if (style === 'underline') return `<u>${html}</u>`;
    return `<span class="story-large">${html}</span>`;
  }, escapeHtml(run.text))).join('');
}

/** The story as HTML for the downloadable book. */
export function storyToHtml(text: string): string {
  return parseStory(text).map((block) => {
    if (block.kind === 'heading') return `<h4 class="story-heading">${runsToHtml(block.runs)}</h4>`;
    if (block.kind === 'bullets') return `<ul>${block.items.map((item) => `<li>${runsToHtml(item)}</li>`).join('')}</ul>`;
    if (block.kind === 'numbers') return `<ol start="${block.start}">${block.items.map((item) => `<li>${runsToHtml(item)}</li>`).join('')}</ol>`;
    if (block.kind === 'quote') return `<blockquote>${block.lines.map(runsToHtml).join('<br>')}</blockquote>`;
    return `<p>${block.lines.map(runsToHtml).join('<br>')}</p>`;
  }).join('');
}

/** Format the selected words: wrap them in a pair of markers, or take the pair off when it is already there. */
export function toggleInline(value: string, start: number, end: number, style: InlineStyle): { value: string; selectionStart: number; selectionEnd: number } {
  const token = MARKERS.find((item) => item.style === style)!.token;
  const text = normalizeStoryNewlines(value);
  let from = Math.min(start, end);
  let to = Math.max(start, end);
  // Spaces stay outside the markers, or they would not pair.
  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;
  const before = text.slice(from - token.length, from);
  const after = text.slice(to, to + token.length);
  if (before === token && after === token) {
    const next = text.slice(0, from - token.length) + text.slice(from, to) + text.slice(to + token.length);
    return { value: next, selectionStart: from - token.length, selectionEnd: to - token.length };
  }
  const selected = text.slice(from, to);
  if (selected.startsWith(token) && selected.endsWith(token) && selected.length >= token.length * 2) {
    const inner = selected.slice(token.length, selected.length - token.length);
    return { value: text.slice(0, from) + inner + text.slice(to), selectionStart: from, selectionEnd: from + inner.length };
  }
  const next = text.slice(0, from) + token + selected + token + text.slice(to);
  return { value: next, selectionStart: from + token.length, selectionEnd: to + token.length };
}

export type LineStyle = 'heading' | 'bullet' | 'number' | 'quote';

/** Turn the selected lines into a heading, list or quote, or back into plain lines. */
export function toggleLines(value: string, start: number, end: number, style: LineStyle): { value: string; selectionStart: number; selectionEnd: number } {
  const text = normalizeStoryNewlines(value);
  const from = text.lastIndexOf('\n', Math.min(start, end) - 1) + 1;
  const nextBreak = text.indexOf('\n', Math.max(start, end, from));
  const to = nextBreak < 0 ? text.length : nextBreak;
  const lines = text.slice(from, to).split('\n');
  const kindOf = (line: string) => lineKind(line.trim()).kind;
  const all = lines.filter((line) => line.trim()).every((line) => kindOf(line) === style);
  let counter = 0;
  const changed = lines.map((line) => {
    const body = lineKind(line.trim()).body;
    if (!line.trim()) return line;
    if (all) return body;
    counter += 1;
    return style === 'heading' ? '## ' + body : style === 'bullet' ? '• ' + body : style === 'number' ? `${counter}. ` + body : '> ' + body;
  }).join('\n');
  return { value: text.slice(0, from) + changed + text.slice(to), selectionStart: from, selectionEnd: from + changed.length };
}

/** Back to normal size: the selected lines stop being subheadings and larger words lose their marks. */
export function clearSize(value: string, start: number, end: number): { value: string; selectionStart: number; selectionEnd: number } {
  const text = normalizeStoryNewlines(value);
  const from = text.lastIndexOf('\n', Math.min(start, end) - 1) + 1;
  const nextBreak = text.indexOf('\n', Math.max(start, end, from));
  const to = nextBreak < 0 ? text.length : nextBreak;
  const changed = text.slice(from, to).split('\n')
    .map((line) => line.replace(HEADING, '').replace(/\+\+/g, '')).join('\n');
  return { value: text.slice(0, from) + changed + text.slice(to), selectionStart: from, selectionEnd: from + changed.length };
}
