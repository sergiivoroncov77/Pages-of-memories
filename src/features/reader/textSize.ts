import { readStorage, writeStorage } from '../../lib/storage';

/** The reader's text sizes, smallest first: a device's own choice, so it stays out of the book's synced settings. */
export const TEXT_SIZES = [
  { scale: 0.85, label: 'мелкий' },
  { scale: 0.93, label: 'чуть мельче' },
  { scale: 1, label: 'обычный' },
  { scale: 1.15, label: 'крупный' },
  { scale: 1.3, label: 'очень крупный' },
  { scale: 1.45, label: 'самый крупный' }
] as const;

export const NORMAL_TEXT_SIZE = 2;

const KEY = 'family-stories:reader-text-size:v2';
/** Before smaller sizes existed: 0 normal, 1 large, 2 very large. */
const OLD_KEY = 'family-stories:reader-text-size:v1';

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < TEXT_SIZES.length;

export function readTextSizeIndex(): number {
  const stored = readStorage<unknown>(KEY, null);
  if (valid(stored)) return stored;
  const old = readStorage<unknown>(OLD_KEY, null);
  return typeof old === 'number' && Number.isInteger(old) && old >= 0 && old <= 2 ? NORMAL_TEXT_SIZE + old : NORMAL_TEXT_SIZE;
}

export function saveTextSizeIndex(index: number): void {
  writeStorage(KEY, index);
}
