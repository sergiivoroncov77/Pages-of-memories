/** Keep stored stories as plain text; a blank line separates paragraphs. */
export function normalizeStoryNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Single line breaks belong to their paragraph (for dialogue, verse, addresses). */
export function splitStoryParagraphs(value: string): string[] {
  return normalizeStoryNewlines(value).split(/\n(?:[ \t]*\n)+/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

/** An explicit editor action for pasted text: join wrapped lines, retain blank lines. */
export function joinWrappedStoryLines(value: string): string {
  return normalizeStoryNewlines(value).split(/(\n(?:[ \t]*\n)+)/).map((part, index) =>
    index % 2 ? part : part.replace(/[ \t]*\n[ \t]*/g, ' ')
  ).join('');
}

export type StoryTextAction = 'paragraph' | 'line-break' | 'join-lines';

export interface StoryTextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Selection offsets come from a textarea, whose DOM value uses LF even when
 * the stored story uses CRLF. Normalize only for this explicit editing action.
 * Without a selection, joining applies to the whole story.
 */
export function editStorySelection(
  value: string, start: number, end: number, action: StoryTextAction, maxLength = 30000
): StoryTextEdit | null {
  const text = normalizeStoryNewlines(value);
  let from = Math.max(0, Math.min(text.length, Math.min(start, end)));
  let to = Math.max(from, Math.min(text.length, Math.max(start, end)));
  if (action === 'join-lines' && from === to) { from = 0; to = text.length; }
  const replacement = action === 'join-lines' ? joinWrappedStoryLines(text.slice(from, to))
    : action === 'paragraph' ? '\n\n' : '\n';
  const next = text.slice(0, from) + replacement + text.slice(to);
  // Never shorten a story silently to make an edit fit the limit. An existing
  // longer story can still be shortened without being truncated on opening.
  if (next.length > maxLength && next.length > text.length) return null;
  return {
    value: next,
    selectionStart: action === 'join-lines' ? from : from + replacement.length,
    selectionEnd: from + replacement.length
  };
}
