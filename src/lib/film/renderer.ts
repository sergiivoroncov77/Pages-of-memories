import { seededRandom } from './text';
import {
  sceneIndexAt, TRANSITION_SECONDS, type ChapterScene, type FilmScene, type FilmTimeline, type FinaleScene, type MomentScene,
  type PhotoScene, type ReflectionsScene, type TextScene, type VideoScene, type VoiceScene
} from './timeline';

/** Decoded media, ready to be drawn or played. */
export interface PreparedPhoto {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Small, softened copy used as an ambient background. */
  blur: HTMLCanvasElement;
}

export interface PreparedAudio {
  buffer: AudioBuffer;
  /** Loudness envelope 0..1, `peaksPerSecond` values per second. */
  peaks: Float32Array;
  peaksPerSecond: number;
}

export interface FilmAssets {
  photos: Map<string, PreparedPhoto>;
  audio: Map<string, PreparedAudio>;
  videos: Map<string, HTMLVideoElement>;
}

type Ctx = CanvasRenderingContext2D;

const SERIF = 'Georgia, "Noto Serif", "PT Serif", "Times New Roman", serif';
const SANS = '"Segoe UI", system-ui, -apple-system, Roboto, "Noto Sans", sans-serif';
const C = {
  ink: '#2d2925', soft: '#64564b', accent: '#9b5038', gold: '#a8823f', cream: '#f8f0e2',
  night: '#15120f', print: '#fbf7ee', goldLight: '#e6c78f'
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const easeOut = (value: number) => 1 - (1 - clamp01(value)) ** 3;
const easeInOut = (value: number) => {
  const v = clamp01(value);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
/** 0→1 entrance curve starting at `delay` seconds. */
const appear = (local: number, delay: number, length = 0.9) => easeOut((local - delay) / length);

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function setSpacing(ctx: Ctx, value: string) {
  // Letter spacing is progressive enhancement for small caps.
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = value;
}

interface TextLayout { lines: string[]; size: number; lineHeight: number; height: number; width: number }

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  text.split('\n').forEach((paragraph) => {
    let line = '';
    paragraph.split(/\s+/).filter(Boolean).forEach((word) => {
      const candidate = line ? line + ' ' + word : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    lines.push(line);
  });
  return lines;
}

interface FitOptions {
  font: (size: number) => string;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeight?: number;
  maxLines?: number;
}

/** Wrap a text into the box using the largest font size that fits. */
function fitText(ctx: Ctx, text: string, options: FitOptions): TextLayout {
  const ratio = options.lineHeight ?? 1.3;
  const maxLines = options.maxLines ?? Infinity;
  const measure = (size: number, lines: string[]): TextLayout => ({
    lines, size, lineHeight: size * ratio, height: lines.length * size * ratio,
    width: Math.max(0, ...lines.map((line) => ctx.measureText(line).width))
  });
  for (let size = options.maxSize; size > options.minSize; size -= 2) {
    ctx.font = options.font(size);
    const lines = wrap(ctx, text, options.maxWidth);
    if (lines.length <= maxLines && lines.length * size * ratio <= options.maxHeight) return measure(size, lines);
  }
  ctx.font = options.font(options.minSize);
  let lines = wrap(ctx, text, options.maxWidth);
  const fitting = Math.max(1, Math.min(maxLines, Math.floor(options.maxHeight / (options.minSize * ratio))));
  if (lines.length > fitting) {
    lines = lines.slice(0, fitting);
    let last = lines[fitting - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > options.maxWidth) last = last.slice(0, -1);
    lines[fitting - 1] = last.trimEnd() + '…';
  }
  return measure(options.minSize, lines);
}

function drawLines(ctx: Ctx, layout: TextLayout, x: number, top: number, align: CanvasTextAlign, reveal?: (index: number) => number) {
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const base = ctx.globalAlpha;
  layout.lines.forEach((line, index) => {
    const amount = reveal ? reveal(index) : 1;
    if (amount <= 0) return;
    ctx.globalAlpha = base * amount;
    ctx.fillText(line, x, top + layout.lineHeight * index + layout.size * 0.95 + (1 - amount) * 10);
  });
  ctx.globalAlpha = base;
}

function roundRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawCover(ctx: Ctx, photo: PreparedPhoto, x: number, y: number, width: number, height: number, zoom = 1, panX = 0, panY = 0) {
  const target = width / height;
  let sourceWidth = photo.width;
  let sourceHeight = photo.height;
  if (photo.width / photo.height > target) sourceWidth = photo.height * target;
  else sourceHeight = photo.width / target;
  sourceWidth /= zoom;
  sourceHeight /= zoom;
  const sx = (photo.width - sourceWidth) * (0.5 + panX / 2);
  const sy = (photo.height - sourceHeight) * (0.5 + panY / 2);
  ctx.drawImage(photo.image, sx, sy, sourceWidth, sourceHeight, x, y, width, height);
}

/** Slow zoom and drift that is different, but stable, for each scene. */
function kenBurns(seed: string, progress: number) {
  const zoomIn = seededRandom(seed, 1) > 0.35;
  const from = zoomIn ? 1.02 : 1.15;
  const to = zoomIn ? 1.15 : 1.02;
  const panX = (seededRandom(seed, 2) * 2 - 1) * 0.7;
  const panY = (seededRandom(seed, 3) * 2 - 1) * 0.5;
  const amount = easeInOut(progress * 0.9 + 0.05);
  return { zoom: lerp(from, to, amount), panX: lerp(panX, -panX * 0.6, amount), panY: lerp(panY, -panY * 0.6, amount) };
}

export class FilmRenderer {
  readonly width: number;
  readonly height: number;
  private readonly ctx: Ctx;
  private readonly buffer: HTMLCanvasElement;
  private readonly bufferCtx: Ctx;
  private readonly paper: HTMLCanvasElement;
  private readonly vignette: HTMLCanvasElement;
  private readonly videoBlur: HTMLCanvasElement;
  private readonly layouts = new Map<string, TextLayout>();
  private readonly unit: number;
  private readonly portrait: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext('2d')!;
    this.buffer = createCanvas(this.width, this.height);
    this.bufferCtx = this.buffer.getContext('2d')!;
    this.paper = makePaper(this.width, this.height);
    this.vignette = makeVignette(this.width, this.height);
    this.videoBlur = createCanvas(48, 48 * (this.height / this.width));
    this.unit = Math.min(this.width, this.height) / 720;
    this.portrait = this.height > this.width;
  }

  draw(timeline: FilmTimeline, time: number, assets: FilmAssets) {
    const { ctx, width: W, height: H } = this;
    if (!timeline.scenes.length) return;
    const index = sceneIndexAt(timeline, time);
    const scene = timeline.scenes[index];
    const local = time - scene.start;
    const transition = TRANSITION_SECONDS[scene.transition];
    if (index > 0 && local < transition) {
      const previous = timeline.scenes[index - 1];
      const progress = easeInOut(local / transition);
      if (scene.transition === 'page') {
        this.drawScene(ctx, scene, local, assets);
        this.drawScene(this.bufferCtx, previous, time - previous.start, assets);
        this.pageTurn(progress);
      } else {
        this.drawScene(ctx, previous, time - previous.start, assets);
        this.drawScene(this.bufferCtx, scene, local, assets);
        ctx.globalAlpha = progress;
        ctx.drawImage(this.buffer, 0, 0);
        ctx.globalAlpha = 1;
      }
    } else {
      this.drawScene(ctx, scene, local, assets);
    }
    ctx.drawImage(this.vignette, 0, 0);
    const fade = Math.max(1 - time / 0.9, (time - (timeline.duration - 1.6)) / 1.6);
    if (fade > 0) {
      ctx.fillStyle = `rgba(14, 11, 9, ${clamp01(fade)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawScene(ctx: Ctx, scene: FilmScene, local: number, assets: FilmAssets) {
    ctx.save();
    switch (scene.kind) {
      case 'chapter': this.chapter(ctx, scene, local); break;
      case 'moment': this.moment(ctx, scene, local); break;
      case 'photo': this.photo(ctx, scene, local, assets); break;
      case 'text': this.text(ctx, scene, local, assets); break;
      case 'voice': this.voice(ctx, scene, local, assets); break;
      case 'video': this.video(ctx, scene, local, assets); break;
      case 'reflections': this.reflections(ctx, scene, local); break;
      case 'finale': this.finale(ctx, scene, local); break;
    }
    ctx.restore();
  }

  private layout(ctx: Ctx, key: string, text: string, options: FitOptions): TextLayout {
    const cached = this.layouts.get(key);
    if (cached) { ctx.font = options.font(cached.size); return cached; }
    const layout = fitText(ctx, text, options);
    if (this.layouts.size > 400) this.layouts.clear();
    this.layouts.set(key, layout);
    ctx.font = options.font(layout.size);
    return layout;
  }

  private paperBackground(ctx: Ctx) {
    ctx.drawImage(this.paper, 0, 0);
  }

  private photoBackground(ctx: Ctx, photo: PreparedPhoto, darken = 0.55) {
    ctx.fillStyle = C.night;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.imageSmoothingQuality = 'high';
    const ratio = photo.blur.width / photo.blur.height;
    let width = this.width * 1.1;
    let height = width / ratio;
    if (height < this.height * 1.1) { height = this.height * 1.1; width = height * ratio; }
    ctx.drawImage(photo.blur, (this.width - width) / 2, (this.height - height) / 2, width, height);
    ctx.fillStyle = `rgba(20, 15, 11, ${darken})`;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private ornament(ctx: Ctx, cx: number, y: number, width: number, progress: number, color = C.gold) {
    if (progress <= 0) return;
    const u = this.unit;
    const reach = (width / 2 - 14 * u) * easeOut(progress);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4 * u;
    ctx.globalAlpha *= clamp01(progress * 2);
    ctx.beginPath();
    ctx.moveTo(cx - 12 * u, y); ctx.lineTo(cx - 12 * u - reach, y);
    ctx.moveTo(cx + 12 * u, y); ctx.lineTo(cx + 12 * u + reach, y);
    ctx.stroke();
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4.5 * u, -4.5 * u, 9 * u, 9 * u);
    ctx.restore();
    if (progress > 0.85) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha *= clamp01((progress - 0.85) / 0.15);
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(cx + side * (12 * u + reach + 6 * u), y, 2.3 * u, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  private smallCaps(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', spacing = 0.28) {
    ctx.font = `600 ${size}px ${SANS}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    setSpacing(ctx, `${Math.round(size * spacing)}px`);
    ctx.fillText(text.toLocaleUpperCase('ru'), x, y);
    setSpacing(ctx, '0px');
  }

  /** A photo print with a paper border and soft shadow; Ken Burns runs inside the frame. */
  private print(ctx: Ctx, photo: PreparedPhoto, cx: number, cy: number, maxWidth: number, maxHeight: number, rotation: number, seed: string, progress: number) {
    const ratio = Math.min(1.9, Math.max(0.62, photo.width / photo.height));
    let width = maxWidth;
    let height = width / ratio;
    if (height > maxHeight) { height = maxHeight; width = height * ratio; }
    const border = Math.round(Math.min(width, height) * 0.035 + 6 * this.unit);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.shadowColor = 'rgba(25, 16, 8, 0.38)';
    ctx.shadowBlur = 34 * this.unit;
    ctx.shadowOffsetY = 14 * this.unit;
    ctx.fillStyle = C.print;
    ctx.fillRect(-width / 2 - border, -height / 2 - border, width + border * 2, height + border * 2);
    ctx.shadowColor = 'transparent';
    const motion = kenBurns(seed, progress);
    drawCover(ctx, photo, -width / 2, -height / 2, width, height, motion.zoom, motion.panX, motion.panY);
    ctx.strokeStyle = 'rgba(60, 40, 20, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-width / 2, -height / 2, width, height);
    ctx.restore();
    return { width: width + border * 2, height: height + border * 2 };
  }

  private stack(items: { height: number; gap?: number; draw: (top: number) => void }[], centerY = this.height / 2) {
    const total = items.reduce((sum, item, index) => sum + item.height + (index ? item.gap ?? 0 : 0), 0);
    let top = centerY - total / 2;
    items.forEach((item, index) => {
      if (index) top += item.gap ?? 0;
      item.draw(top);
      top += item.height;
    });
  }

  private chapter(ctx: Ctx, scene: ChapterScene, local: number) {
    const { width: W, unit: u } = this;
    this.paperBackground(ctx);
    const title = this.layout(ctx, scene.id + ':title', scene.title, {
      font: (size) => `700 ${size}px ${SERIF}`, maxWidth: W * 0.82, maxHeight: 280 * u, maxSize: 84 * u, minSize: 40 * u, lineHeight: 1.12, maxLines: 3
    });
    const description = scene.description ? this.layout(ctx, scene.id + ':description', scene.description, {
      font: (size) => `italic ${size}px ${SERIF}`, maxWidth: W * (this.portrait ? 0.8 : 0.62), maxHeight: 130 * u, maxSize: 30 * u, minSize: 20 * u, lineHeight: 1.4, maxLines: 3
    }) : null;
    this.stack([
      { height: 20 * u, draw: (top) => { ctx.globalAlpha = appear(local, 0.3); this.smallCaps(ctx, scene.bookTitle, W / 2, top + 16 * u, 16 * u, C.soft); } },
      { height: 10 * u, gap: 26 * u, draw: (top) => { ctx.globalAlpha = 1; this.ornament(ctx, W / 2, top + 5 * u, 260 * u, appear(local, 0.5, 1.6)); } },
      { height: 26 * u, gap: 30 * u, draw: (top) => { ctx.globalAlpha = appear(local, 0.8); this.smallCaps(ctx, scene.chapterLabel, W / 2, top + 22 * u, 22 * u, C.accent, 'center', 0.32); } },
      { height: title.height, gap: 22 * u, draw: (top) => {
        ctx.globalAlpha = 1;
        ctx.font = `700 ${title.size}px ${SERIF}`;
        ctx.fillStyle = C.ink;
        drawLines(ctx, title, W / 2, top, 'center', (line) => appear(local, 1.1 + line * 0.15, 1.1));
      } },
      ...(description ? [{ height: description.height, gap: 26 * u, draw: (top: number) => {
        ctx.globalAlpha = appear(local, 1.9, 1.2);
        ctx.font = `italic ${description.size}px ${SERIF}`;
        ctx.fillStyle = C.soft;
        drawLines(ctx, description, W / 2, top, 'center');
      } }] : [])
    ]);
  }

  private moment(ctx: Ctx, scene: MomentScene, local: number) {
    const { width: W, unit: u } = this;
    this.paperBackground(ctx);
    const title = this.layout(ctx, scene.id + ':title', scene.title, {
      font: (size) => `700 ${size}px ${SERIF}`, maxWidth: W * 0.8, maxHeight: 250 * u, maxSize: 66 * u, minSize: 34 * u, lineHeight: 1.15, maxLines: 3
    });
    const summary = scene.summary ? this.layout(ctx, scene.id + ':summary', scene.summary, {
      font: (size) => `italic ${size}px ${SERIF}`, maxWidth: W * (this.portrait ? 0.82 : 0.64), maxHeight: 160 * u, maxSize: 29 * u, minSize: 20 * u, lineHeight: 1.42, maxLines: 4
    }) : null;
    const items: { height: number; gap?: number; draw: (top: number) => void }[] = [];
    if (scene.date) items.push({ height: 22 * u, draw: (top) => { ctx.globalAlpha = appear(local, 0.5); this.smallCaps(ctx, scene.date, W / 2, top + 18 * u, 18 * u, C.accent); } });
    items.push({ height: title.height, gap: 22 * u, draw: (top) => {
      ctx.globalAlpha = 1;
      ctx.font = `700 ${title.size}px ${SERIF}`;
      ctx.fillStyle = C.ink;
      drawLines(ctx, title, W / 2, top, 'center', (line) => appear(local, 0.75 + line * 0.14, 1));
    } });
    items.push({ height: 10 * u, gap: 26 * u, draw: (top) => { ctx.globalAlpha = 1; this.ornament(ctx, W / 2, top + 5 * u, 200 * u, appear(local, 1.1, 1.3)); } });
    if (summary) items.push({ height: summary.height, gap: 24 * u, draw: (top) => {
      ctx.globalAlpha = appear(local, 1.5, 1.1);
      ctx.font = `italic ${summary.size}px ${SERIF}`;
      ctx.fillStyle = C.soft;
      drawLines(ctx, summary, W / 2, top, 'center');
    } });
    if (scene.narrators.length) items.push({ height: 20 * u, gap: 26 * u, draw: (top) => {
      ctx.globalAlpha = appear(local, 2, 1);
      this.smallCaps(ctx, (scene.narrators.length > 1 ? 'Вспоминают: ' : 'Вспоминает: ') + scene.narrators.join(', '), W / 2, top + 16 * u, 15 * u, C.soft, 'center', 0.18);
    } });
    this.stack(items);
  }

  private photo(ctx: Ctx, scene: PhotoScene, local: number, assets: FilmAssets) {
    const { width: W, height: H, unit: u } = this;
    const photo = assets.photos.get(scene.assetId);
    if (!photo) { this.paperBackground(ctx); return; }
    this.photoBackground(ctx, photo);
    const captionSpace = scene.caption ? 120 * u : 70 * u;
    const rotation = (seededRandom(scene.id, 7) * 2 - 1) * 0.03;
    const settle = easeOut(local / 1.4);
    const frame = this.print(ctx, photo, W / 2, (H - captionSpace) / 2 + 10 * u, W * (this.portrait ? 0.86 : 0.74) * lerp(0.96, 1, settle),
      (H - captionSpace - 70 * u) * lerp(0.96, 1, settle), rotation, scene.id, local / scene.duration);
    const captionTop = (H - captionSpace) / 2 + 10 * u + frame.height / 2 + 26 * u;
    if (scene.caption) {
      const caption = this.layout(ctx, scene.id + ':caption', scene.caption, {
        font: (size) => `italic ${size}px ${SERIF}`, maxWidth: W * 0.8, maxHeight: 72 * u, maxSize: 30 * u, minSize: 20 * u, lineHeight: 1.3, maxLines: 2
      });
      ctx.globalAlpha = appear(local, 0.8);
      ctx.fillStyle = C.cream;
      drawLines(ctx, caption, W / 2, captionTop, 'center');
      ctx.globalAlpha = appear(local, 1.2);
      this.smallCaps(ctx, scene.author, W / 2, captionTop + caption.height + 26 * u, 14 * u, C.goldLight);
    } else {
      ctx.globalAlpha = appear(local, 1);
      this.smallCaps(ctx, scene.author, W / 2, captionTop + 18 * u, 14 * u, C.goldLight);
    }
    ctx.globalAlpha = 1;
  }

  private text(ctx: Ctx, scene: TextScene, local: number, assets: FilmAssets) {
    const { width: W, height: H, unit: u, portrait } = this;
    this.paperBackground(ctx);
    const photo = scene.photoId ? assets.photos.get(scene.photoId) : undefined;
    let box = { x: W * 0.14, y: H * 0.16, width: W * 0.72, height: H * 0.68 };
    if (photo) {
      const rotation = (seededRandom(scene.id, 5) > 0.5 ? 1 : -1) * 0.045;
      ctx.globalAlpha = appear(local, 0.1, 1.2);
      if (portrait) {
        this.print(ctx, photo, W / 2, H * 0.25, W * 0.74, H * 0.3, rotation, scene.id, local / scene.duration);
        box = { x: W * 0.1, y: H * 0.47, width: W * 0.8, height: H * 0.43 };
      } else {
        this.print(ctx, photo, W * 0.28, H * 0.5, W * 0.36, H * 0.66, rotation, scene.id, local / scene.duration);
        box = { x: W * 0.52, y: H * 0.13, width: W * 0.41, height: H * 0.74 };
      }
      ctx.globalAlpha = 1;
    }
    const authorSpace = 56 * u;
    const body = this.layout(ctx, scene.id + ':body', scene.text, {
      font: (size) => `italic ${size}px ${SERIF}`, maxWidth: box.width, maxHeight: box.height - authorSpace,
      maxSize: (photo ? 34 : 40) * u, minSize: 19 * u, lineHeight: 1.45
    });
    const top = box.y + (box.height - authorSpace - body.height) / 2;
    const align: CanvasTextAlign = photo && !portrait ? 'left' : 'center';
    const x = align === 'left' ? box.x : box.x + box.width / 2;
    ctx.font = `${120 * u}px ${SERIF}`;
    ctx.fillStyle = C.accent;
    ctx.globalAlpha = 0.18 * appear(local, 0.2);
    ctx.textAlign = align;
    ctx.fillText('«', align === 'left' ? x - 16 * u : x, top + 34 * u);
    ctx.globalAlpha = 1;
    ctx.font = `italic ${body.size}px ${SERIF}`;
    ctx.fillStyle = C.ink;
    drawLines(ctx, body, x, top, align, (line) => appear(local, 0.45 + line * 0.2, 0.8));
    const authorY = top + body.height + 40 * u;
    ctx.globalAlpha = appear(local, 0.6 + body.lines.length * 0.2, 0.8);
    this.smallCaps(ctx, '— ' + scene.author, x, authorY, 16 * u, C.accent, align, 0.2);
    if (scene.pages > 1) {
      ctx.font = `italic ${16 * u}px ${SERIF}`;
      ctx.fillStyle = C.soft;
      ctx.textAlign = 'center';
      ctx.fillText(`${scene.page} / ${scene.pages}`, W / 2, H - 34 * u);
    }
    ctx.globalAlpha = 1;
  }

  private voice(ctx: Ctx, scene: VoiceScene, local: number, assets: FilmAssets) {
    const { width: W, height: H, unit: u, portrait } = this;
    const audio = assets.audio.get(scene.assetId);
    const audioTime = local - scene.audioOffset;
    const photos = scene.photoIds.map((id) => assets.photos.get(id)).filter((item): item is PreparedPhoto => Boolean(item));
    const cardHeight = (portrait ? 176 : 118) * u;
    const cardBottom = H - (portrait ? 110 : 44) * u;
    if (photos.length) {
      const slot = Math.max(6, scene.duration / photos.length);
      const slotIndex = Math.floor(local / slot);
      const drawSlot = (index: number, alpha: number) => {
        const photo = photos[index % photos.length];
        const slotLocal = local - index * slot;
        ctx.globalAlpha = alpha;
        this.photoBackground(ctx, photo, 0.6);
        this.print(ctx, photo, W / 2, (cardBottom - cardHeight) / 2 + 6 * u, W * (portrait ? 0.84 : 0.66),
          cardBottom - cardHeight - 90 * u, (seededRandom(scene.id + index, 3) * 2 - 1) * 0.025, scene.id + index, clamp01(slotLocal / slot));
      };
      drawSlot(slotIndex, 1);
      const intoSlot = local - slotIndex * slot;
      if (slotIndex > 0 && intoSlot < 1) drawSlot(slotIndex - 1, 1 - easeInOut(intoSlot));
      ctx.globalAlpha = 1;
    } else {
      this.paperBackground(ctx);
    }

    const level = audio ? peakAt(audio, audioTime) : 0;
    const cardWidth = W * (portrait ? 0.86 : 0.64);
    const cardX = (W - cardWidth) / 2;
    const cardY = cardBottom - cardHeight;
    const enter = appear(local, 0.15, 0.9);
    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(0, (1 - enter) * 24 * u);
    ctx.shadowColor = 'rgba(20, 12, 6, 0.28)';
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 10 * u;
    ctx.fillStyle = 'rgba(251, 246, 236, 0.95)';
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 22 * u);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    const radius = 34 * u;
    const avatarX = cardX + 28 * u + radius;
    const avatarY = cardY + (portrait ? 26 * u + radius : cardHeight / 2);
    ctx.fillStyle = scene.color;
    ctx.globalAlpha = enter * (0.18 + level * 0.3);
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, radius + (6 + level * 16) * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = enter;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffaf2';
    ctx.font = `700 ${24 * u}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scene.initials, avatarX, avatarY + 1);
    ctx.textBaseline = 'alphabetic';

    const textX = avatarX + radius + 22 * u;
    const waveWidth = portrait ? cardWidth - 56 * u : Math.min(260 * u, cardWidth * 0.36);
    const textWidth = portrait ? cardX + cardWidth - textX - 24 * u : cardX + cardWidth - textX - waveWidth - 44 * u;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink;
    ctx.font = `700 ${26 * u}px ${SERIF}`;
    ctx.fillText(ellipsize(ctx, scene.author, textWidth), textX, avatarY - 4 * u);
    ctx.fillStyle = C.soft;
    ctx.font = `${16 * u}px ${SANS}`;
    ctx.fillText(ellipsize(ctx, scene.caption, textWidth), textX, avatarY + 22 * u);

    const waveX = portrait ? cardX + 28 * u : cardX + cardWidth - waveWidth - 28 * u;
    const waveY = portrait ? cardY + cardHeight - 42 * u : cardY + cardHeight / 2;
    drawWave(ctx, audio, audioTime, waveX, waveY, waveWidth, 46 * u, u);
    ctx.restore();
  }

  private video(ctx: Ctx, scene: VideoScene, local: number, assets: FilmAssets) {
    const { width: W, height: H, unit: u } = this;
    ctx.fillStyle = C.night;
    ctx.fillRect(0, 0, W, H);
    const element = assets.videos.get(scene.assetId);
    if (element && element.readyState >= 2 && element.videoWidth) {
      const blur = this.videoBlur.getContext('2d')!;
      blur.drawImage(element, 0, 0, this.videoBlur.width, this.videoBlur.height);
      ctx.globalAlpha = 0.45;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.videoBlur, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
      ctx.globalAlpha = 1;
      const margin = 0.05;
      const scale = Math.min(W * (1 - margin * 2) / element.videoWidth, H * (1 - margin * 2) / element.videoHeight);
      const width = element.videoWidth * scale;
      const height = element.videoHeight * scale;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 30 * u;
      ctx.drawImage(element, (W - width) / 2, (H - height) / 2, width, height);
      ctx.shadowColor = 'transparent';
    }
    const gradient = ctx.createLinearGradient(0, H * 0.7, 0, H);
    gradient.addColorStop(0, 'rgba(14, 11, 9, 0)');
    gradient.addColorStop(1, 'rgba(14, 11, 9, 0.78)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
    ctx.globalAlpha = appear(local, 0.5) * (1 - appear(local, 6, 1.5));
    this.smallCaps(ctx, scene.author, 40 * u, H - (scene.caption ? 70 : 40) * u, 14 * u, C.goldLight, 'left');
    if (scene.caption) {
      ctx.font = `italic ${24 * u}px ${SERIF}`;
      ctx.fillStyle = C.cream;
      ctx.textAlign = 'left';
      ctx.fillText(ellipsize(ctx, scene.caption, W - 80 * u), 40 * u, H - 36 * u);
    }
    ctx.globalAlpha = 1;
  }

  private reflections(ctx: Ctx, scene: ReflectionsScene, local: number) {
    const { width: W, height: H, unit: u, portrait } = this;
    this.paperBackground(ctx);
    ctx.globalAlpha = appear(local, 0.2);
    this.smallCaps(ctx, 'Отклики близких', W / 2, H * (portrait ? 0.1 : 0.13), 18 * u, C.accent);
    ctx.font = `italic ${24 * u}px ${SERIF}`;
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    ctx.fillText(ellipsize(ctx, scene.momentTitle, W * 0.8), W / 2, H * (portrait ? 0.1 : 0.13) + 40 * u);
    ctx.globalAlpha = 1;

    const count = scene.notes.length;
    const gap = 30 * u;
    const area = portrait
      ? { x: W * 0.09, y: H * 0.19, width: W * 0.82, height: H * 0.74 }
      : { x: W * 0.07, y: H * 0.27, width: W * 0.86, height: H * 0.62 };
    const cardWidth = portrait ? area.width : Math.min(W * 0.3, (area.width - gap * (count - 1)) / count);
    const maxCardHeight = portrait ? (area.height - gap * (count - 1)) / count : area.height;
    const cards = scene.notes.map((note, index) => {
      const body = this.layout(ctx, `${scene.id}:${index}`, note.text, {
        font: (size) => `italic ${size}px ${SERIF}`, maxWidth: cardWidth - 56 * u, maxHeight: maxCardHeight - 96 * u,
        maxSize: 26 * u, minSize: 16 * u, lineHeight: 1.42
      });
      return { note, body, height: Math.min(maxCardHeight, body.height + 100 * u) };
    });
    const totalWidth = cardWidth * count + gap * (count - 1);
    const totalHeight = cards.reduce((sum, card) => sum + card.height, 0) + gap * (count - 1);
    let cursor = portrait ? area.y + (area.height - totalHeight) / 2 : area.x + (area.width - totalWidth) / 2;
    cards.forEach(({ note, body, height }, index) => {
      const x = portrait ? area.x : cursor;
      const y = portrait ? cursor : area.y + (area.height - height) / 2;
      cursor += (portrait ? height : cardWidth) + gap;
      const enter = appear(local, note.appearAt, 0.9);
      if (enter <= 0) return;
      ctx.save();
      ctx.globalAlpha = enter;
      ctx.translate(x + cardWidth / 2, y + height / 2 + (1 - enter) * 26 * u);
      ctx.rotate((index % 2 ? 1 : -1) * 0.022 * (1 + seededRandom(scene.id, index)));
      ctx.scale(lerp(0.94, 1, enter), lerp(0.94, 1, enter));
      ctx.shadowColor = 'rgba(40, 26, 12, 0.22)';
      ctx.shadowBlur = 22 * u;
      ctx.shadowOffsetY = 8 * u;
      ctx.fillStyle = '#fffbf3';
      ctx.fillRect(-cardWidth / 2, -height / 2, cardWidth, height);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(196, 160, 104, 0.45)';
      ctx.save();
      ctx.translate(0, -height / 2);
      ctx.rotate(-0.05);
      ctx.fillRect(-46 * u, -12 * u, 92 * u, 24 * u);
      ctx.restore();
      ctx.font = `italic ${body.size}px ${SERIF}`;
      ctx.fillStyle = C.ink;
      drawLines(ctx, body, 0, -height / 2 + 34 * u, 'center');
      this.smallCaps(ctx, note.author, 0, height / 2 - 26 * u, 13 * u, C.accent, 'center', 0.2);
      ctx.restore();
    });
  }

  private finale(ctx: Ctx, scene: FinaleScene, local: number) {
    const { width: W, unit: u } = this;
    this.paperBackground(ctx);
    const title = this.layout(ctx, scene.id + ':title', scene.chapterTitle, {
      font: (size) => `italic 700 ${size}px ${SERIF}`, maxWidth: W * 0.8, maxHeight: 200 * u, maxSize: 56 * u, minSize: 32 * u, lineHeight: 1.15, maxLines: 3
    });
    const names = scene.narrators.length ? this.layout(ctx, scene.id + ':names', scene.narrators.join(' · '), {
      font: (size) => `${size}px ${SERIF}`, maxWidth: W * 0.8, maxHeight: 110 * u, maxSize: 30 * u, minSize: 20 * u, lineHeight: 1.35, maxLines: 3
    }) : null;
    const items: { height: number; gap?: number; draw: (top: number) => void }[] = [
      { height: 22 * u, draw: (top) => { ctx.globalAlpha = appear(local, 0.4); this.smallCaps(ctx, scene.chapterLabel, W / 2, top + 18 * u, 17 * u, C.accent); } },
      { height: title.height, gap: 18 * u, draw: (top) => {
        ctx.globalAlpha = appear(local, 0.7);
        ctx.font = `italic 700 ${title.size}px ${SERIF}`;
        ctx.fillStyle = C.ink;
        drawLines(ctx, title, W / 2, top, 'center');
      } },
      { height: 10 * u, gap: 30 * u, draw: (top) => { ctx.globalAlpha = 1; this.ornament(ctx, W / 2, top + 5 * u, 240 * u, appear(local, 1, 1.4)); } }
    ];
    if (names) {
      items.push({ height: 18 * u, gap: 30 * u, draw: (top) => { ctx.globalAlpha = appear(local, 1.4); this.smallCaps(ctx, 'Рассказывали', W / 2, top + 15 * u, 14 * u, C.soft); } });
      items.push({ height: names.height, gap: 14 * u, draw: (top) => {
        ctx.globalAlpha = appear(local, 1.7);
        ctx.font = `${names.size}px ${SERIF}`;
        ctx.fillStyle = C.ink;
        drawLines(ctx, names, W / 2, top, 'center');
      } });
    }
    items.push({ height: 18 * u, gap: 40 * u, draw: (top) => { ctx.globalAlpha = appear(local, 2.1); this.smallCaps(ctx, scene.bookTitle, W / 2, top + 15 * u, 14 * u, C.gold); } });
    this.stack(items);
    ctx.globalAlpha = 1;
  }

  /** The previous scene, held in the buffer, turns away like a book page from right to left. */
  private pageTurn(progress: number) {
    const { ctx, width: W, height: H, buffer } = this;
    const fold = W * (1 - progress);
    const frontEnd = Math.max(0, 2 * fold - W);
    if (frontEnd > 0) ctx.drawImage(buffer, 0, 0, frontEnd, H, 0, 0, frontEnd, H);
    const shadowWidth = Math.min(W - fold, 110 * this.unit);
    if (shadowWidth > 1) {
      const shadow = ctx.createLinearGradient(fold, 0, fold + shadowWidth, 0);
      shadow.addColorStop(0, `rgba(30, 18, 8, ${0.34 * (1 - progress * 0.6)})`);
      shadow.addColorStop(1, 'rgba(30, 18, 8, 0)');
      ctx.fillStyle = shadow;
      ctx.fillRect(fold, 0, shadowWidth, H);
    }
    const backWidth = fold - frontEnd;
    if (backWidth > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frontEnd, 0, backWidth, H);
      ctx.clip();
      ctx.fillStyle = '#efe4cf';
      ctx.fillRect(frontEnd, 0, backWidth, H);
      ctx.globalAlpha = 0.09;
      ctx.translate(2 * fold, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(buffer, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      const shade = ctx.createLinearGradient(frontEnd, 0, fold, 0);
      shade.addColorStop(0, 'rgba(60, 40, 20, 0.16)');
      shade.addColorStop(0.55, 'rgba(255, 252, 244, 0.22)');
      shade.addColorStop(0.85, 'rgba(60, 40, 20, 0.08)');
      shade.addColorStop(1, 'rgba(60, 40, 20, 0.3)');
      ctx.fillStyle = shade;
      ctx.fillRect(frontEnd, 0, backWidth, H);
      ctx.restore();
      if (frontEnd > 0) {
        const edge = ctx.createLinearGradient(frontEnd - 26 * this.unit, 0, frontEnd, 0);
        edge.addColorStop(0, 'rgba(30, 18, 8, 0)');
        edge.addColorStop(1, 'rgba(30, 18, 8, 0.22)');
        ctx.fillStyle = edge;
        ctx.fillRect(frontEnd - 26 * this.unit, 0, 26 * this.unit, H);
      }
    }
  }
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
  return value.trimEnd() + '…';
}

export function peakAt(audio: PreparedAudio, time: number): number {
  if (time < 0) return 0;
  const index = Math.floor(time * audio.peaksPerSecond);
  return index < audio.peaks.length ? audio.peaks[index] : 0;
}

function drawWave(ctx: Ctx, audio: PreparedAudio | undefined, time: number, x: number, centerY: number, width: number, height: number, u: number) {
  const bars = Math.max(12, Math.floor(width / (9 * u)));
  const step = width / bars;
  const window = 3.2;
  const base = ctx.globalAlpha;
  for (let index = 0; index < bars; index += 1) {
    const at = time - window / 2 + (index / (bars - 1)) * window;
    const value = audio ? peakAt(audio, at) : 0.15 + 0.1 * Math.sin(index + time * 4);
    const barHeight = Math.max(3 * u, value * height);
    ctx.fillStyle = C.accent;
    ctx.globalAlpha = base * (at <= time ? 0.95 : 0.28);
    roundRect(ctx, x + index * step + step * 0.2, centerY - barHeight / 2, step * 0.6, barHeight, Math.min(step * 0.3, 3 * u));
    ctx.fill();
  }
  ctx.globalAlpha = base;
}

function makePaper(width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.42, Math.min(width, height) * 0.1, width * 0.5, height * 0.5, Math.max(width, height) * 0.78);
  gradient.addColorStop(0, '#f9f2e4');
  gradient.addColorStop(0.7, '#f1e6d1');
  gradient.addColorStop(1, '#e3d3b6');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  try {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const noise = (Math.random() - 0.5) * 9;
      data[index] += noise;
      data[index + 1] += noise;
      data[index + 2] += noise * 0.8;
    }
    ctx.putImageData(image, 0, 0);
  } catch {
    // Grain is decorative.
  }
  ctx.strokeStyle = 'rgba(150, 120, 80, 0.05)';
  ctx.lineWidth = 1;
  for (let line = 0; line < 40; line += 1) {
    const y = Math.random() * height;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, y);
    ctx.quadraticCurveTo(Math.random() * width, y + (Math.random() - 0.5) * 40, Math.random() * width, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }
  return canvas;
}

function makeVignette(width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.58);
  gradient.addColorStop(0, 'rgba(40, 25, 10, 0)');
  gradient.addColorStop(1, 'rgba(40, 25, 10, 0.26)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}
