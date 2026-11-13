import { seededRandom } from './text';

/**
 * Quiet background music generated on the device, in a few moods. Nothing is
 * downloaded, so the film can be assembled offline. Each style renders one
 * seamless loop: the reverb tail is folded back to its start.
 */

export type MusicStyle = 'warm' | 'piano' | 'strings' | 'guitar';

export const MUSIC_STYLES: { id: MusicStyle; label: string; description: string }[] = [
  { id: 'warm', label: 'Тёплая', description: 'Мягкие аккорды и музыкальная шкатулка' },
  { id: 'piano', label: 'Фортепиано', description: 'Неспешные переборы, немного грустно' },
  { id: 'strings', label: 'Струнные', description: 'Длинные светлые аккорды без мелодии' },
  { id: 'guitar', label: 'Гитара', description: 'Тихий перебор, как летним вечером' }
];

const TAIL_SECONDS = 6;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type Instrument = (context: OfflineAudioContext, destination: AudioNode, midi: number, start: number, length: number, velocity: number) => void;

interface StyleRecipe {
  barSeconds: number;
  /** MIDI voicings, one per bar. */
  chords: number[][];
  /** Held chord tones under the melody, or none. */
  pad?: Instrument;
  /** Notes in each bar: [seconds in bar, chord tone index, octave shift]; picked bar by bar in turn. */
  phrases: [number, number, number][][];
  note: Instrument;
  noteLength: number;
  /** Brightness of the whole mix (low-pass cutoff, Hz). */
  warmth: number;
  reverb: { seconds: number; decay: number; wet: number };
}

function impulseResponse(context: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const noise = seededRandom('reverb' + channel, index) * 2 - 1;
      data[index] = noise * (1 - index / length) ** decay;
    }
  }
  return buffer;
}

/** A soft, slowly swelling chord tone. */
const softPad = (wave: OscillatorType, level: number, attack: number): Instrument => (context, destination, midi, start, length) => {
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(level, start + attack);
  envelope.gain.setValueAtTime(level, start + length - 0.2);
  envelope.gain.exponentialRampToValueAtTime(0.0005, start + length + 2.6);
  envelope.connect(destination);
  [-6, 6].forEach((detune) => {
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = frequency(midi);
    oscillator.detune.value = detune;
    oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(start + length + 2.8);
  });
};

/** A struck tone made of partials that fade at their own pace (music box, piano, plucked string). */
const struck = (partials: [number, number, number][]): Instrument => (context, destination, midi, start, _length, velocity) => {
  partials.forEach(([ratio, peak, decay]) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency(midi) * ratio;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak * velocity, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + decay + 0.05);
  });
};

const RECIPES: Record<MusicStyle, StyleRecipe> = {
  // Cmaj7 · Am7 · Fmaj7 · G6 · Em7 · Am7 · Dm9 · G6, with a music box on top.
  warm: {
    barSeconds: 4,
    chords: [[48, 55, 59, 64], [45, 52, 60, 67], [41, 53, 57, 64], [43, 50, 59, 64], [40, 52, 55, 62], [45, 52, 60, 64], [38, 50, 57, 64], [43, 50, 55, 62]],
    pad: softPad('triangle', 0.03, 1.6),
    phrases: [[[0, 3, 12], [1, 2, 12], [2, 1, 12], [3, 2, 12]], [[0.5, 3, 12], [1.5, 1, 24], [3, 3, 12]], [[0, 2, 12], [1, 3, 12], [2.5, 1, 24]], [[0.5, 1, 24], [2, 3, 12], [3, 2, 12]]],
    note: struck([[1, 0.05, 2.4], [2, 0.012, 0.8], [3.01, 0.006, 0.45]]),
    noteLength: 2.4,
    warmth: 1500,
    reverb: { seconds: 3.4, decay: 2.6, wet: 0.42 }
  },
  // Am · F · C · G · Am · Dm · E7sus · E, slow broken chords on a soft piano.
  piano: {
    barSeconds: 3.6,
    chords: [[45, 52, 57, 60], [41, 48, 57, 60], [48, 52, 55, 60], [43, 50, 55, 59], [45, 52, 57, 60], [38, 50, 53, 57], [40, 52, 57, 59], [40, 52, 56, 59]],
    phrases: [[[0, 0, 0], [0.6, 1, 0], [1.2, 2, 0], [1.8, 3, 0], [2.4, 2, 0], [3, 1, 0]], [[0, 0, 0], [0.6, 2, 0], [1.2, 3, 0], [2.1, 3, 12], [3, 2, 0]]],
    note: struck([[1, 0.07, 2.8], [2, 0.022, 1.2], [3, 0.008, 0.6], [4.02, 0.004, 0.35]]),
    noteLength: 2.8,
    warmth: 1900,
    reverb: { seconds: 2.8, decay: 2.4, wet: 0.36 }
  },
  // D · A/C# · Bm · G · D · Em · G · A, long bowed chords and nothing else.
  strings: {
    barSeconds: 5,
    chords: [[50, 57, 62, 66], [49, 57, 61, 64], [47, 54, 62, 66], [43, 55, 59, 62], [50, 57, 62, 66], [40, 55, 59, 64], [43, 55, 62, 67], [45, 57, 61, 64]],
    pad: softPad('sawtooth', 0.016, 2.2),
    phrases: [[[0.5, 3, 12]], [], [[2.5, 3, 12]], []],
    note: struck([[1, 0.02, 3.5], [2, 0.004, 1.5]]),
    noteLength: 3.5,
    warmth: 1100,
    reverb: { seconds: 4.2, decay: 2.2, wet: 0.5 }
  },
  // G · C/G · Em · D · G · C · Am · D, a quiet fingerpicked guitar.
  guitar: {
    barSeconds: 3.2,
    chords: [[43, 50, 55, 59], [43, 52, 55, 60], [40, 52, 55, 59], [38, 50, 54, 57], [43, 50, 55, 59], [36, 52, 55, 60], [45, 52, 57, 60], [38, 50, 54, 57]],
    phrases: [[[0, 0, 0], [0.4, 2, 0], [0.8, 3, 0], [1.2, 1, 0], [1.6, 0, 0], [2, 2, 0], [2.4, 3, 0], [2.8, 1, 0]]],
    note: struck([[1, 0.055, 1.6], [2, 0.03, 0.7], [3, 0.014, 0.35], [4, 0.007, 0.2]]),
    noteLength: 1.6,
    warmth: 2200,
    reverb: { seconds: 2.2, decay: 2.8, wet: 0.28 }
  }
};

