export const STORAGE_KEY = 'family-stories:snapshot:v1';

// Leave room for other browser data and count localStorage's UTF-16 strings.
export const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

export interface StorageError {
  kind: 'quota' | 'unavailable' | 'serialization';
  message: string;
}

export type StorageWriteResult = { ok: true } | { ok: false; error: StorageError };

export function estimateStorageBytes(serialized: string, key = STORAGE_KEY): number {
  return (serialized.length + key.length) * 2;
}

function storageFailure(error: unknown): StorageWriteResult {
  const name = error instanceof Error ? error.name : '';
  const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
  return {
    ok: false,
    error: {
      kind: quota ? 'quota' : 'unavailable',
      message: quota
        ? 'В браузере закончилось место для книги. Скачайте резервную копию перед закрытием страницы.'
        : 'Браузер не разрешил сохранить изменения. Проверьте доступ к хранилищу или скачайте резервную копию.'
    }
  };
}

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): StorageWriteResult {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return {
      ok: false,
      error: { kind: 'serialization', message: 'Не удалось подготовить данные для сохранения. Изменения остаются в открытой вкладке.' }
    };
  }

  if (serialized === undefined) {
    return { ok: false, error: { kind: 'serialization', message: 'Нет данных для сохранения.' } };
  }
  if (estimateStorageBytes(serialized, key) > MAX_STORAGE_BYTES) {
    return {
      ok: false,
      error: {
        kind: 'quota',
        message: 'Книга превысила локальный лимит 4 МБ. Скачайте резервную копию; большие материалы храните отдельно.'
      }
    };
  }
  try {
    window.localStorage.setItem(key, serialized);
    return { ok: true };
  } catch (error) {
    return storageFailure(error);
  }
}

export function clearStorage(key: string): StorageWriteResult {
  try {
    window.localStorage.removeItem(key);
    return { ok: true };
  } catch (error) {
    return storageFailure(error);
  }
}
