import Phaser from 'phaser';

// Test-owned generated-code specimen. This is not a production template or a model output.
type Clip = { id: string; file: string; loop: boolean };
type Instance = { sound: Phaser.Sound.WebAudioSound; active: boolean; transactions: number; starts: number; destroyed: boolean; muteGain: number; volumeGain: number };
type ClipState = { started: boolean; activations: number; instances: Instance[] };
const manifest: { audio: Clip[] } = await fetch('/manifest.json').then(response => response.json());
const fault = new URL(location.href).searchParams.get('fault') ?? '';
const states = new Map(manifest.audio.map(clip => [clip.id, { started: false, activations: 0, instances: [] } as ClipState]));
const events = Phaser.Sound.Events;
let manager: Phaser.Sound.WebAudioSoundManager, game: Phaser.Game;
let managerGains: { mute: number; volume: number };
let bgm: Phaser.Sound.WebAudioSound, effect: Phaser.Sound.WebAudioSound, zero: Phaser.Sound.WebAudioSound, transient: Phaser.Sound.WebAudioSound;
let soundOn = true, collected = 0, resumed = false;
const text = (id: string, value: string) => { document.querySelector('#' + id)!.textContent = value; };
const isPlaying = (instance: Instance) => !instance.destroyed && instance.sound.isPlaying;
const output = (instance: Instance) => isPlaying(instance) && !!instance.sound.source && manager.context.state === 'running'
  && instance.muteGain > 0 && instance.volumeGain > 0 && managerGains.mute > 0 && managerGains.volume > 0;
