import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPageMeasurer, type PageMeasurer } from './pageMeasurer';
import { buildReaderPages, charCountFits, paginateBook, type ReaderPage, type ReaderSource, type StoryPageData } from './readerPages';

export interface MeasuredPagesInput {
  source: ReaderSource | null;
  /** The hidden page face the pages are measured in (see `.reader-measure-host`). Present only once the page size is known. */
  faceRef: RefObject<HTMLElement | null>;
  /** The page size is known and the face exists. */
  enabled: boolean;
  /** Everything about the layout besides the content: page size, text size... A new key lays the book out again. */
  geometryKey: string;
  /** About how many characters make a line and a page: where to start looking. */
  lineChars: number;
  pageChars: number;
  debounceMs?: number;
}

/** A page with every kind of text, so the fonts a story uses are requested before measuring. */
const PROBE: StoryPageData = {
  kind: 'story', key: 'probe', chapterId: 'probe', momentId: 'probe', continued: false,
  heading: { title: 'Лето у бабушки', date: '1 июля 1950 г.', narrators: ['Анна'] },
  sections: [{ id: 'probe', text: 'Мы вспоминали **лето** и *долгие* вечера.\n\n## Подзаголовок\n• пункт', startsMidParagraph: false, separatorBefore: '', dropCap: true, signature: 'Анна' }]
};

const nextTask = () => new Promise<void>((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
  channel.port2.postMessage(null);
});

/**
 * The book's pages, laid out by measuring real pages. Null until the first
 * layout is done, so the book never shows pages cut by a guess. It lays out
 * again, after a short pause, when the content or the geometry changes and when
 * fonts finish loading; the pages stay as they were until the new ones are ready.
 */
export function useMeasuredPages({ source, faceRef, enabled, geometryKey, lineChars, pageChars, debounceMs = 150 }: MeasuredPagesInput): ReaderPage[] | null {
  const [pages, setPages] = useState<ReaderPage[] | null>(null);
  const [fontEpoch, setFontEpoch] = useState(0);
  const measurer = useRef<PageMeasurer | null>(null);
  const current = useRef<ReaderPage[] | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    const face = faceRef.current;
    if (!enabled || !face) return;
    const created = createPageMeasurer(face);
    measurer.current = created;
    return () => { measurer.current = null; created.dispose(); };
  }, [enabled, faceRef]);

  // PT Serif swaps in after the first paint and changes every width: lay out again once fonts have loaded.
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts) return;
    const onLoaded = () => { if (settled.current) setFontEpoch((value) => value + 1); };
    fonts.addEventListener('loadingdone', onLoaded);
    return () => fonts.removeEventListener('loadingdone', onLoaded);
  }, []);

  useEffect(() => {
    if (!enabled || !source) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const active = measurer.current;
      if (!active) return;
      const started = performance.now();
      let result: ReaderPage[];
      try {
        active.setContext(`${geometryKey}:${fontEpoch}`, new Map(source.chapters.map(({ chapter }) => [chapter.id, chapter.title])));
        if (!settled.current) {
          active.fits(PROBE);
          if (document.fonts) await Promise.race([document.fonts.ready, new Promise((resolve) => window.setTimeout(resolve, 2000))]);
          settled.current = true;
          if (cancelled) return;
          // The first layout of the page is done with the real fonts; forget what was measured with the fallback.
          active.setContext(`${geometryKey}:${fontEpoch}:ready`, new Map(source.chapters.map(({ chapter }) => [chapter.id, chapter.title])));
        }
        const steps = paginateBook(source, active.fits, { hint: { chars: pageChars }, lineChars });
        let sliceStart = performance.now();
        for (;;) {
          const step = steps.next();
          if (step.done) { result = step.value; break; }
          // Give the screen a moment between pages, so a long book never freezes it.
          if (performance.now() - sliceStart > 10) {
            await nextTask();
            if (cancelled) return;
            sliceStart = performance.now();
          }
        }
      } catch (error) {
        // Better pages cut by a guess than no book at all.
        console.error('The book could not be laid out by measuring', error);
        if (cancelled) return;
        result = buildReaderPages(source, charCountFits({ firstPageChars: Math.round(pageChars * 0.6), pageChars }, lineChars), { lineChars });
      }
      if (cancelled) return;
      try { performance.measure('reader-pagination', { start: started, end: performance.now(), detail: { pages: result.length } }); } catch { /* timing is only a courtesy */ }
      // Identical pages keep their identity, so nothing redraws when only the fonts or an unrelated edit came by.
      if (current.current && JSON.stringify(current.current) === JSON.stringify(result)) return;
      current.current = result;
      setPages(result);
    }, current.current ? debounceMs : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [source, enabled, geometryKey, fontEpoch, lineChars, pageChars, debounceMs]);

  return pages;
}
