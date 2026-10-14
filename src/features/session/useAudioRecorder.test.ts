import { describe, expect, it } from 'vitest';
import { pickRecordingMimeType, recorderErrorStatus } from './useAudioRecorder';

describe('audio recorder helpers', () => {
  it('prefers Opus in WebM and falls back to MP4 for Safari', () => {
    expect(pickRecordingMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecordingMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecordingMimeType(() => false)).toBe('');
    expect(pickRecordingMimeType(() => { throw new Error('unsupported'); })).toBe('');
  });

  it('maps getUserMedia failures to clear states', () => {
    expect(recorderErrorStatus(new DOMException('no', 'NotAllowedError')).status).toBe('denied');
    expect(recorderErrorStatus(new DOMException('no', 'NotFoundError')).message).toContain('Микрофон не найден');
    expect(recorderErrorStatus(new DOMException('busy', 'NotReadableError')).message).toContain('занят');
    expect(recorderErrorStatus(new Error('boom')).status).toBe('error');
  });
});
