/**
 * Cloth colours a book's cover can take. A book keeps the id; one without
 * it gets a colour by its place on the shelf (the first six, in this order).
 */
export const COVER_COLORS = [
  { id: 'green', name: 'Зелёная', cloth: '#3a4a3e' },
  { id: 'wine', name: 'Бордовая', cloth: '#6b2f34' },
  { id: 'blue', name: 'Синяя', cloth: '#2f3f5b' },
  { id: 'brown', name: 'Коричневая', cloth: '#5a4030' },
  { id: 'plum', name: 'Сливовая', cloth: '#4b3b5c' },
  { id: 'teal', name: 'Морская', cloth: '#2f5257' },
  { id: 'red', name: 'Красная', cloth: '#8b2a24' },
  { id: 'ochre', name: 'Горчичная', cloth: '#7d5a1e' },
  { id: 'graphite', name: 'Графитовая', cloth: '#36373c' }
] as const;

export type CoverColor = (typeof COVER_COLORS)[number];

const SHELF_COLORS = 6;

export function isCoverColor(value: unknown): value is CoverColor['id'] {
  return COVER_COLORS.some((color) => color.id === value);
}

/** The colour a book is bound in: its own, or the one its shelf place gives. */
export function coverColorOf(book: { id: string; coverColor?: string }, books: { id: string }[]): CoverColor {
  const own = COVER_COLORS.find((color) => color.id === book.coverColor);
  if (own) return own;
  return COVER_COLORS[Math.max(0, books.findIndex((item) => item.id === book.id)) % SHELF_COLORS];
}
