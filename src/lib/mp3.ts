/**
 * Recordings become MP3 on the device right after they are made: browsers
 * record WebM (Chrome, Firefox, Android) or M4A (Safari), and MP3 is the one
 * format every phone, browser, Google Drive and computer plays. A free,
 * open-source encoder (lamejs) runs in the browser; nothing leaves the device.
 */

/** Voice sounds clear at this rate and stays small: about 0.35 MB a minute. */
const SAMPLE_RATE = 24000;
const KBPS = 48;

/** Decode any recording the browser can play into mono samples at the encoder's rate. */
async function decodeToMono(blob: Blob): Promise<Int16Array> {
  const bytes = await blob.arrayBuffer();
  const OfflineContext = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  // decodeAudioData resamples to the context's rate.
  const decoded = await new OfflineContext(1, 1, SAMPLE_RATE).decodeAudioData(bytes);
  const length = decoded.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let index = 0; index < length; index += 1) mono[index] += data[index] / decoded.numberOfChannels;
  }
  const samples = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const value = Math.max(-1, Math.min(1, mono[index]));
    samples[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return samples;
}

function encodeInWorker(samples: Int16Array): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mp3Encoder.worker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => { worker.terminate(); reject(new Error('timeout')); }, 120_000);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; parts?: Uint8Array[]; message?: string }>) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (event.data.ok && event.data.parts) resolve(event.data.parts);
      else reject(new Error(event.data.message ?? 'encoding failed'));
    };
    worker.onerror = (event) => { window.clearTimeout(timer); worker.terminate(); reject(new Error(event.message || 'worker failed')); };
    worker.postMessage({ samples, sampleRate: SAMPLE_RATE, kbps: KBPS }, [samples.buffer]);
  });
}

/** Without workers (very old browsers) the same encoder runs here, a piece at a time. */
async function encodeHere(samples: Int16Array): Promise<Uint8Array[]> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, KBPS);
  const parts: Uint8Array[] = [];
  const frame = 1152;
  for (let index = 0; index < samples.length; index += frame) {
    const chunk = encoder.encodeBuffer(samples.subarray(index, index + frame));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if (index % (frame * 200) === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return parts;
}

export interface Mp3Result {
  blob: Blob;
  durationSeconds: number;
}

/** The recording as MP3, or null when this browser cannot decode it (the original is kept then). */
export async function convertToMp3(recording: Blob): Promise<Mp3Result | null> {
  if (/audio\/mpeg/i.test(recording.type)) return null;
  try {
    const samples = await decodeToMono(recording);
    if (!samples.length) return null;
    const durationSeconds = Math.max(1, Math.round(samples.length / SAMPLE_RATE));
    const parts = typeof Worker === 'function'
      ? await encodeInWorker(samples.slice()).catch(() => encodeHere(samples))
      : await encodeHere(samples);
    const blob = new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
    return blob.size ? { blob, durationSeconds } : null;
  } catch {
    return null;
  }
}
