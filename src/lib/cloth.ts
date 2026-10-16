import type { CSSProperties } from 'react';
import type { Book } from '../data/types';

const CLOTHS = ['#3a4a3e', '#6b2f34', '#2f3f5b', '#5a4030', '#4b3b5c', '#2f5257'];

/** Each book on the shelf gets its own binding colour, stable by shelf position. */
export function clothStyle(book: Pick<Book, 'id'>, books: Pick<Book, 'id'>[]): CSSProperties {
  const cloth = CLOTHS[Math.max(0, books.findIndex((item) => item.id === book.id)) % CLOTHS.length];
  return {
    '--cloth': cloth,
    '--cloth-light': `color-mix(in srgb, ${cloth} 80%, #fff)`,
    '--cloth-deep': `color-mix(in srgb, ${cloth} 62%, #000)`
  } as CSSProperties;
}
