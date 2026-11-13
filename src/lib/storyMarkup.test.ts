import { describe, expect, it } from 'vitest';
import { clearSize, parseInline, parseStory, storyToHtml, stripStoryMarkup, toggleInline, toggleLines } from './storyMarkup';

describe('story formatting', () => {
  it('reads bold, italics, underline and larger words, and drops a marker without its pair', () => {
    expect(parseInline('Было **очень** *тихо* и __тепло__, ++помню++.')).toEqual([
      { text: 'Было ', styles: [] }, { text: 'очень', styles: ['bold'] }, { text: ' ', styles: [] }, { text: 'тихо', styles: ['italic'] },
      { text: ' и ', styles: [] }, { text: 'тепло', styles: ['underline'] }, { text: ', ', styles: [] }, { text: 'помню', styles: ['large'] }, { text: '.', styles: [] }
    ]);
    expect(parseInline('продолжение** фразы')).toEqual([{ text: 'продолжение фразы', styles: [] }]);
    expect(parseInline('2*2 = 4')).toEqual([{ text: '2*2 = 4', styles: [] }]);
  });

  it('keeps old plain stories as they were: dialogue dashes and line breaks stay text', () => {
    const blocks = parseStory('- Ты куда?\n- На речку.\n\nВторой абзац.');
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'paragraph']);
    expect(stripStoryMarkup('- Ты куда?\n- На речку.')).toBe('- Ты куда?\n- На речку.');
  });

  it('builds headings, lists and quotes from their lines', () => {
    const blocks = parseStory('## Лето\nНачало.\n• хлеб\n• молоко\n1. первое\n2. второе\n> Кто рано встаёт');
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'bullets', 'numbers', 'quote']);
    expect(storyToHtml('• **хлеб**')).toBe('<ul><li><strong>хлеб</strong></li></ul>');
  });

  it('wraps the selection in a pair of markers and takes them off again', () => {
    const on = toggleInline('Было тихо', 5, 9, 'bold');
    expect(on.value).toBe('Было **тихо**');
    expect(toggleInline(on.value, on.selectionStart, on.selectionEnd, 'bold').value).toBe('Было тихо');
  });

  it('takes one style off words that carry several, whichever was added first', () => {
    let edit = toggleInline('Было тихо', 5, 9, 'italic');
    edit = toggleInline(edit.value, edit.selectionStart, edit.selectionEnd, 'underline');
    edit = toggleInline(edit.value, edit.selectionStart, edit.selectionEnd, 'bold');
    expect(parseInline(edit.value)).toEqual([{ text: 'Было ', styles: [] }, { text: 'тихо', styles: ['bold', 'italic', 'underline'] }]);
    edit = toggleInline(edit.value, edit.selectionStart, edit.selectionEnd, 'italic');
    expect(edit.value).toBe('Было __**тихо**__');
    edit = toggleInline(edit.value, edit.selectionStart, edit.selectionEnd, 'underline');
    edit = toggleInline(edit.value, edit.selectionStart, edit.selectionEnd, 'bold');
    expect(edit.value).toBe('Было тихо');
    // Selecting the words together with their marks works the same.
    expect(toggleInline('Было *__тихо__*', 5, 15, 'italic').value).toBe('Было __тихо__');
  });

  it('turns lines into a list and back, and back to normal size', () => {
    const list = toggleLines('хлеб\nмолоко', 0, 11, 'number');
    expect(list.value).toBe('1. хлеб\n2. молоко');
    expect(toggleLines(list.value, 0, list.value.length, 'number').value).toBe('хлеб\nмолоко');
    expect(clearSize('## Лето ++тёплое++', 3, 3).value).toBe('Лето тёплое');
  });
});
