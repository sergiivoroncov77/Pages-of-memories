import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { MediaAsset } from '../../data/types';
import { PageView } from './PageView';
import type { PageFits } from './readerPages';

export interface PageMeasurer {
  /** Does the candidate story page fit its page body without vertical overflow? */
  fits: PageFits;
  /** What the answers depend on besides the candidate (page size, text size, loaded fonts, chapter titles): a new key forgets old answers. */
  setContext(key: string, chapterTitles: Map<string, string>): void;
  dispose(): void;
}

const NO_ASSETS = new Map<string, MediaAsset>();
const MAX_ANSWERS = 40000;

/**
 * Measures pages with the real page component. `face` is a hidden element in the
 * reader that has the page's class chain and size, so a measured page is laid out
 * exactly like a shown one: heading, kicker, players, signature and page number
 * all take their true room. Must be called outside of React's render and commit.
 */
export function createPageMeasurer(face: HTMLElement): PageMeasurer {
  const container = document.createElement('div');
  container.style.display = 'contents';
  face.appendChild(container);
  const root = createRoot(container);
  let context = '';
  let titles = new Map<string, string>();
  const answers = new Map<string, boolean>();
  const noop = () => undefined;

  const fits: PageFits = (candidate) => {
    const key = context + '\u0001' + (titles.get(candidate.chapterId) ?? '') + '\u0001' + JSON.stringify(candidate);
    const known = answers.get(key);
    if (known !== undefined) return known;
    flushSync(() => root.render(<PageView page={candidate} number={2} total={1000} assets={NO_ASSETS} chapterTitles={titles} onJump={noop} measuring />));
    const body = container.querySelector<HTMLElement>('.reader-page__body');
    if (!body || body.clientHeight === 0) throw new Error('The page used for measuring has no size.');
    const result = body.scrollHeight <= body.clientHeight + 1;
    if (answers.size >= MAX_ANSWERS) answers.clear();
    answers.set(key, result);
    return result;
  };

  return {
    fits,
    setContext(key, chapterTitles) {
      if (key !== context) answers.clear();
      context = key;
      titles = chapterTitles;
    },
    dispose() {
      // Never unmount a root while React is rendering: the cleanup that calls this runs in a commit.
      setTimeout(() => { root.unmount(); container.remove(); }, 0);
    }
  };
}
