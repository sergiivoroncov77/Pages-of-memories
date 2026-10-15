import { seededRandom } from './text';

/**
 * A quiet, warm background loop generated on the device: soft pads with a
 * sparse music-box melody and a small hall reverb. Nothing is downloaded,
 * so the film can be assembled offline.
 */

const BAR_SECONDS = 4;
const LOOP_BARS = 8;
export const MUSIC_LOOP_SECONDS = BAR_SECONDS * LOOP_BARS;
const TAIL_SECONDS = 6;

// MIDI voicings: Cmaj7 · Am7 · Fmaj7 · G6 · Em7 · Am7 · Dm9 · G6
const CHORDS = [
  [48, 55, 59, 64], [45, 52, 60, 67], [41, 53, 57, 64], [43, 50, 59, 64],
  [40, 52, 55, 62], [45, 52, 60, 64], [38, 50, 57, 64], [43, 50, 55, 62]
];
// Music-box phrases (seconds in bar, chord tone index, octave shift).
const PHRASES: [number, number, number][][] = [
  [[0, 3, 12], [1, 2, 12], [2, 1, 12], [3, 2, 12]],
  [[0.5, 3, 12], [1.5, 1, 24], [3, 3, 12]],
  [[0, 2, 12], [1, 3, 12], [2.5, 1, 24]],
  [[0.5, 1, 24], [2, 3, 12], [3, 2, 12]]
];

const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

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

function pad(context: OfflineAudioContext, destination: AudioNode, midi: number, start: number, length: number) {
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(0.03, start + 1.6);
  envelope.gain.setValueAtTime(0.03, start + length - 0.2);
  envelope.gain.exponentialRampToValueAtTime(0.0005, start + length + 2.6);
  envelope.connect(destination);
  [-5, 5].forEach((detune) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency(midi);
    oscillator.detune.value = detune;
    oscillator.connect(envelope);
    oscillator.start(start);
    oscillator.stop(start + length + 2.8);
  });
}

function bell(context: OfflineAudioContext, destination: AudioNode, midi: number, start: number, velocity: number) {
  [[1, 0.05 * velocity, 2.4], [2, 0.012 * velocity, 0.8], [3.01, 0.006 * velocity, 0.45]].forEach(([ratio, peak, decay]) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency(midi) * ratio;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    oscillator.connect(envelope).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + decay + 0.05);
  });
}

/** Render the loop once; it repeats seamlessly because the reverb tail is folded back to its start. */
export async function renderMusicLoop(sampleRate = 44100): Promise<AudioBuffer> {
  const total = Math.ceil((MUSIC_LOOP_SECONDS + TAIL_SECONDS) * sampleRate);
  const context = new OfflineAudioContext(2, total, sampleRate);

  const bus = context.createGain();
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = 1500;
  warmth.Q.value = 0.4;
  const padBus = context.createBiquadFilter();
  padBus.type = 'lowpass';
  padBus.frequency.value = 850;
  padBus.Q.value = 0.3;
  const reverb = context.createConvolver();
  reverb.buffer = impulseResponse(context, 3.4, 2.6);
  const dry = context.createGain();
  dry.gain.value = 0.72;
  const wet = context.createGain();
  wet.gain.value = 0.42;
  padBus.connect(bus);
  bus.connect(warmth);
  warmth.connect(dry).connect(context.destination);
  warmth.connect(reverb).connect(wet).connect(context.destination);

  CHORDS.forEach((chord, bar) => {
    const start = bar * BAR_SECONDS;
    chord.forEach((midi) => pad(context, padBus, midi, start, BAR_SECONDS));
    PHRASES[bar % PHRASES.length].forEach(([offset, tone, shift], index) => {
      const velocity = 0.75 + seededRandom('bell' + bar, index) * 0.25;
      bell(context, bus, chord[tone] + shift, start + offset, velocity);
    });
  });

  const rendered = await context.startRendering();
  const loopLength = Math.floor(MUSIC_LOOP_SECONDS * sampleRate);
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
