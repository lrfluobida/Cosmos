import assert from 'node:assert/strict';
import { test } from 'node:test';
import { synthesizeWav } from '../../src/media/audio.ts';

function fixture(): any {
  return { id: 'tone', sampleRate: 22050, duration: 0.5, loop: true, notes: [
    { midi: 69, start: 0, duration: 0.5, gain: 0.2, wave: 'sine', attack: 0.01, release: 0.04 },
  ] };
}

test('produces deterministic little-endian mono PCM16 with correct duration and smooth silent endpoints', () => {
  const { bytes, manifest } = synthesizeWav(fixture());
  const wav = Buffer.from(bytes);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt32LE(28), 44100);
  assert.equal(wav.readUInt16LE(32), 2);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), 11025 * 2);
  const samples = Array.from({ length: 11025 }, (_, i) => wav.readInt16LE(44 + i * 2));
  assert.equal(samples[0], 0);
  assert.equal(samples.at(-1), 0);
  assert.ok(Math.max(...samples.map(Math.abs)) > 5000);
  assert.ok(samples.every((value) => Math.abs(value) <= 29491));
  assert.equal(manifest.sampleRate, 22050);
  assert.equal(manifest.channels, 1);
  assert.equal(manifest.duration, 0.5);
  assert.equal(manifest.loop, true);
  assert.deepEqual(synthesizeWav(fixture()), { bytes, manifest });
});

test('normalizes dense overlapping notes without hard clipping', () => {
  const spec = fixture(); spec.notes = Array.from({ length: 32 }, () => ({ ...spec.notes[0], gain: 0.5 }));
  const { bytes, manifest } = synthesizeWav(spec);
  const wav = Buffer.from(bytes);
  for (let offset = 44; offset < wav.length; offset += 2) assert.ok(Math.abs(wav.readInt16LE(offset)) <= 29491);
  assert.ok(manifest.peak > 0.89 && manifest.peak <= 0.9);
});

test('rejects malformed notes and size, duration, envelope and pitch violations before allocating', () => {
  const mutations = [
    (s: any) => { s.id = '../escape'; },
    (s: any) => { s.id = 'con'; },
    (s: any) => { s.duration = 600; },
    (s: any) => { s.duration = NaN; },
    (s: any) => { s.sampleRate = 1e9; },
    (s: any) => { s.notes = Array(513).fill(s.notes[0]); },
    (s: any) => { s.notes = []; },
    (s: any) => { s.notes[0].midi = Infinity; },
    (s: any) => { s.notes[0].midi = 120; },
    (s: any) => { s.notes[0].start = -1; },
    (s: any) => { s.notes[0].duration = 0.6; },
    (s: any) => { s.notes[0].gain = 2; },
    (s: any) => { s.notes[0].attack = 0; },
    (s: any) => { s.notes[0].release = 0.5; },
    (s: any) => { s.notes[0].wave = 'external'; },
    (s: any) => { s.notes[0].url = 'https://example.invalid/sample.wav'; },
    (s: any) => { s.notes = Array(2); },
    (s: any) => { s.duration = 30; s.sampleRate = 48000; s.notes = Array(10).fill({ ...s.notes[0], duration: 30 }); },
  ];
  for (const mutate of mutations) {
    const spec = fixture(); mutate(spec);
    assert.throws(() => synthesizeWav(spec), /Invalid media spec/);
  }
});
