import { describe, expect, it } from 'vitest';
import { editStorySelection, joinWrappedStoryLines, normalizeStoryNewlines, splitStoryParagraphs } from './storyText';

describe('story paragraph editing', () => {
  it('distinguishes manual line breaks from blank-line paragraphs, including pasted Windows text', () => {
    expect(normalizeStoryNewlines('Одна\r\nДве\rТри')).toBe('Одна\nДве\nТри');
    expect(splitStoryParagraphs('Первый абзац.\r\nЕго новая строка.\r\n \r\nВторой абзац.'))
      .toEqual(['Первый абзац.\nЕго новая строка.', 'Второй абзац.']);
    expect(splitStoryParagraphs(' \n\t\n ')).toEqual([]);
  });

  it('joins wrapped sentences without merging separate paragraphs or changing punctuation', () => {
    expect(joinWrappedStoryLines('Мы ехали\nв гости.\n\nТам нас\nждали.'))
      .toBe('Мы ехали в гости.\n\nТам нас ждали.');
    expect(joinWrappedStoryLines('Первая  \r\n  строка.\r\n \r\n\r\n— Вторая\r\nстрока!'))
      .toBe('Первая строка.\n \n\n— Вторая строка!');
  });

  it('joins only a selected passage and retains all text outside it', () => {
    const value = 'Начало\nкак было.\n\nВыбранный\nрассказ.\n\nКонец\nкак был.';
    const start = value.indexOf('Выбранный');
    const end = value.indexOf('\n\nКонец');
    const edit = editStorySelection(value, start, end, 'join-lines')!;
    expect(edit.value).toBe('Начало\nкак было.\n\nВыбранный рассказ.\n\nКонец\nкак был.');
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe('Выбранный рассказ.');
  });

  it('joins the whole story only when nothing is selected', () => {
    expect(editStorySelection('Раз\nдва\n\nТри\nчетыре', 2, 2, 'join-lines')?.value)
      .toBe('Раз два\n\nТри четыре');
  });

  it('inserts paragraph or line breaks at the cursor and moves it after the insertion', () => {
    expect(editStorySelection('Первая.Вторая.', 7, 7, 'paragraph'))
      .toEqual({ value: 'Первая.\n\nВторая.', selectionStart: 9, selectionEnd: 9 });
    expect(editStorySelection('АБ', 1, 1, 'line-break'))
      .toEqual({ value: 'А\nБ', selectionStart: 2, selectionEnd: 2 });
  });

  it('uses textarea cursor offsets for imported CRLF text instead of inserting inside a word', () => {
    const stored = 'Один\r\nДва';
    const cursorAtEnd = normalizeStoryNewlines(stored).length;
    expect(editStorySelection(stored, cursorAtEnd, cursorAtEnd, 'paragraph'))
      .toEqual({ value: 'Один\nДва\n\n', selectionStart: 10, selectionEnd: 10 });

    const multiline = 'До\r\nначала.\r\n\r\nОдин\r\nДва\r\n\r\nКонец';
    const normalized = normalizeStoryNewlines(multiline);
    const from = normalized.indexOf('Один');
    const to = normalized.indexOf('\n\nКонец');
    const edit = editStorySelection(multiline, from, to, 'join-lines')!;
    expect(edit.value).toBe('До\nначала.\n\nОдин Два\n\nКонец');
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe('Один Два');
  });

  it('rejects over-limit growth without dropping text, but permits shortening a longer imported story', () => {
    expect(editStorySelection('12345', 3, 3, 'paragraph', 5)).toBeNull();
    expect(editStorySelection('12345', 1, 4, 'paragraph', 5)?.value).toBe('1\n\n5');
    expect(editStorySelection('123456\n 7890', 0, 0, 'join-lines', 5)?.value).toBe('123456 7890');
  });
});
