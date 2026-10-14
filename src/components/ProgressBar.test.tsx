import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('has an accessible name and meaningful progress text', () => {
    const html = renderToStaticMarkup(<ProgressBar value={2} max={5} />);
    expect(html).toContain('aria-label="Ответы на вопросы"');
    expect(html).toContain('aria-valuetext="2 из 5 вопросов с сохранённым ответом"');
    expect(html).toContain('width:40%');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not create an invalid ARIA range for a total of %s', (max) => {
    const html = renderToStaticMarkup(<ProgressBar value={3} max={max} />);
    expect(html).toContain('Вопросов пока нет');
    expect(html).not.toContain('role="progressbar"');
  });

  it.each([
    [-5, 0, 0],
    [Number.NaN, 0, 0],
    [Number.POSITIVE_INFINITY, 0, 0],
    [9, 5, 100],
    [2.5, 2, 40]
  ])('keeps %s within the valid question range', (value, current, percent) => {
    const html = renderToStaticMarkup(<ProgressBar value={value} max={5} label="Готовые ответы" />);
    expect(html).toContain(`aria-valuenow="${current}"`);
    expect(html).toContain('aria-valuemax="5"');
    expect(html).toContain(`width:${percent}%`);
    expect(html).toContain('aria-label="Готовые ответы"');
  });
});
