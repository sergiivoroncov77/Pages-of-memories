import type { MediaAsset, PerspectiveType } from '../data/types';
import { baseMimeType } from './mediaStore';

export const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024;
export type MediaUpload = Omit<MediaAsset, 'id' | 'createdAt'>;

const mimeTypes: Record<string, Exclude<PerspectiveType, 'text'>> = {
  'image/jpeg': 'photo', 'image/png': 'photo', 'image/webp': 'photo', 'image/gif': 'photo', 'image/avif': 'photo',
  'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/mp4': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/webm': 'audio',
  'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video', 'video/quicktime': 'video'
};

export function getMediaType(mimeType: string): Exclude<PerspectiveType, 'text'> | null {
  return mimeTypes[baseMimeType(mimeType)] ?? null;
}

export function validateMediaFile(file: Pick<File, 'type' | 'size'>, expected?: PerspectiveType): string | null {
  const type = getMediaType(file.type);
  if (!type) return 'Этот формат не поддерживается. Выберите JPG, PNG, WebP, GIF, AVIF, аудио или видео.';
  if (expected && expected !== 'text' && type !== expected) return 'Файл не соответствует выбранному формату. Выберите другой файл или измените формат.';
  if (!file.size) return 'Файл пустой. Выберите другой материал.';
  if (file.size > MAX_MEDIA_FILE_BYTES) return 'Для книги подходят файлы до 50 МБ. Выберите уменьшенную копию или короткий фрагмент.';
  return null;
}

/** Media metadata plus the bytes that go to the IndexedDB blob store. */
export interface MediaUploadWithBlob extends MediaUpload {
  blob: Blob;
}

export function prepareMediaFile(file: File): MediaUploadWithBlob {
  const error = validateMediaFile(file);
  if (error) throw new Error(error);
  const mimeType = baseMimeType(file.type);
  return { type: getMediaType(mimeType)!, url: '', mimeType, fileName: file.name, sizeBytes: file.size, alt: file.name, blob: file };
}
