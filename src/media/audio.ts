import { boolean, choice, identifier, invalid, list, number, object } from './validation.ts';

export interface Note {
  midi: number;
  start: number;
  duration: number;
  gain: number;
  wave: 'sine' | 'triangle';
  attack: number;
  release: number;
}

export interface AudioSpec {
  id: string;
  sampleRate: number;
  duration: number;
  loop: boolean;
  notes: Note[];
}

export interface AudioManifest {
  format: 'pcm-s16le';
  id: string;
  file: string;
  sampleRate: number;
  channels: 1;
  duration: number;
  loop: boolean;
  peak: number;
}

export function validateAudio(input: unknown): AudioSpec {
  const spec = object(input, ['id', 'sampleRate', 'duration', 'loop', 'notes']);
  const sampleRate = number(spec.sampleRate, 22050, 48000, true);
  if (![22050, 44100, 48000].includes(sampleRate)) invalid('sample rate');
  const duration = number(spec.duration, 0.02, 30);
  let voiceSamples = 0;
  const notes = list(spec.notes, 512).map((item): Note => {
    const note = object(item, ['midi', 'start', 'duration', 'gain', 'wave', 'attack', 'release']);
    const start = number(note.start, 0, duration);
    const length = number(note.duration, 0.01, duration);
    const attack = number(note.attack, 0.002, length);
    const release = number(note.release, 0.002, length);
    if (start + length > duration + 1e-9 || attack + release > length) invalid('note timing');
    voiceSamples += Math.ceil(length * sampleRate);
    if (voiceSamples > 12_000_000) invalid('voice sample budget');
    return { midi: number(note.midi, 24, 96, true), start, duration: length,
      gain: number(note.gain, 0, 0.5), wave: choice(note.wave, ['sine', 'triangle']), attack, release };
  });
  return { id: identifier(spec.id), sampleRate, duration, loop: boolean(spec.loop), notes };
}

export function synthesizeWav(input: unknown): { bytes: Uint8Array; manifest: AudioManifest } {
  const spec = validateAudio(input);
  const count = Math.round(spec.duration * spec.sampleRate);
  const mix = new Float64Array(count);
  for (const note of spec.notes) {
    const start = Math.round(note.start * spec.sampleRate);
    const length = Math.min(Math.round(note.duration * spec.sampleRate), count - start);
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    for (let i = 0; i < length; i++) {
      const envelope = Math.min(1, i / (note.attack * spec.sampleRate), (length - 1 - i) / (note.release * spec.sampleRate));
      const sine = Math.sin(2 * Math.PI * frequency * i / spec.sampleRate);
      const sample = note.wave === 'sine' ? sine : 2 / Math.PI * Math.asin(sine);
      mix[start + i] += sample * envelope * note.gain;
    }
  }
  let peak = 0;
  for (const value of mix) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0.9 ? 0.9 / peak : 1;
  const bytes = new Uint8Array(44 + count * 2);
  const header = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  ascii(0, 'RIFF'); header.setUint32(4, bytes.length - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, spec.sampleRate, true); header.setUint32(28, spec.sampleRate * 2, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true); ascii(36, 'data'); header.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) header.setInt16(44 + i * 2, Math.round(mix[i] * scale * 32767), true);
  return { bytes, manifest: { format: 'pcm-s16le', id: spec.id, file: `${spec.id}.wav`, sampleRate: spec.sampleRate,
    channels: 1, duration: count / spec.sampleRate, loop: spec.loop, peak: peak * scale } };
}
