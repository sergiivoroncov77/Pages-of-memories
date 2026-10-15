import { describe, expect, it } from 'vitest';
import { pickVideoMimeType } from './player';

describe('film recording format', () => {
  it('prefers H.264 MP4 for galleries and messengers, then any MP4, then WebM', () => {
    expect(pickVideoMimeType(() => true)).toBe('video/mp4;codecs=avc1.42E01F,mp4a.40.2');
    expect(pickVideoMimeType((type) => type === 'video/mp4' || type.startsWith('video/webm'))).toBe('video/mp4');
    expect(pickVideoMimeType((type) => type.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickVideoMimeType(() => { throw new Error('unsupported'); })).toBe('');
  });
});
