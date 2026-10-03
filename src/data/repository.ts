import { STORAGE_KEY, clearStorage, readStorage, writeStorage } from '../lib/storage';
import { seedSnapshot } from './seed';
import type { AppSnapshot } from './types';

function cloneSeed(): AppSnapshot {
  return structuredClone(seedSnapshot);
}

export function loadSnapshot(): AppSnapshot {
  const stored = readStorage<AppSnapshot | null>(STORAGE_KEY, null);

  if (!stored || stored.version !== 1) {
    return cloneSeed();
  }

  return {
    ...cloneSeed(),
    ...stored,
    settings: { ...seedSnapshot.settings, ...stored.settings }
  };
}

export function persistSnapshot(snapshot: AppSnapshot): void {
  writeStorage(STORAGE_KEY, snapshot);
}

export function resetSnapshot(): AppSnapshot {
  clearStorage(STORAGE_KEY);
  return cloneSeed();
}
