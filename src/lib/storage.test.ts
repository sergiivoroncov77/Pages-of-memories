import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearStorage, estimateStorageBytes, MAX_STORAGE_BYTES, STORAGE_KEY, writeStorage } from './storage';

afterEach(() => vi.unstubAllGlobals());

describe('local storage writes', () => {
  it('reports success only after the browser accepts the serialized snapshot', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    expect(writeStorage(STORAGE_KEY, { title: 'Моя книга' })).toEqual({ ok: true });
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, '{"title":"Моя книга"}');
  });

  it('reports quota failures and leaves the previous snapshot intact', () => {
    let stored = '{"previous":true}';
    const setItem = vi.fn((_key: string, value: string) => {
      if (value.length > 2) throw new DOMException('Full', 'QuotaExceededError');
      stored = value;
    });
    vi.stubGlobal('window', { localStorage: { setItem } });
    expect(writeStorage(STORAGE_KEY, { new: true })).toMatchObject({ ok: false, error: { kind: 'quota' } });
    expect(stored).toBe('{"previous":true}');
    expect(writeStorage(STORAGE_KEY, {})).toEqual({ ok: true });
  });

  it('rejects oversized snapshots before touching browser storage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    expect(writeStorage(STORAGE_KEY, 'x'.repeat(MAX_STORAGE_BYTES / 2))).toMatchObject({ ok: false, error: { kind: 'quota' } });
    expect(setItem).not.toHaveBeenCalled();
    expect(estimateStorageBytes('текст', 'ключ')).toBe(18);
  });

  it('reports blocked access for both save and reset', () => {
    vi.stubGlobal('window', { get localStorage() { throw new DOMException('Blocked', 'SecurityError'); } });
    expect(writeStorage(STORAGE_KEY, {})).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    expect(clearStorage(STORAGE_KEY)).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });

  it('does not write broken serialization or undefined', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(writeStorage(STORAGE_KEY, circular)).toMatchObject({ ok: false, error: { kind: 'serialization' } });
    expect(writeStorage(STORAGE_KEY, undefined)).toMatchObject({ ok: false, error: { kind: 'serialization' } });
    expect(setItem).not.toHaveBeenCalled();
  });
});
