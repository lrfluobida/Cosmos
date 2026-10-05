import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

/** Executes the actual factory with synthetic engine/DOM transport; never a native-render claim. */
async function factory(fault = '') {
  let now = 1, visibility = 'visible';
  class Canvas { width = 800; height = 500; isConnected = true; getBoundingClientRect() { return { width: 800, height: 500, left: 0, top: 0, right: 800, bottom: 500 }; } }
  class Context { canvas: any; constructor(canvas: any) { this.canvas = canvas; } drawImage() {} fill() {} stroke() {} fillRect() {} fillText() {} strokeText() {} }
  class Events { handlers = new Map<string, Function[]>(); on(name: string, action: Function) { this.handlers.set(name, [...this.handlers.get(name) ?? [], action]); }
    emit(name: string, ...args: any[]) { for (const handler of this.handlers.get(name) ?? []) handler(...args); } }
  class Renderer { game: any; gameCanvas: any; gameContext: any; constructor(game: any) { this.game = game; this.gameCanvas = fault === 'canvas' ? new Canvas() : game.canvas; this.gameContext = new Context(game.canvas); }
    preRender() {} render() { this.gameContext.fillRect(); this.gameContext.fillText(); } postRender() {} }
  class Manager { game: any; constructor(game: any) { this.game = game; }
    getScenes() { return this.game.scenes.filter((scene: any) => scene.sys.isActive()); }
    render(renderer: any) { for (const scene of this.game.scenes) renderer.render(scene, [{ active: true, visible: fault !== 'empty', alpha: 1 }], {}); } }
  class Game { canvas = new Canvas(); renderer: any; scene: any; scenes: any[]; isRunning = true; isPaused = false; events = new Events(); loop = { frame: 0, actualFps: 100000 };
    constructor() { this.renderer = fault === 'null' ? null : new Renderer(this); this.scene = new Manager(this); this.scenes = [0, 1].map(index => ({ sys: {
      game: this, settings: { key: `scene-${index}` }, isActive: () => fault !== 'inactive', isVisible: () => true } })); }
    step() { this.renderer.preRender(); this.scene.render(this.renderer); this.renderer.postRender(); this.events.emit('postrender', this.renderer); }
    headlessStep() { this.events.emit('postrender', null); } getFrame() { return 100000; } }
  const phaser: any = { VERSION: '3.90.0', Game, Scenes: { SceneManager: Manager }, Renderer: { Canvas: { CanvasRenderer: Renderer }, WebGL: { WebGLRenderer: class {} } },
    Core: { Events: { PAUSE: 'pause', RESUME: 'resume', HIDDEN: 'hidden', VISIBLE: 'visible' } } };
  const exports: any = {}, context = vm.createContext({ exports, require: () => ({ default: phaser }), performance: { now: () => now }, crypto: { randomUUID: () => Math.random().toString() },
    document: { get visibilityState() { return visibility; }, addEventListener() {} }, HTMLCanvasElement: Canvas, CanvasRenderingContext2D: Context, WebGLRenderingContext: class {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }), devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  const source = await readFile(new URL('../../templates/2d/render-frame-observer.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(js, context); const game = exports.createObservedGame({});
  const step = () => { now += 17; game.loop.frame++; game.step(now, 17); };
  return { api: exports, game, step, hide: () => { visibility = 'hidden'; }, changeRenderer: () => { game.renderer = new Renderer(game); } };
}
test('actual factory counts once per native completed step across multiple scene/draw calls and ignores empty emits/EMA', async () => {
  const f = await factory(); for (let index = 0; index < 5; index++) f.step(); const before = f.api.readRenderSnapshot();
  for (let index = 0; index < 100; index++) f.game.events.emit('postrender', null);
  f.game.headlessStep(); const after = f.api.readRenderSnapshot();
  assert.equal(before.sequence, 5); assert.equal(after.sequence, 5); assert.ok(after.frames.every((row: any) => row.draws === 4 && row.sceneRenders === 2 && row.rendererPostCalls === 1));
  assert.equal(after.frames.length, 5); assert.ok(Object.isFrozen(after));
});
for (const fault of ['null', 'canvas', 'inactive', 'empty']) test(`actual factory ${fault} cannot establish counted native frames`, async () => {
  const f = await factory(fault); if (fault === 'null') f.game.headlessStep(); else f.step(); const point = f.api.readRenderSnapshot();
  assert.equal(point.sequence, 0); if (fault === 'null' || fault === 'canvas') assert.equal(point.nativePipeline, false);
});
test('actual factory rejects hidden/paused, changed renderer and a different Game instance', async () => {
  const hidden = await factory(); hidden.hide(); hidden.step(); assert.equal(hidden.api.readRenderSnapshot().sequence, 0);
  const paused = await factory(); paused.game.isPaused = true; paused.step(); assert.equal(paused.api.readRenderSnapshot().sequence, 0);
  const changed = await factory(); changed.step(); changed.changeRenderer(); changed.step(); assert.equal(changed.api.readRenderSnapshot().nativePipeline, false);
  const replaced = await factory(); replaced.step(); const first = replaced.api.readRenderSnapshot(); replaced.api.createObservedGame({});
  assert.notEqual(replaced.api.readRenderSnapshot().gameId, first.gameId); assert.equal(replaced.api.readRenderSnapshot().nativePipeline, false);
});
test('snapshot reads reject an identity change after the last completed frame', async () => {
  const f = await factory(); f.step(); f.changeRenderer(); assert.equal(f.api.readRenderSnapshot().nativePipeline, false);
});
