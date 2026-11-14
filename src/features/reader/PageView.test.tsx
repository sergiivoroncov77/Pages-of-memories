import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StorySection, StoryPageData } from './readerPages';
import { PageView } from './PageView';

const section = (patch: Partial<StorySection> = {}): StorySection => ({
  id: 's', text: 'Первая строка\nВторая строка\n\nТретья', startsMidParagraph: false, separatorBefore: '', dropCap: false, ...patch
});

function render(sections: StorySection[], heading = false, measuring = false): string {
  const page: StoryPageData = {
    kind: 'story', key: 'k', chapterId: 'c', momentId: 'm', continued: !heading, sections,
    heading: heading ? { title: 'Заглавие', date: '', narrators: [] } : undefined
  };
  return renderToStaticMarkup(<PageView page={page} number={3} total={9} assets={new Map()} chapterTitles={new Map([['c', 'Глава']])} onJump={() => undefined} measuring={measuring} />);
}

const paragraphs = (html: string) => [...html.matchAll(/<p( class="([^"]*)")?>([^<]*)<\/p>/g)].map((match) => ({ cls: match[2] ?? '', text: match[3] }));

describe('story page rendering', () => {
  it('makes every line the author began a paragraph line, with the gap only after a blank line', () => {
    const lines = paragraphs(render([section()])).filter((line) => /строка|Третья/.test(line.text));
    expect(lines.map((line) => line.text)).toEqual(['Первая строка', 'Вторая строка', 'Третья']);
    // The gap comes with the last line of a block, i.e. before a blank line.
    expect(lines.map((line) => line.cls.includes('story-line--end'))).toEqual([false, true, true]);
    expect(lines.every((line) => !line.cls.includes('is-'))).toBe(true);
  });

  it('indents a page that starts after a line break or a blank line, but not one that goes on mid-paragraph', () => {
    const first = (patch: Partial<StorySection>) => paragraphs(render([section(patch)])).find((line) => line.text === 'Первая строка')!.cls;
    expect(first({ separatorBefore: '\n', startsMidParagraph: false })).toBe('');
    expect(first({ separatorBefore: '\n\n', startsMidParagraph: false })).toBe('');
    expect(first({ separatorBefore: ' ', startsMidParagraph: true })).toContain('is-continuation');
  });

  it('opens flush after a heading or a kicker, and under a drop cap', () => {
    expect(render([section()], true)).toContain('is-flush');
    expect(render([section({ kicker: 'Анна' })])).toContain('Взгляд · Анна');
    expect(render([section({ kicker: 'Анна' })])).toContain('is-flush');
    const dropped = render([section({ dropCap: true })]);
    expect(dropped).toContain('has-drop-cap');
    expect(render([section()])).not.toContain('has-drop-cap');
  });

  it('draws a section added under the first without a drop cap and with its own kicker', () => {
    const html = render([section({ dropCap: true }), section({ id: 't', kicker: 'Миша', text: 'Другое.' })]);
    expect(html.match(/has-drop-cap/g)).toHaveLength(1);
    expect(html.match(/reader-story__section/g)).toHaveLength(2);
  });

  it('shows voice players as inert stand-ins while measuring, and loads nothing', () => {
    const html = render([section({ audioIds: ['a1', 'a2'] })], false, true);
    expect(html.match(/voice-note reader-story__voice/g)).toHaveLength(2);
    expect(html).not.toContain('<audio');
  });
});