/** Length of a style's loop in seconds. */
export function musicLoopSeconds(style: MusicStyle = 'warm'): number {
  const recipe = RECIPES[style];
  return recipe.barSeconds * recipe.chords.length;
}

/** @deprecated The warm style's loop length; kept for callers that predate styles. */
export const MUSIC_LOOP_SECONDS = musicLoopSeconds('warm');

/** Render a style's loop once; it repeats seamlessly. */
export async function renderMusicLoop(sampleRate = 44100, style: MusicStyle = 'warm'): Promise<AudioBuffer> {
  const recipe = RECIPES[style] ?? RECIPES.warm;
  const loopSeconds = musicLoopSeconds(style);
  const total = Math.ceil((loopSeconds + TAIL_SECONDS) * sampleRate);
  const context = new OfflineAudioContext(2, total, sampleRate);

  const bus = context.createGain();
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = recipe.warmth;
  warmth.Q.value = 0.4;
  const padBus = context.createBiquadFilter();
  padBus.type = 'lowpass';
  padBus.frequency.value = 850;
  padBus.Q.value = 0.3;
  const reverb = context.createConvolver();
  reverb.buffer = impulseResponse(context, recipe.reverb.seconds, recipe.reverb.decay);
  const dry = context.createGain();
  dry.gain.value = 0.72;
  const wet = context.createGain();
  wet.gain.value = recipe.reverb.wet;
  padBus.connect(bus);
  bus.connect(warmth);
  warmth.connect(dry).connect(context.destination);
  warmth.connect(reverb).connect(wet).connect(context.destination);

  recipe.chords.forEach((chord, bar) => {
    const start = bar * recipe.barSeconds;
    if (recipe.pad) chord.forEach((midi) => recipe.pad!(context, padBus, midi, start, recipe.barSeconds, 1));
    recipe.phrases[bar % recipe.phrases.length].forEach(([offset, tone, shift], index) => {
      const velocity = 0.75 + seededRandom(style + bar, index) * 0.25;
      recipe.note(context, bus, chord[tone] + shift, start + offset, recipe.noteLength, velocity);
    });
  });

  const rendered = await context.startRendering();
  const loopLength = Math.floor(loopSeconds * sampleRate);
  const loop = new AudioBuffer({ numberOfChannels: 2, length: loopLength, sampleRate });
  let peak = 0;
  for (let channel = 0; channel < 2; channel += 1) {
    const source = rendered.getChannelData(channel);
    const target = loop.getChannelData(channel);
    target.set(source.subarray(0, loopLength));
    for (let index = loopLength; index < source.length; index += 1) target[index - loopLength] += source[index];
    for (let index = 0; index < loopLength; index += 1) peak = Math.max(peak, Math.abs(target[index]));
  }
  const gain = peak > 0 ? 0.8 / peak : 1;
  for (let channel = 0; channel < 2; channel += 1) {
    const target = loop.getChannelData(channel);
    for (let index = 0; index < loopLength; index += 1) target[index] *= gain;
  }
  return loop;
}
