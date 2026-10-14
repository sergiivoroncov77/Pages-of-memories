import { describe, expect, it } from 'vitest';
import { getMediaType, MAX_MEDIA_FILE_BYTES, validateMediaFile } from './mediaFiles';

describe('local media validation', () => {
  it('accepts supported photos, audio and video', () => {
    for (const type of ['image/png', 'image/jpeg', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm']) {
      expect(validateMediaFile({ type, size: 100 })).toBeNull();
    }
    expect(getMediaType('IMAGE/JPEG')).toBe('photo');
  });

  it('rejects empty, oversized, executable and mismatched files', () => {
    expect(validateMediaFile({ type: 'image/png', size: 0 })).toContain('пустой');
    expect(validateMediaFile({ type: 'image/png', size: MAX_MEDIA_FILE_BYTES + 1 })).toContain('до 50 МБ');
    for (const type of ['text/html', 'application/javascript', 'image/svg+xml', '']) {
      expect(validateMediaFile({ type, size: 100 })).toContain('не поддерживается');
    }
    expect(validateMediaFile({ type: 'video/mp4', size: 100 }, 'photo')).toContain('не соответствует');
  });
});
