import type { MediaAsset } from '../../data/types';
import { baseMimeType, isStoredMedia, mediaStore } from '../mediaStore';
import { MUSIC_LOOP_SECONDS, renderMusicLoop } from './music';
import { createCanvas, FilmRenderer, type FilmAssets, type PreparedAudio, type PreparedPhoto } from './renderer';
import { levelAt, musicEnvelope, type FilmAvailability, type FilmTimeline } from './timeline';

const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];
const MUSIC_LEVEL = 0.3;
const PEAKS_PER_SECOND = 24;

/** MP4 first: it opens in galleries and messengers; WebM where the browser can only record that. */
export function pickVideoMimeType(isTypeSupported: (type: string) => boolean): string {
  return VIDEO_TYPES.find((type) => {
    try { return isTypeSupported(type); } catch { return false; }
  }) ?? '';
}

export function canRecordFilm(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder === 'function'
    && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
    && pickVideoMimeType((type) => MediaRecorder.isTypeSupported(type)) !== '';
}

export interface FilmRecording {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
}

export interface FilmLoadResult extends FilmAvailability {
  failed: MediaAsset[];
}

export interface FilmPlayerState {
  time: number;
  playing: boolean;
}

async function assetBlob(asset: MediaAsset): Promise<Blob> {
  if (isStoredMedia(asset)) {
    const blob = await mediaStore().get(asset.id);
    if (!blob) throw new Error('Файл не найден на устройстве');
    return blob;
  }
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error('Файл недоступен');
  return response.blob();
}

async function preparePhoto(asset: MediaAsset): Promise<PreparedPhoto> {
  const blob = await assetBlob(asset);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || asset.width || 1200;
    const height = image.naturalHeight || asset.height || 800;
    // Phone photos are scaled down once so each frame draws a modest bitmap.
    const scale = Math.min(1, 1920 / Math.max(width, height));
    const canvas = createCanvas(width * scale, height * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const tiny = createCanvas(28, Math.max(1, 28 * (height / width)));
    tiny.getContext('2d')!.drawImage(canvas, 0, 0, tiny.width, tiny.height);
    const blur = createCanvas(200, Math.max(1, 200 * (height / width)));
    const blurContext = blur.getContext('2d')!;
    blurContext.imageSmoothingQuality = 'high';
    if ('filter' in blurContext) blurContext.filter = 'blur(4px) saturate(1.1)';
    blurContext.drawImage(tiny, -6, -6, blur.width + 12, blur.height + 12);
    return { image: canvas, width: canvas.width, height: canvas.height, blur };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function measurePeaks(buffer: AudioBuffer): Float32Array {
  const window = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SECOND));
  const count = Math.ceil(buffer.length / window);
  const peaks = new Float32Array(count);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  let loudest = 0;
  for (let slot = 0; slot < count; slot += 1) {
    let sum = 0;
    const end = Math.min(buffer.length, (slot + 1) * window);
    for (let index = slot * window; index < end; index += 4) {
      let value = 0;
      channels.forEach((data) => { value += data[index]; });
      value /= channels.length;
      sum += value * value;
    }
    peaks[slot] = Math.sqrt(sum / Math.max(1, (end - slot * window) / 4));
    loudest = Math.max(loudest, peaks[slot]);
  }
  if (loudest > 0) for (let slot = 0; slot < count; slot += 1) peaks[slot] = Math.min(1, (peaks[slot] / loudest) ** 0.8);
  return peaks;
}

function waitFor(element: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('media error')); };
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener(event, done);
      element.removeEventListener('error', fail);
    };
    element.addEventListener(event, done, { once: true });
    element.addEventListener('error', fail, { once: true });
  });
}

