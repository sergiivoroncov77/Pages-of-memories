import { describe, expect, it } from 'vitest';
import { paginateStoryText, storyParagraphs, type StoryTextPage } from './readerPagination';

function rejoin(pages: StoryTextPage[]): string {
  return pages.map((page) => page.separatorBefore + page.text).join('');
}

describe('reader story pagination', () => {
  it('uses the opening budget only once and never turns page boundaries into paragraphs', () => {
    const text = 'Мы вспоминали летние дни в деревне и неспешные прогулки к старому дому. '.repeat(12).trim();
    const pages = paginateStoryText(text, { firstPageChars: 100, pageChars: 340 });
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0].text.length).toBeLessThanOrEqual(100);
    expect(pages[1].text.length).toBeGreaterThan(200);
    expect(pages.every((page) => !page.text.includes('\n'))).toBe(true);
    expect(pages.slice(1).every((page) => page.startsMidParagraph)).toBe(true);
    expect(rejoin(pages)).toBe(text);
  });

  it('preserves exactly the author’s paragraphs across different screen budgets', () => {
    const text = 'Первый абзац вспоминает наш старый дом и долгие вечера за одним столом.\n\n'
      + 'Во втором абзаце история продолжается, и даже длинное предложение остаётся частью этого абзаца, сколько бы страниц оно ни занимало.\n'
      + 'Последний абзац.';
    for (const pageChars of [35, 80, 160, 420]) {
      const pages = paginateStoryText(text, { firstPageChars: 30, pageChars });
      expect(rejoin(pages)).toBe(storyParagraphs(text).join('\n\n'));
    }
  });

  it('prefers complete sentences when the boundary fits the page', () => {
    const text = 'Мы вернулись домой. Солнце уже садилось за деревьями. В окнах горел свет.';
    const pages = paginateStoryText(text, { firstPageChars: 55, pageChars: 55 });
    expect(pages[0].text).toBe('Мы вернулись домой. Солнце уже садилось за деревьями.');
    expect(pages[1]).toEqual({ text: 'В окнах горел свет.', startsMidParagraph: true, separatorBefore: ' ' });
  });

  it('moves a few words together instead of leaving a single word on the next page', () => {
    const text = 'Вспоминаю каждый тёплый летний вечер у бабушки дома';
    const pages = paginateStoryText(text, { firstPageChars: text.length - 3, pageChars: 80 });
    expect(pages).toHaveLength(2);
    expect(pages[1].text).toBe('у бабушки дома');
    expect(rejoin(pages)).toBe(text);
  });

  it('recognizes a new paragraph at the beginning of the next page', () => {
    const text = 'Вечер за семейным столом.\n\nУтром мы отправились в путь.';
    const pages = paginateStoryText(text, { firstPageChars: 30, pageChars: 80 });
    expect(pages[1]).toEqual({ text: 'Утром мы отправились в путь.', startsMidParagraph: false, separatorBefore: '\n\n' });
    expect(rejoin(pages)).toBe(text);
  });

  it('keeps the full paragraph boundary when the estimate lands between its two newlines', () => {
    const text = 'А\n\nВторой абзац.';
    const pages = paginateStoryText(text, { firstPageChars: 2, pageChars: 30 });
    expect(pages[1]).toEqual({ text: 'Второй абзац.', startsMidParagraph: false, separatorBefore: '\n\n' });
    expect(rejoin(pages)).toBe(text);
  });

  it('keeps names and dates joined by nonbreaking spaces intact', () => {
    const text = 'Дима\u00a0Волф родился в 1979\u202fгоду и помнит то лето.';
    const pages = paginateStoryText(text, { firstPageChars: 5, pageChars: 8 });
    expect(rejoin(pages)).toBe(text);
    expect(pages.some((page) => page.text === 'Дима\u00a0Волф')).toBe(true);
    expect(pages.some((page) => page.text.includes('1979\u202fгоду'))).toBe(true);
  });

  it('retains punctuation, words, and paragraphs under very small budgets', () => {
    const text = '«Помнишь?!» — спросил он.\nДа... URL: https://example.test/long-path';
    const pages = paginateStoryText(text, { firstPageChars: 1, pageChars: 8 });
    expect(pages.every((page) => page.text.length > 0)).toBe(true);
    expect(rejoin(pages)).toBe(text);
    expect(pages.some((page) => page.text === 'https://example.test/long-path')).toBe(true);
  });

  it('keeps manual line breaks inside paragraphs, even when a line begins on the next page', () => {
    const text = 'Первая строка\nВторая строка\n\nЭто следующий абзац.';
    const pages = paginateStoryText(text, { firstPageChars: 14, pageChars: 15 });
    expect(pages[1]).toMatchObject({ text: 'Вторая строка', startsMidParagraph: true, separatorBefore: '\n' });
    expect(pages[2]).toMatchObject({ startsMidParagraph: false, separatorBefore: '\n\n' });
    expect(rejoin(pages)).toBe(text);
    expect(paginateStoryText(text, { firstPageChars: 100, pageChars: 100 }))
      .toEqual([{ text, startsMidParagraph: false, separatorBefore: '' }]);
  });

  it('accepts Windows line endings and empty text without empty pages', () => {
    expect(paginateStoryText(' \r\n\t ', { firstPageChars: 80, pageChars: 160 })).toEqual([]);
    expect(paginateStoryText(' Первый\r\n\r\nВторой ', { firstPageChars: 80, pageChars: 160 }))
      .toEqual([{ text: 'Первый\n\nВторой', startsMidParagraph: false, separatorBefore: '' }]);
  });
});
