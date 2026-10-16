import { describe, expect, it } from 'vitest';
import { safeFileName } from './fileName';

describe('safeFileName', () => {
  it('transliterates Russian titles and drops unsafe characters', () => {
    expect(safeFileName('Книга бабушки Веры: лето / 1950')).toBe('kniga-babushki-very-leto-1950');
    expect(safeFileName('Глава первая — Откуда всё начинается')).toBe('glava-pervaya-otkuda-vse-nachinaetsya');
    expect(safeFileName('Щука и ёжик')).toBe('shchuka-i-ezhik');
  });

  it('falls back when nothing is left', () => {
    expect(safeFileName('«»!!!')).toBe('kniga');
    expect(safeFileName('', 'film')).toBe('film');
  });
});