/** Plays the film on a canvas with sample-accurate audio and records it to a video file. */
export class FilmPlayer {
  private readonly canvas: HTMLCanvasElement;
  private renderer: FilmRenderer;
  private timeline: FilmTimeline | null = null;
  private readonly assets: FilmAssets = { photos: new Map(), audio: new Map(), videos: new Map() };
  private readonly objectUrls: string[] = [];
  private readonly durations = new Map<string, number>();
  private readonly photoIds = new Set<string>();
  private context: AudioContext | null = null;
  private master!: GainNode;
  /** Mixed, limited signal: goes to the speakers through `monitor` and to the recorder. */
  private output!: AudioNode;
  private monitor!: GainNode;
  private musicGain!: GainNode;
  private voiceBus!: GainNode;
  private music: AudioBuffer | null = null;
  private musicLoading: Promise<void> | null = null;
  private musicEnabled = true;
  private sources: AudioScheduledSourceNode[] = [];
  private playing = false;
  private offset = 0;
  private startedAt = 0;
  private frame = 0;
  private lastEmit = -1;
  private endResolver: (() => void) | null = null;
  private progress: ((value: number) => void) | null = null;
  private disposed = false;
  onState: ((state: FilmPlayerState) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, size: { width: number; height: number }) {
    this.canvas = canvas;
    canvas.width = size.width;
    canvas.height = size.height;
    this.renderer = new FilmRenderer(canvas);
  }

  get duration() { return this.timeline?.duration ?? 0; }
  get isPlaying() { return this.playing; }
  get currentTime() {
    if (!this.playing || !this.context) return this.offset;
    return Math.min(this.duration, this.offset + Math.max(0, this.context.currentTime - this.startedAt));
  }

  private ensureAudio(): AudioContext {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = new AudioContextClass({ latencyHint: 'playback' });
    this.master = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    this.monitor = context.createGain();
    this.musicGain = context.createGain();
    this.musicGain.gain.value = 0;
    this.voiceBus = context.createGain();
    this.voiceBus.gain.value = 1.15;
    this.musicGain.connect(this.master);
    this.voiceBus.connect(this.master);
    this.master.connect(limiter);
    limiter.connect(this.monitor);
    this.monitor.connect(context.destination);
    this.output = limiter;
    this.context = context;
    return context;
  }

  /**
   * Decode every asset the film may use; failures are reported, not thrown.
   * Assets decoded by an earlier call are kept, so a new voice-over only loads itself.
   */
  async load(everything: { photos: MediaAsset[]; audio: MediaAsset[]; videos: MediaAsset[] }, onProgress?: (done: number, total: number) => void): Promise<FilmLoadResult> {
    const context = this.ensureAudio();
    const durations = this.durations;
    const photos = this.photoIds;
    const failed: MediaAsset[] = [];
    const request = {
      photos: everything.photos.filter((asset) => !photos.has(asset.id)),
      audio: everything.audio.filter((asset) => !durations.has(asset.id)),
      videos: everything.videos.filter((asset) => !durations.has(asset.id))
    };
    const total = request.photos.length + request.audio.length + request.videos.length;
    let done = 0;
    const step = () => { done += 1; onProgress?.(done, total); };
    onProgress?.(0, total);

    await Promise.all([
      ...request.photos.map(async (asset) => {
        try {
          this.assets.photos.set(asset.id, await preparePhoto(asset));
          photos.add(asset.id);
        } catch { failed.push(asset); }
        step();
      }),
      ...request.audio.map(async (asset) => {
        try {
          const buffer = await context.decodeAudioData(await (await assetBlob(asset)).arrayBuffer());
          const prepared: PreparedAudio = { buffer, peaks: measurePeaks(buffer), peaksPerSecond: PEAKS_PER_SECOND };
          this.assets.audio.set(asset.id, prepared);
          durations.set(asset.id, Math.round(buffer.duration * 100) / 100);
        } catch { failed.push(asset); }
        step();
      }),
      ...request.videos.map(async (asset) => {
        try {
          const url = URL.createObjectURL(await assetBlob(asset));
          this.objectUrls.push(url);
          const video = document.createElement('video');
          video.preload = 'auto';
          video.playsInline = true;
          video.src = url;
          await waitFor(video, 'loadedmetadata', 15000);
          if (!Number.isFinite(video.duration)) {
            // Recorded WebM often lacks a duration until the end is visited.
            video.currentTime = 1e7;
            await waitFor(video, 'durationchange', 8000).catch(() => undefined);
            video.currentTime = 0;
          }
          if (video.readyState < 2) await waitFor(video, 'loadeddata', 8000).catch(() => undefined);
          if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('duration');
          context.createMediaElementSource(video).connect(this.voiceBus);
          video.addEventListener('seeked', () => { if (!this.playing) this.render(); });
          this.assets.videos.set(asset.id, video);
          durations.set(asset.id, Math.round(video.duration * 100) / 100);
        } catch { failed.push(asset); }
        step();
      })
    ]);
    this.musicLoading ??= renderMusicLoop(context.sampleRate).then((buffer) => { this.music = buffer; }, () => undefined);
    return { durations: new Map(durations), photos: new Set(photos), failed };
  }

