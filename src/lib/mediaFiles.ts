import type { MediaAsset, PerspectiveType } from '../data/types';

export const MAX_MEDIA_FILE_BYTES = 1024 * 1024;
export type MediaUpload = Omit<MediaAsset, 'id' | 'createdAt'>;

const mimeTypes: Record<string, Exclude<PerspectiveType, 'text'>> = {
  'image/jpeg': 'photo', 'image/png': 'photo', 'image/webp': 'photo', 'image/gif': 'photo', 'image/avif': 'photo',
  'audio/mpeg': 'audio', 'audio/mp3': 'audio', 'audio/mp4': 'audio', 'audio/aac': 'audio', 'audio/ogg': 'audio',
  'audio/wav': 'audio', 'audio/x-wav': 'audio', 'audio/webm': 'audio',
  'video/mp4': 'video', 'video/webm': 'video', 'video/ogg': 'video', 'video/quicktime': 'video'
};

export function getMediaType(mimeType: string): Exclude<PerspectiveType, 'text'> | null {
  return mimeTypes[mimeType.toLowerCase()] ?? null;
}

export function validateMediaFile(file: Pick<File, 'type' | 'size'>, expected?: PerspectiveType): string | null {
  const type = getMediaType(file.type);
  if (!type) return 'Этот формат не поддерживается. Выберите JPG, PNG, WebP, GIF, AVIF, аудио или видео.';
  if (expected && expected !== 'text' && type !== expected) return 'Файл не соответствует выбранному формату. Выберите другой файл или измените формат.';
  if (!file.size) return 'Файл пустой. Выберите другой материал.';
  if (file.size > MAX_MEDIA_FILE_BYTES) return 'Для локальной книги подходят файлы до 1 МБ. Выберите уменьшенную копию или короткий фрагмент.';
  return null;
}

export function readMediaFile(file: File): Promise<MediaUpload> {
  const error = validateMediaFile(file);
  if (error) return Promise.reject(new Error(error));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
        reject(new Error('Не удалось прочитать материал. Попробуйте выбрать файл ещё раз.'));
        return;
      }
      resolve({ type: getMediaType(file.type)!, url: reader.result, mimeType: file.type, fileName: file.name, sizeBytes: file.size, alt: file.name });
    });
    reader.addEventListener('error', () => reject(new Error('Не удалось прочитать файл. Проверьте, что он доступен на устройстве.')));
    reader.addEventListener('abort', () => reject(new Error('Чтение файла прервано. Попробуйте ещё раз.')));
    reader.readAsDataURL(file);
  });
}
