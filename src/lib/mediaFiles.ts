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

/** Other names systems give the same formats (an iPhone's .m4a often comes as audio/x-m4a). */
const ALIASES: Record<string, string> = {
  'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/x-mp4': 'audio/mp4', 'audio/x-aac': 'audio/aac', 'audio/aacp': 'audio/aac',
  'audio/mpeg3': 'audio/mpeg', 'audio/x-mpeg': 'audio/mpeg', 'audio/x-mp3': 'audio/mpeg', 'audio/mp3': 'audio/mpeg', 'audio/vnd.wave': 'audio/wav',
  'audio/wave': 'audio/wav', 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'video/x-m4v': 'video/mp4'
};
/** When the system gives no type at all, the file name tells it. */
const EXTENSIONS: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', weba: 'audio/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime'
};

/** The file's type under the name the book uses. */
export function fileMimeType(file: Pick<File, 'type'> & { name?: string }): string {
  const given = baseMimeType(file.type || '');
  if (given && mimeTypes[given]) return given;
  if (given && ALIASES[given]) return ALIASES[given];
  const extension = file.name?.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSIONS[extension] ?? given;
}

export function validateMediaFile(file: Pick<File, 'type' | 'size'> & { name?: string }, expected?: PerspectiveType): string | null {
  const type = getMediaType(fileMimeType(file));
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
  const mimeType = fileMimeType(file);
  // The bytes are stored under the same type as the record, so players and exports agree.
  const blob = file.type === mimeType ? file : new Blob([file], { type: mimeType });
  return { type: getMediaType(mimeType)!, url: '', mimeType, fileName: file.name, sizeBytes: file.size, alt: file.name, blob };
}
