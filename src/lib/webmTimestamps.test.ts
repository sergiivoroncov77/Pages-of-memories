import { describe, expect, it } from 'vitest';
import { repairWebmTimestamps } from './webmTimestamps';

/** EBML element with a one- to four-byte size. */
function element(id: number[], body: number[], unknownSize = false): number[] {
  if (unknownSize) return [...id, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...body];
  const size = body.length < 127 ? [0x80 | body.length] : [0x40 | (body.length >> 8), body.length & 0xff];
  return [...id, ...size, ...body];
}

const block = (relative: number) => element([0xa3], [0x81, (relative >> 8) & 0xff, relative & 0xff, 0x80, 1, 2, 3]);
const cluster = (timecode: number, blocks: number[]) =>
  element([0x1f, 0x43, 0xb6, 0x75], [...element([0xe7], [(timecode >> 24) & 0xff, (timecode >> 16) & 0xff, (timecode >> 8) & 0xff, timecode & 0xff]), ...blocks.flatMap(block)]);

/** A recording laid out like Chrome's: unknown-size segment, Info without a duration, clusters of one second. */
function recording(timecodes: number[]): Uint8Array {
  const header = element([0x1a, 0x45, 0xdf, 0xa3], element([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d]));
  const info = element([0x15, 0x49, 0xa9, 0x66], element([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40]));
  const clusters = timecodes.flatMap((timecode, index) => cluster(timecode, index === 0 ? [0] : [0, 20, 40, 960]));
  return new Uint8Array([...header, ...element([0x18, 0x53, 0x80, 0x67], [...info, ...clusters], true)]);
}

const clusterTimecodes = (bytes: Uint8Array) => {
  const found: number[] = [];
  for (let i = 0; i < bytes.length - 8; i += 1) {
    if (bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75) {
      const at = i + 5 + 2; // cluster id, one-byte size, timecode id and its size
      found.push((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]);
    }
  }
  return found;
};

describe('repairing recorded WebM timestamps', () => {
  it('closes the minutes-long hole after the first frame and writes the length', () => {
    const fixed = repairWebmTimestamps(recording([0, 271360, 272380, 273400]))!;
    expect(clusterTimecodes(fixed.bytes)).toEqual([0, 20, 1040, 2060]);
    expect(fixed.removedMs).toBe(271340);
    expect(fixed.durationMs).toBe(3040);
    // Duration element (0x4489, float64) is now in Info.
    const at = fixed.bytes.findIndex((value, index) => value === 0x44 && fixed.bytes[index + 1] === 0x89);
    expect(new DataView(fixed.bytes.buffer, at + 3, 8).getFloat64(0)).toBe(3040);
  });

  it('leaves a recording without holes as it was, apart from the length', () => {
    const input = recording([0, 1020, 2040]);
    const fixed = repairWebmTimestamps(input)!;
    expect(fixed.removedMs).toBe(0);
    expect(clusterTimecodes(fixed.bytes)).toEqual([0, 1020, 2040]);
    expect(fixed.bytes.length).toBe(input.length + 11);
  });

  it('refuses bytes that are not WebM', () => {
    expect(repairWebmTimestamps(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
