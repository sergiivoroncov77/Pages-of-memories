export const STORAGE_KEY = 'family-stories:snapshot:v1';

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // В прототипе хранилище может быть недоступно в приватном режиме.
  }
}

export function clearStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ничего не делаем: демо должно продолжать работать без хранилища.
  }
}