  /** Switch the frame size (16:9 or 9:16); the canvas is owned by the player. */
  resize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer = new FilmRenderer(this.canvas);
    this.render();
  }

  setTimeline(timeline: FilmTimeline, { music }: { music: boolean }) {
    const wasPlaying = this.playing;
    const time = this.currentTime;
    if (wasPlaying) this.stopPlayback();
    this.timeline = timeline;
    this.musicEnabled = music;
    this.offset = Math.min(time, timeline.duration);
    if (wasPlaying) void this.play();
    else this.render();
  }

  render(time = this.currentTime) {
    if (!this.timeline || this.disposed) return;
    // Before the first play the film opens on black; show the chapter title as a poster instead.
    const frame = !this.playing && !this.progress && time === 0 ? Math.min(2.8, this.duration) : time;
    this.syncVideos(frame);
    this.renderer.draw(this.timeline, frame, this.assets);
  }

  async play() {
    if (!this.timeline || this.playing || this.disposed) return;
    const context = this.ensureAudio();
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    await context.resume().catch(() => undefined);
    if (this.musicEnabled && !this.music) await this.musicLoading;
    if (this.playing || this.disposed) return;
    this.startedAt = context.currentTime + 0.06;
    this.playing = true;
    this.scheduleAudio(this.offset, this.startedAt);
    this.emit(true);
    this.frame = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.stopPlayback();
    this.render();
    this.emit(true);
  }

  seek(time: number) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stopPlayback();
    this.offset = Math.min(Math.max(0, time), this.duration);
    if (wasPlaying) void this.play();
    else { this.render(); this.emit(true); }
  }

  /** Record the whole film in real time; the page must stay open meanwhile. */
  async record({ onProgress, signal, monitor = false }: { onProgress?: (value: number) => void; signal?: AbortSignal; monitor?: boolean } = {}): Promise<FilmRecording> {
    if (!this.timeline) throw new Error('Фильм ещё не готов.');
    const mimeType = pickVideoMimeType((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('Этот браузер не умеет сохранять видео. Откройте приложение в свежем Chrome, Safari или Firefox.');
    const context = this.ensureAudio();
    await context.resume().catch(() => undefined);
    if (this.musicEnabled && !this.music) await this.musicLoading;
    this.pause();
    this.offset = 0;

    const destination = context.createMediaStreamDestination();
    this.output.connect(destination);
    const stream = this.canvas.captureStream(30);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const previousMonitor = this.monitor.gain.value;
    this.monitor.gain.value = monitor ? 1 : 0;
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    const wakeLock = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request('screen').catch(() => null) ?? null;

    this.progress = onProgress ?? (() => undefined);
    this.render(0);
    let aborted: (() => void) | undefined;
    try {
      recorder.start(1000);
      await this.play();
      await new Promise<void>((resolve, reject) => {
        this.endResolver = resolve;
        if (signal?.aborted) reject(new DOMException('Сборка отменена', 'AbortError'));
        aborted = () => reject(new DOMException('Сборка отменена', 'AbortError'));
        signal?.addEventListener('abort', aborted, { once: true });
      });
      // Let the encoder take the last frames of the fade-out.
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    } finally {
      if (aborted) signal?.removeEventListener('abort', aborted);
      this.endResolver = null;
      this.progress = null;
      this.pause();
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      stream.getVideoTracks().forEach((track) => track.stop());
      try { this.output.disconnect(destination); } catch { /* already disconnected */ }
      this.monitor.gain.value = previousMonitor;
      void wakeLock?.release().catch(() => undefined);
    }
    const type = baseMimeType(recorder.mimeType || mimeType);
    return { blob: new Blob(chunks, { type }), mimeType: type, extension: type.includes('mp4') ? 'mp4' : 'webm' };
  }

  dispose() {
    this.disposed = true;
    this.stopPlayback();
    this.assets.videos.forEach((video) => { video.pause(); video.removeAttribute('src'); video.load(); });
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.onState = null;
  }

  private tick = () => {
    if (!this.playing || !this.timeline) return;
    const time = this.currentTime;
    if (time >= this.duration) {
      this.finish();
      return;
    }
    this.render(time);
    this.progress?.(time / this.duration);
    this.emit(false);
    this.frame = requestAnimationFrame(this.tick);
  };

  private finish() {
    this.offset = this.duration;
    this.stopPlayback();
    this.render(this.duration);
    this.progress?.(1);
    this.emit(true);
    this.endResolver?.();
  }

  private emit(force: boolean) {
    const time = this.currentTime;
    if (!force && Math.abs(time - this.lastEmit) < 0.1) return;
    this.lastEmit = time;
    this.onState?.({ time, playing: this.playing });
  }

  private stopPlayback() {
    this.playing = false;
    cancelAnimationFrame(this.frame);
    this.sources.forEach((source) => {
      try { source.stop(); } catch { /* not started */ }
      source.disconnect();
    });
    this.sources = [];
    if (this.context) {
      this.musicGain.gain.cancelScheduledValues(0);
      this.musicGain.gain.setValueAtTime(0, this.context.currentTime);
    }
    this.assets.videos.forEach((video) => { if (!video.paused) video.pause(); });
  }

  private scheduleAudio(from: number, at: number) {
    const context = this.context!;
    const timeline = this.timeline!;
    timeline.cues.forEach((cue) => {
      const audio = this.assets.audio.get(cue.assetId);
      if (!audio || cue.start + cue.duration <= from) return;
      const source = context.createBufferSource();
      source.buffer = audio.buffer;
      source.connect(this.voiceBus);
      source.start(at + Math.max(0, cue.start - from), Math.max(0, from - cue.start));
      this.sources.push(source);
    });
    if (this.musicEnabled && this.music) {
      const source = context.createBufferSource();
      source.buffer = this.music;
      source.loop = true;
      source.connect(this.musicGain);
      source.start(at, from % MUSIC_LOOP_SECONDS);
      this.sources.push(source);
      const envelope = musicEnvelope(timeline, MUSIC_LEVEL, MUSIC_LEVEL * 0.28);
      const gain = this.musicGain.gain;
      gain.cancelScheduledValues(0);
      gain.setValueAtTime(levelAt(envelope, from), at);
      envelope.filter((point) => point.time > from).forEach((point) => gain.linearRampToValueAtTime(point.level, at + point.time - from));
    }
  }

  private syncVideos(time: number) {
    if (!this.timeline) return;
    this.timeline.scenes.forEach((scene) => {
      if (scene.kind !== 'video') return;
      const video = this.assets.videos.get(scene.assetId);
      if (!video) return;
      const active = time >= scene.start - 0.05 && time < scene.start + scene.duration;
      if (!active) {
        if (!video.paused) video.pause();
        return;
      }
      const local = time - scene.start - scene.videoOffset;
      const target = Math.min(Math.max(0, local), Math.max(0, video.duration - 0.05));
      if (this.playing && local >= 0 && local < video.duration) {
        if (video.paused) {
          video.currentTime = target;
          void video.play().catch(() => undefined);
        } else if (Math.abs(video.currentTime - target) > 0.3) {
          video.currentTime = target;
        }
      } else {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - target) > 0.08) video.currentTime = target;
      }
    });
  }
}
