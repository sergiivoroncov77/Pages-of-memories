import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftAutosave } from './draftAutosave';

const input = { personId: 'person_1', questionId: 'question_1', transcript: 'Первый текст', durationSeconds: 10, tags: ['семья'], photoUrl: '', photoAlt: '' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('question draft autosave', () => {
  it('saves the final text, tags, and photo together after editing settles', () => {
    const save = vi.fn();
    const autosave = createDraftAutosave(save);
    autosave.schedule(input);
    vi.advanceTimersByTime(200);
    const edited = { ...input, transcript: 'Исправленный текст', tags: ['дом'], photoUrl: '/family.jpg', photoAlt: 'Семья' };
    autosave.schedule(edited);
    vi.advanceTimersByTime(399);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledExactlyOnceWith(edited);
  });

  it('flushes the newest edit immediately when navigating or closing the page', () => {
    const save = vi.fn();
    const autosave = createDraftAutosave(save);
    autosave.schedule(input);
    autosave.flush();
    autosave.flush();
    vi.runAllTimers();
    expect(save).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('does not recreate a draft on unmount after publishing', () => {
    const save = vi.fn();
    const autosave = createDraftAutosave(save);
    autosave.schedule(input);
    autosave.cancel();
    autosave.flush();
    vi.runAllTimers();
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the outgoing question separate when switching route parameters', () => {
    const save = vi.fn();
    const first = createDraftAutosave(save);
    const second = createDraftAutosave(save);
    first.schedule(input);
    first.flush();
    second.schedule({ ...input, questionId: 'question_2', transcript: 'Другой ответ' });
    vi.runAllTimers();
    expect(save.mock.calls.map(([draft]) => draft.questionId)).toEqual(['question_1', 'question_2']);
  });
});
