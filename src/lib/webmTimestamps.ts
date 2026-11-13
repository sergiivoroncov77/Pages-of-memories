/**
 * Chrome's MediaRecorder sometimes stamps the first audio frame at 0 and the
 * rest minutes later (seen on phones), or keeps the clock running while the
 * app was in the background. Browsers skip the hole; Google Drive and most
 * players play it as minutes of silence. This closes such holes in a WebM
 * recording and writes its length, which the recorder never does.
 *
 * Only cluster timecodes are rewritten, in place and with their own byte
 * width, so the file keeps its layout; the length goes into the Info element
 * when nothing in the file points at byte positions.
 */

const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const INFO = 0x1549a966;
const TIMECODE = 0xe7;
const TIMECODE_SCALE = 0x2ad7b1;
const DURATION = 0x4489;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const SEEK_HEAD = 0x114d9b74;
const CUES = 0x1c53bb6b;

/** A pause longer than this between two clusters is a hole, not speech. */
const HOLE_MS = 1000;

interface Vint { value: number; length: number; unknown: boolean }

function readVint(bytes: Uint8Array, at: number, keepMarker = false): Vint | null {
  if (at >= bytes.length) return null;
  const first = bytes[at];
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) { mask >>= 1; length += 1; }
  if (length > 8 || at + length > bytes.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let k = 1; k < length; k += 1) {
    value = value * 256 + bytes[at + k];
    if (bytes[at + k] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

interface Element { id: number; start: number; body: number; end: number; unknown: boolean }

function readElement(bytes: Uint8Array, at: number, parentEnd: number): Element | null {
  const id = readVint(bytes, at, true);
  if (!id) return null;
  const size = readVint(bytes, at + id.length);
  if (!size) return null;
  const body = at + id.length + size.length;
  const end = size.unknown ? parentEnd : Math.min(parentEnd, body + size.value);
  return { id: id.value, start: at, body, end, unknown: size.unknown };
}

const readUint = (bytes: Uint8Array, from: number, to: number) => {
  let value = 0;
  for (let i = from; i < to; i += 1) value = value * 256 + bytes[i];
  return value;
};

function writeUint(bytes: Uint8Array, from: number, to: number, value: number) {
  let rest = value;
  for (let i = to - 1; i >= from; i -= 1) { bytes[i] = rest % 256; rest = Math.floor(rest / 256); }
}

interface Cluster { timecodeAt: number; timecodeEnd: number; timecode: number; lastBlock: number; step: number }

/** Relative time of the blocks in a cluster: the last one and the usual distance between them. */
function blockTimes(bytes: Uint8Array, cluster: Element): { last: number; step: number } {
  let last = 0;
  let previous: number | null = null;
  // The usual distance between frames: the smallest one seen (a 20 ms Opus frame when none is).
  let step = Infinity;
  const visit = (from: number, to: number) => {
    let at = from;
    while (at < to) {
      const element = readElement(bytes, at, to);
      if (!element || element.end <= at) return;
      if (element.id === BLOCK_GROUP) visit(element.body, element.end);
      if (element.id === SIMPLE_BLOCK || element.id === BLOCK) {
        const track = readVint(bytes, element.body);
        if (track) {
          const offset = element.body + track.length;
          const relative = ((bytes[offset] << 8) | bytes[offset + 1]) << 16 >> 16;
          if (previous !== null && relative > previous) step = Math.min(step, relative - previous);
          previous = relative;
          last = Math.max(last, relative);
        }
      }
      if (element.unknown) return;
      at = element.end;
    }
  };
  visit(cluster.body, cluster.end);
  return { last, step: Number.isFinite(step) ? step : 20 };
}

export interface WebmRepair {
  bytes: Uint8Array;
  /** Milliseconds of holes that were closed. */
  removedMs: number;
  durationMs: number;
}

/** Close timestamp holes and add the duration. Returns null when the bytes are not a WebM it understands. */
export function repairWebmTimestamps(input: Uint8Array): WebmRepair | null {
  const bytes = new Uint8Array(input);
  const top = readElement(bytes, 0, bytes.length);
  if (!top || top.id !== 0x1a45dfa3) return null;
  const segment = readElement(bytes, top.end, bytes.length);
  if (!segment || segment.id !== SEGMENT) return null;

  let info: Element | null = null;
  let scaleNs = 1_000_000;
  let hasDuration = false;
  let pointsAtBytes = false;
  const clusters: Cluster[] = [];
  let at = segment.body;
  while (at < segment.end) {
    const element = readElement(bytes, at, segment.end);
    if (!element || element.end <= at) break;
    if (element.id === SEEK_HEAD || element.id === CUES) pointsAtBytes = true;
    if (element.id === INFO) {
      info = element;
      let inner = element.body;
      while (inner < element.end) {
        const child = readElement(bytes, inner, element.end);
        if (!child || child.end <= inner) break;
        if (child.id === TIMECODE_SCALE) scaleNs = readUint(bytes, child.body, child.end) || scaleNs;
        if (child.id === DURATION) hasDuration = true;
        inner = child.end;
      }
    }
    if (element.id === CLUSTER) {
      // A cluster of unknown size runs until the next cluster starts.
      let end = element.end;
      if (element.unknown) {
        let scan = element.body;
        while (scan < segment.end) {
          const child = readElement(bytes, scan, segment.end);
          if (!child || child.end <= scan || child.id === CLUSTER) break;
          scan = child.end;
        }
        end = scan;
      }
      const cluster = { ...element, end };
      const first = readElement(bytes, cluster.body, cluster.end);
      if (first && first.id === TIMECODE) {
        const times = blockTimes(bytes, cluster);
        clusters.push({ timecodeAt: first.body, timecodeEnd: first.end, timecode: readUint(bytes, first.body, first.end), lastBlock: times.last, step: times.step });
      }
      at = end;
      continue;
    }
    if (element.unknown) break;
    at = element.end;
  }
  if (!clusters.length) return null;

  const msPerTick = scaleNs / 1_000_000;
  const holeTicks = HOLE_MS / msPerTick;
  // A recording that does not start at 0 also plays silence first.
  let shift = clusters[0].timecode;
  let previousEnd = 0;
  clusters.forEach((cluster, index) => {
    if (index > 0) {
      const gap = cluster.timecode - shift - previousEnd;
      if (gap > holeTicks) shift += gap;
    }
    const timecode = cluster.timecode - shift;
    writeUint(bytes, cluster.timecodeAt, cluster.timecodeEnd, timecode);
    previousEnd = timecode + cluster.lastBlock + cluster.step;
  });
  const durationTicks = previousEnd;
  const durationMs = durationTicks * msPerTick;
  const removedMs = Math.round(shift * msPerTick);

  if (!info || hasDuration || pointsAtBytes) return { bytes, removedMs, durationMs };
  // Duration (float64, in timecode ticks) at the end of Info: Info's size grows by 11 bytes.
  const idLength = 4;
  const infoSize = readVint(bytes, info.start + idLength);
  if (!infoSize || infoSize.unknown) return { bytes, removedMs, durationMs };
  const newSize = info.end - info.body + 11;
  const sizeLength = Math.max(infoSize.length, newSize < 127 ? 1 : newSize < 16383 ? 2 : newSize < 2097151 ? 3 : 4);
  const sizeBytes = new Uint8Array(sizeLength);
  writeUint(sizeBytes, 0, sizeLength, newSize);
  sizeBytes[0] |= 0x80 >> (sizeLength - 1);
  const duration = new Uint8Array(11);
  duration.set([0x44, 0x89, 0x88]);
  new DataView(duration.buffer).setFloat64(3, durationTicks);
  const out = new Uint8Array(bytes.length - infoSize.length + sizeLength + 11);
  let cursor = 0;
  const put = (part: Uint8Array) => { out.set(part, cursor); cursor += part.length; };
  put(bytes.subarray(0, info.start + idLength));
  put(sizeBytes);
  put(bytes.subarray(info.body, info.end));
  put(duration);
  put(bytes.subarray(info.end));
  return { bytes: out, removedMs, durationMs };
}

/** The recording with holes closed and its length written; the original if it is not a WebM or cannot be read. */
export async function repairWebmBlob(blob: Blob): Promise<Blob> {
  if (!/webm/i.test(blob.type)) return blob;
  try {
    const repaired = repairWebmTimestamps(new Uint8Array(await blob.arrayBuffer()));
    return repaired ? new Blob([repaired.bytes as BlobPart], { type: blob.type }) : blob;
  } catch {
    return blob;
  }
}
