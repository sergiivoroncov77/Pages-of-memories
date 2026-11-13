/// <reference lib="webworker" />
import { Mp3Encoder } from '@breezystack/lamejs';

/** Encodes 16-bit mono samples to MP3 off the main thread, so the app stays responsive. */
self.onmessage = (event: MessageEvent<{ samples: Int16Array; sampleRate: number; kbps: number }>) => {
  try {
    const { samples, sampleRate, kbps } = event.data;
    const encoder = new Mp3Encoder(1, sampleRate, kbps);
    const parts: Uint8Array[] = [];
    const frame = 1152;
    for (let index = 0; index < samples.length; index += frame) {
      const chunk = encoder.encodeBuffer(samples.subarray(index, index + frame));
      if (chunk.length) parts.push(new Uint8Array(chunk));
    }
    const tail = encoder.flush();
    if (tail.length) parts.push(new Uint8Array(tail));
    (self as unknown as Worker).postMessage({ ok: true, parts }, parts.map((part) => part.buffer));
  } catch (error) {
    (self as unknown as Worker).postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
