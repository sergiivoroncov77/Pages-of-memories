import type { CSSProperties } from 'react';
import { coverColorOf } from '../data/coverColors';
import type { Book } from '../data/types';

/** The binding colour of a book, the same on the shelf, on the 3D book and on the reader's cover. */
export function clothStyle(book: Pick<Book, 'id' | 'coverColor'>, books: Pick<Book, 'id'>[]): CSSProperties {
  const { cloth } = coverColorOf(book, books);
  return {
    '--cloth': cloth,
    '--cloth-light': `color-mix(in srgb, ${cloth} 80%, #fff)`,
    '--cloth-deep': `color-mix(in srgb, ${cloth} 62%, #000)`
  } as CSSProperties;
}