function refresh(instance: Instance) {
  const active = output(instance);
  if (active && !instance.active && !instance.transactions) states.get(instance.sound.key)!.activations++;
  instance.active = active;
}
function attach(sound: Phaser.Sound.WebAudioSound) {
  const state = states.get(sound.key)!;
  const instance: Instance = { sound, active: false, transactions: 0, starts: 0, destroyed: false,
    muteGain: sound.muteNode.gain.value, volumeGain: sound.volumeNode.gain.value };
  state.instances.push(instance);
  for (const event of [events.PLAY, events.RESUME]) sound.on(event, () => {
    instance.starts++; state.started = true; refresh(instance);
  });
  for (const event of [events.PAUSE, events.STOP, events.COMPLETE]) sound.on(event, () => refresh(instance));
  // Phaser emits these arguments only after AudioParam.setValueAtTime succeeds.
  // They describe committed immediate controls, not rendered audio samples; the
  // lagging gain.value getter must not overwrite accepted updates.
  sound.on(events.MUTE, (_sound: Phaser.Sound.WebAudioSound, muted: boolean) => { instance.muteGain = muted ? 0 : 1; refresh(instance); });
  sound.on(events.VOLUME, (_sound: Phaser.Sound.WebAudioSound, volume: number) => { instance.volumeGain = volume; refresh(instance); });
  sound.on(events.DESTROY, () => { instance.destroyed = true; refresh(instance); });
  // Phaser config emits MUTE before VOLUME after setting isPlaying. Suppress only
  // those synchronous intermediate observations, then settle the successful start.
  const play = sound.play, resume = sound.resume;
  function transaction<T>(operation: () => T): T {
    if (fault === 'intermediate-counts') return operation();
    const starts = instance.starts; let completed = false, result: T;
    instance.transactions++;
    try { result = operation(); completed = result === true; return result; }
    finally {
      instance.transactions--;
      const active = output(instance);
      if (completed && instance.starts > starts && active && !instance.transactions) state.activations++;
      instance.active = active;
    }
  }
  sound.play = function(this: Phaser.Sound.WebAudioSound, ...args: Parameters<typeof play>) { return transaction(() => play.apply(this, args)); };
  sound.resume = function(this: Phaser.Sound.WebAudioSound, ...args: Parameters<typeof resume>) { return transaction(() => resume.apply(this, args)); };
  return sound;
}
function refreshAll() { for (const state of states.values()) for (const instance of state.instances) refresh(instance); }
function add(id: string) { return attach(manager.add(id) as Phaser.Sound.WebAudioSound); }
function ensureBgm() { if (!bgm.isPlaying) bgm.play({ loop: fault !== 'no-loop', volume: 0.05 }); }
function register(id: string, action: () => void) {
  document.querySelector('#' + id)!.addEventListener('click', () => {
    // Browser output is resumed by an actual user input. Muting is applied first
    // for a first-click sound-off, before any output or asynchronous resume.
    if (id === 'sound') { soundOn = !soundOn; if (fault !== 'ignore-mute') manager.mute = !soundOn; text('sound', soundOn ? '声音：开' : '声音：关'); }
    void manager.context.resume().then(() => { action(); text('last', id); });
  });
}
class FirstScene extends Phaser.Scene {
  constructor() { super('first'); }
  preload() { for (const clip of manifest.audio) this.load.audio(clip.id, '/' + clip.file); }
  create() {
    manager = this.sound as Phaser.Sound.WebAudioSoundManager;
    managerGains = { mute: manager.masterMuteNode.gain.value, volume: manager.masterVolumeNode.gain.value };
    manager.on(events.GLOBAL_MUTE, (_manager: Phaser.Sound.WebAudioSoundManager, muted: boolean) => { managerGains.mute = muted ? 0 : 1; refreshAll(); });
    manager.on(events.GLOBAL_VOLUME, (_manager: Phaser.Sound.WebAudioSoundManager, volume: number) => { managerGains.volume = volume; refreshAll(); });
    manager.context.addEventListener('statechange', refreshAll);
    bgm = add('bgm-soft'); effect = add('constructor'); zero = add('prototype'); transient = add('a-b');
    const saved = localStorage.getItem('saved'); text('saved', saved ?? 'none');
    register('start', () => { game.loop.wake(); ensureBgm(); });
    register('sound', () => { ensureBgm(); });
    register('collect', () => { collected++; if (!(fault === 'omit-resumed-effect' && resumed && soundOn)) effect.play({ volume: 0.05 }); text('progress', String(collected)); });
    register('zero', () => { zero.play({ volume: 0 }); });
    register('normal', () => { zero.play({ volume: 0.05 }); });
    register('replay', () => { bgm.play({ loop: true, volume: 0.05 }); });
    register('pause', () => { bgm.pause(); });
    register('resume', () => { bgm.resume(); });
    register('volume-zero', () => { manager.volume = 0; effect.play({ volume: 0.05 }); });
    register('volume-normal', () => { manager.volume = 1; });
    register('instance-mute', () => { bgm.mute = true; });
    register('instance-unmute', () => { bgm.mute = false; });
    register('transient', () => { transient.play({ volume: 0.05 }); manager.mute = true; soundOn = false; text('sound', '声音：关'); });
    register('reenable', () => { manager.mute = false; soundOn = true; resumed = true; text('sound', '声音：开'); });
    register('save', () => { localStorage.setItem('saved', String(collected)); text('saved', String(collected)); });
    register('continue', () => { collected = Number(localStorage.getItem('saved') ?? 0); text('progress', String(collected)); ensureBgm(); });
    register('scene', () => { this.scene.start('second'); });
    register('stop', () => { bgm.stop(); });
    register('destroy', () => { bgm.destroy(); });
    // Phaser's active update resumes a suspended context on focus. Sleep the real
    // game loop for this explicit suspension observation; Start wakes it again.
    register('suspend', () => { game.loop.sleep(); void manager.context.suspend().then(() => text('context', manager.context.state)); });
    text('status', 'ready');
  }
}
class SecondScene extends Phaser.Scene {
  constructor() { super('second'); }
  create() {
    const second = add('constructor'); second.play({ volume: 0.05 });
    text('scene-state', 'second');
  }
}
game = new Phaser.Game({ type: Phaser.CANVAS, parent: 'canvas', width: 64, height: 48, backgroundColor: '#eef5e8', scene: [FirstScene, SecondScene] });
Object.defineProperty(window, 'cosmosDebug', { configurable: false, get: () => {
  const audio = manifest.audio.map(clip => {
    const state = states.get(clip.id)!;
    return Object.freeze({ id: clip.id, decoded: game.cache.audio.exists(clip.id), started: state.started,
      playing: state.instances.some(isPlaying), looping: state.instances.some(i => isPlaying(i) && i.sound.loop),
      outputActive: state.instances.some(output), outputActivations: state.activations });
  });
  const audioById = Object.fromEntries(audio.map(record => ['clip_' + record.id.replaceAll('-', '_'), record]));
  if (fault === 'wrong-id') audioById.clip_bgm_soft = audioById.clip_constructor;
  if (fault === 'legacy-fields') return Object.freeze({ media: Object.freeze({ characters: Object.freeze([]), audio: Object.freeze(audio.map(({ id, decoded, started }) => Object.freeze({ id, decoded, started }))) }) });
  return Object.freeze({ media: Object.freeze({ characters: Object.freeze([]), audio: Object.freeze(audio), audioById: Object.freeze(audioById) }) });
} });
