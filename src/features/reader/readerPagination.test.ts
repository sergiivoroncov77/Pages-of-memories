import { describe, expect, it } from 'vitest';
import { parseStory, stripStoryMarkup } from '../../lib/storyMarkup';
import { paginateStoryText, storyParagraphs, type PartFits, type StoryTextPage } from './readerPagination';

function rejoin(pages: StoryTextPage[]): string {
  return pages.map((page) => page.separatorBefore + page.text).join('');
}

/** A page holds so many characters; the opening page has its own, smaller room. */
const chars = (first: number, rest: number): PartFits => (part, index) => part.text.length <= (index === 0 ? first : rest);

describe('reader story pagination', () => {
  it('uses the opening room only once and never turns page boundaries into paragraphs', () => {
    const text = 'Мы вспоминали летние дни в деревне и неспешные прогулки к старому дому. '.repeat(12).trim();
    const pages = paginateStoryText(text, chars(100, 340));
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0].text.length).toBeLessThanOrEqual(100);
    expect(pages[1].text.length).toBeGreaterThan(200);
    expect(pages.every((page) => !page.text.includes('\n'))).toBe(true);
    expect(pages.slice(1).every((page) => page.startsMidParagraph)).toBe(true);
    expect(rejoin(pages)).toBe(text);
  });

  it('preserves exactly the author’s paragraphs across different page sizes', () => {
    const text = 'Первый абзац вспоминает наш старый дом и долгие вечера за одним столом.\n\n'
      + 'Во втором абзаце история продолжается, и даже длинное предложение остаётся частью этого абзаца, сколько бы страниц оно ни занимало.\n'
      + 'Последний абзац.';
    for (const rest of [35, 80, 160, 420]) {
      const pages = paginateStoryText(text, chars(30, rest));
      expect(rejoin(pages)).toBe(storyParagraphs(text).join('\n\n'));
    }
  });

  it('fills a page up to the last word that fits, not up to a sentence or paragraph end', () => {
    const text = 'Мы вернулись домой. Солнце уже садилось за деревьями. В окнах горел свет.';
    const pages = paginateStoryText(text, chars(50, 50));
    expect(pages[0].text).toBe('Мы вернулись домой. Солнце уже садилось за');
    expect(pages[1]).toEqual({ text: 'деревьями. В окнах горел свет.', startsMidParagraph: true, separatorBefore: ' ' });
    // Every page is as full as it can be: one more word would not fit.
    const words = text.split(' ');
    expect(words.slice(0, words.indexOf('деревьями.') + 1).join(' ').length).toBeGreaterThan(50);
  });

  it('measures what fits through the predicate it is given, finding the longest fit however wrong the guess', () => {
    const text = Array.from({ length: 400 }, (_, index) => 'слово' + (index % 10)).join(' ');
    for (const guess of [20, 500, 5000]) {
      const pages = paginateStoryText(text, (part) => part.text.length <= 333, { hint: { chars: guess } });
      pages.slice(0, -1).forEach((page) => {
        expect(page.text.length).toBeLessThanOrEqual(333);
        // Less than one more word (6-7 characters) was left unused.
        expect(page.text.length).toBeGreaterThan(333 - 18);
      });
      expect(rejoin(pages)).toBe(text);
    }
  });

  it('does not strand one or two words of a line on the next page', () => {
    const text = 'Вспоминаю каждый тёплый летний вечер у бабушки дома';
    const pages = paginateStoryText(text, chars(text.length - 3, 80));
    expect(pages).toHaveLength(2);
    expect(pages[1].text).toBe('у бабушки дома');
    expect(rejoin(pages)).toBe(text);

    const two = paginateStoryText(text, chars(text.length - 7, 80));
    expect(two[1].text.split(' ').length).toBeGreaterThanOrEqual(3);
  });

  it('starts the words on the next page when a heading leaves room for less than about two lines', () => {
    const text = '1 сентября 1980 года я не помню, поэтому буду записывать воспоминания из первого класса. Для меня это просто.';
    // Nothing fits under the heading, or only the first word does.
    for (const first of [0, 5]) {
      const pages = paginateStoryText(text, chars(first, 200), { lineChars: 40, emptyFirstPage: true });
      expect(pages).toHaveLength(2);
      expect(pages[0].text).toBe('');
      expect(pages[1]).toMatchObject({ text, startsMidParagraph: false, separatorBefore: '' });
    }
    // With room for two lines the heading page takes them.
    const roomy = paginateStoryText(text, chars(70, 200), { lineChars: 40, emptyFirstPage: true });
    expect(roomy[0].text.length).toBeGreaterThan(60);
    expect(rejoin(roomy)).toBe(text);
    // Without the option a page always takes something, so pagination cannot stall.
    expect(paginateStoryText(text, chars(5, 200), { lineChars: 40 })[0].text).toBe('1');
  });

  it('starts a paragraph on the next page when only its first line would stay at the bottom', () => {
    const text = 'Первый абзац закончился тут.\n\nВторой абзац продолжается долго и ещё дальше.';
    const pages = paginateStoryText(text, chars(40, 80), { lineChars: 20 });
    expect(pages[0].text).toBe('Первый абзац закончился тут.');
    expect(pages[1]).toMatchObject({ separatorBefore: '\n\n', startsMidParagraph: false });
    // With a longer first line in the paragraph it stays where it is.
    const roomy = paginateStoryText(text, chars(40, 80), { lineChars: 4 });
    expect(roomy[0].text).toBe('Первый абзац закончился тут.\n\nВторой');
  });

  it('recognizes a new paragraph at the beginning of the next page', () => {
    const text = 'Вечер за семейным столом.\n\nУтром мы отправились в путь.';
    const pages = paginateStoryText(text, chars(30, 80));
    expect(pages[1]).toEqual({ text: 'Утром мы отправились в путь.', startsMidParagraph: false, separatorBefore: '\n\n' });
    expect(rejoin(pages)).toBe(text);
  });

  it('keeps the full paragraph boundary when the page ends right before a blank line', () => {
    const text = 'А\n\nВторой абзац.';
    const pages = paginateStoryText(text, chars(2, 30));
    expect(pages[1]).toEqual({ text: 'Второй абзац.', startsMidParagraph: false, separatorBefore: '\n\n' });
    expect(rejoin(pages)).toBe(text);
  });

  it('keeps names and dates joined by nonbreaking spaces intact', () => {
    const text = 'Дима Волф родился в 1979 году и помнит то лето.';
    const pages = paginateStoryText(text, chars(5, 8));
    expect(rejoin(pages)).toBe(text);
    expect(pages.some((page) => page.text === 'Дима Волф')).toBe(true);
    expect(pages.some((page) => page.text.includes('1979 году'))).toBe(true);
  });

  it('retains punctuation, words, and paragraphs under very small pages', () => {
    const text = '«Помнишь?!» — спросил он.\nДа... URL: https://example.test/long-path';
    const pages = paginateStoryText(text, chars(1, 8));
    expect(pages.every((page) => page.text.length > 0)).toBe(true);
    expect(rejoin(pages)).toBe(text);
    expect(pages.some((page) => page.text === 'https://example.test/long-path')).toBe(true);
  });

  it('keeps manual line breaks as line breaks, and only a plain space continues a paragraph', () => {
    const text = 'Первая строка\nВторая строка\n\nЭто следующий абзац.';
    const pages = paginateStoryText(text, chars(14, 15));
    expect(pages[1]).toMatchObject({ text: 'Вторая строка', startsMidParagraph: false, separatorBefore: '\n' });
    expect(pages[2]).toMatchObject({ startsMidParagraph: false, separatorBefore: '\n\n' });
    expect(rejoin(pages)).toBe(text);
    expect(paginateStoryText(text, chars(100, 100)))
      .toEqual([{ text, startsMidParagraph: false, separatorBefore: '' }]);
  });

  it('tells a line break, a blank line and a space between pages apart', () => {
    const text = 'аааа бббб\nвввв гггг\n\nдддд еееее';
    const pages = paginateStoryText(text, chars(6, 6));
    expect(pages.map((page) => page.text)).toEqual(['аааа', 'бббб', 'вввв', 'гггг', 'дддд', 'еееее']);
    expect(pages.map((page) => page.separatorBefore)).toEqual(['', ' ', '\n', ' ', '\n\n', ' ']);
    expect(pages.map((page) => page.startsMidParagraph)).toEqual([false, true, false, true, false, true]);
  });

  it('accepts Windows line endings and empty text without empty pages', () => {
    expect(paginateStoryText(' \r\n\t ', chars(80, 160))).toEqual([]);
    expect(paginateStoryText(' Первый\r\n\r\nВторой ', chars(80, 160)))
      .toEqual([{ text: 'Первый\n\nВторой', startsMidParagraph: false, separatorBefore: '' }]);
  });

  describe('story markup across a page break', () => {
    const balanced = (page: StoryTextPage) => (page.text.match(/\*\*/g) ?? []).length % 2 === 0;

    it('closes bold text at the end of a page and opens it again on the next', () => {
      const text = 'Начало **один два три четыре пять шесть** конец истории.';
      const pages = paginateStoryText(text, chars(24, 24));
      expect(pages.length).toBeGreaterThan(2);
      expect(pages.every(balanced)).toBe(true);
      // Every page shows the words that were bold as bold, and nothing else is bold.
      const bold = pages.flatMap((page) => parseStory(page.text).flatMap((block) => block.kind === 'paragraph' ? block.lines.flat() : []))
        .filter((run) => run.styles.includes('bold')).map((run) => run.text).join(' ');
      expect(bold).toBe('один два три четыре пять шесть');
      expect(pages.map((page) => stripStoryMarkup(page.text)).join(' ')).toBe('Начало один два три четыре пять шесть конец истории.');
    });

    it('nests several styles and closes them in order', () => {
      const text = '*курсив **и жирный текст идёт здесь** дальше*';
      const pages = paginateStoryText(text, chars(26, 26));
      expect(pages.length).toBeGreaterThan(1);
      pages.forEach((page) => {
        const runs = parseStory(page.text).flatMap((block) => block.kind === 'paragraph' ? block.lines.flat() : []);
        expect(runs.every((run) => run.styles.includes('italic'))).toBe(true);
        expect(page.text).not.toMatch(/^\s|\s$/);
      });
      expect(pages.map((page) => stripStoryMarkup(page.text)).join(' ')).toBe('курсив и жирный текст идёт здесь дальше');
    });

    it('does not cut a list through an item: pages break between items', () => {
      const text = '• первый пункт\n• второй пункт\n• третий пункт\n• четвёртый пункт';
      const pages = paginateStoryText(text, chars(32, 32));
      expect(pages.length).toBeGreaterThan(1);
      pages.forEach((page) => page.text.split('\n').forEach((line) => expect(line).toMatch(/^• \S+ пункт$/)));
      expect(rejoin(pages)).toBe(text);
    });

    it('keeps a heading with the text that follows it', () => {
      const text = 'Начало истории здесь.\n\n## Заголовок главы\n\nТекст после заголовка идёт долго.';
      const pages = paginateStoryText(text, chars(45, 60));
      expect(pages[0].text).toBe('Начало истории здесь.');
      expect(pages[1].text.startsWith('## Заголовок главы')).toBe(true);
    });

    it('keeps a quote a quote when one line is longer than a page', () => {
      const pages = paginateStoryText('> один два три четыре пять шесть семь восемь', chars(16, 16));
      expect(pages.length).toBeGreaterThan(2);
      expect(pages.every((page) => page.text.startsWith('> '))).toBe(true);
    });

    it('never cuts so that the next page starts like a list item', () => {
      const text = 'Мы приехали в мае 2. июля уехали';
      const pages = paginateStoryText(text, chars(20, 20));
      expect(pages.length).toBeGreaterThan(1);
      pages.forEach((page) => expect(page.text).not.toMatch(/^(\d{1,2}[.)]\s|##\s|[•>])/));
      expect(rejoin(pages)).toBe(text);
    });
  });
});
