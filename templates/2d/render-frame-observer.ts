import Phaser from 'phaser';

// Captured host module. Counters live in this module, outside author debug/global data.
const nativeStep = Phaser.Game.prototype.step, nativeSceneRender = Phaser.Scenes.SceneManager.prototype.render;
const nativeNow = performance.now, clock = () => nativeNow.call(performance);
const CanvasRenderer = Phaser.Renderer.Canvas.CanvasRenderer, WebGLRenderer = Phaser.Renderer.WebGL.WebGLRenderer;
const CanvasContext = CanvasRenderingContext2D, GLContext = WebGLRenderingContext, GL2Context = typeof WebGL2RenderingContext === 'undefined' ? null : WebGL2RenderingContext;
const canvasDraws = ['drawImage', 'fill', 'stroke', 'fillRect', 'fillText', 'strokeText'], glDraws = ['drawArrays', 'drawElements'];
const methods = (prototype: any, names: string[]): Record<string, Function> => Object.fromEntries(names.map(name => [name, prototype[name]]));
const nativeCanvas = methods(CanvasContext.prototype, canvasDraws), nativeGL = methods(GLContext.prototype, [...glDraws, 'getParameter']);
const nativeGL2 = GL2Context && methods(GL2Context.prototype, [...glDraws, 'getParameter']), framebufferBinding = GLContext.prototype.FRAMEBUFFER_BINDING;
const states = new WeakMap<Phaser.Game, State>();
let current: Phaser.Game | null = null, multipleGames = false;
interface State {
  gameId: string; sequence: number; frames: { sequence: number; time: number; draws: number; boundary: 'native-post-render'; rendererPostCalls: 1; sceneRenders: number; nativeStepSequence: number; loopFrame: number }[]; issues: Set<string>; epoch: number;
  renderer: any; canvas: HTMLCanvasElement | null; scene: any; context: any; wrappers: { object: any; key: string; value: Function }[];
  inside: boolean; stage: number; draws: number; renderable: boolean; lastScenes: string; lastSurface: string;
  stepSequence: number; postCalls: number; sceneRenders: number;
  lastActivity: string;
}
function issue(state: State, reason: string) { state.issues.add(reason); }
function surface(game: Phaser.Game) {
  const canvas = game.canvas, rect = canvas?.getBoundingClientRect();
  return { width: canvas?.width ?? 0, height: canvas?.height ?? 0, cssWidth: rect?.width ?? 0, cssHeight: rect?.height ?? 0, dpr: devicePixelRatio };
}
function scenes(game: Phaser.Game) { return game.scene?.getScenes(true).filter(scene => scene.sys.isVisible()).map(scene => scene.sys.settings.key) ?? []; }
function visible(game: Phaser.Game) {
  const canvas = game.canvas;
  if (document.visibilityState !== 'visible' || !(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return false;
  const style = getComputedStyle(canvas), rect = canvas.getBoundingClientRect();
  return style.display !== 'none' && style.visibility === 'visible' && +style.opacity > 0 && rect.width > 0 && rect.height > 0
    && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
}
function observeActivity(game: Phaser.Game, state: State) {
  const activity = JSON.stringify([visible(game), game.isPaused || !game.isRunning]);
  if (state.lastActivity && state.lastActivity !== activity) state.epoch++;
  state.lastActivity = activity;
}
function currentOwnership(game: Phaser.Game, state: State) {
  const renderer = state.renderer;
  return renderer?.game === game && (renderer instanceof CanvasRenderer ? renderer.gameCanvas : renderer.canvas) === state.canvas
    && (renderer instanceof CanvasRenderer ? renderer.gameContext : renderer.gl) === state.context && state.context?.canvas === state.canvas;
}
function instrument(game: Phaser.Game, state: State) {
  const renderer: any = game.renderer;
  if (!renderer || !(renderer instanceof CanvasRenderer || renderer instanceof WebGLRenderer) || renderer.game !== game
    || (renderer instanceof CanvasRenderer ? renderer.gameCanvas : renderer.canvas) !== game.canvas || !(game.canvas instanceof HTMLCanvasElement)) { issue(state, 'native_renderer_missing'); return; }
  const context: any = renderer instanceof CanvasRenderer ? renderer.gameContext : renderer.gl;
  if (!context || context.canvas !== game.canvas || !(renderer instanceof CanvasRenderer ? context instanceof CanvasContext
    : context instanceof GLContext || GL2Context && context instanceof GL2Context)) { issue(state, 'native_context_missing'); return; }
  const contextMethods = renderer instanceof CanvasRenderer ? nativeCanvas : GL2Context && context instanceof GL2Context ? nativeGL2! : nativeGL;
  state.renderer = renderer; state.canvas = game.canvas; state.scene = game.scene; state.context = context;
  const wrap = (object: any, key: string, action: (original: Function, args: any[]) => any) => {
    const original = object[key];
    if (typeof original !== 'function') { issue(state, `native_method_missing:${key}`); return; }
    const value = function(this: any, ...args: any[]) { if (this !== object) { issue(state, `method_receiver_changed:${key}`); return original.apply(this, args); } return action(original, args); };
    object[key] = value; state.wrappers.push({ object, key, value });
  };
  const prototype: any = renderer instanceof CanvasRenderer ? CanvasRenderer.prototype : WebGLRenderer.prototype;
  for (const name of ['preRender', 'render', 'postRender']) if ((renderer as any)[name] !== prototype[name]) issue(state, `renderer_method_changed:${name}`);
  if (game.scene.render !== nativeSceneRender) issue(state, 'scene_render_changed');
  wrap(renderer, 'preRender', (original, args) => { if (state.inside && state.stage === 0) { original.apply(renderer, args); state.stage = 1; }
    else { issue(state, 'unexpected_pre_render'); return original.apply(renderer, args); } });
  wrap(game.scene, 'render', (original, args) => {
    if (!state.inside || state.stage !== 1 || args[0] !== renderer) issue(state, 'unexpected_scene_render');
    state.stage = 2;
    try { return original.apply(game.scene, args); } finally { state.stage = 3; }
  });
  wrap(renderer, 'render', (original, args) => {
    const [scene, children] = args;
    if (state.inside && state.stage === 2 && scene?.sys?.game === game && scene.sys.isActive() && scene.sys.isVisible()
      && Array.isArray(children) && children.some(child => child.active && child.visible && (child.alpha === undefined || child.alpha > 0))) { state.renderable = true; state.sceneRenders++; }
    return original.apply(renderer, args);
  });
  wrap(renderer, 'postRender', (original, args) => {
    if (!state.inside || state.stage !== 3) issue(state, 'unexpected_post_render');
    state.postCalls++;
    const result = original.apply(renderer, args); state.stage = 4; return result;
  });
  if (renderer instanceof WebGLRenderer) state.wrappers.push({ object: context, key: 'getParameter', value: contextMethods.getParameter });
  for (const name of renderer instanceof CanvasRenderer ? canvasDraws : glDraws) {
    if (typeof contextMethods[name] !== 'function' || context[name] !== contextMethods[name]) { issue(state, `native_context_method_changed:${name}`); continue; }
    wrap(context, name, (original, args) => {
      const result = original.apply(context, args);
      const toCanvas = renderer instanceof CanvasRenderer || contextMethods.getParameter.call(context, framebufferBinding) === null;
      if (state.inside && [2, 3].includes(state.stage) && state.renderable && toCanvas) state.draws++;
      return result;
    });
  }
}
class ObservedGame extends Phaser.Game {
  step(time: number, delta: number): void {
    const state = states.get(this); if (!state) { nativeStep.call(this, time, delta); return; }
    if (state.inside) { issue(state, 'recursive_game_step'); nativeStep.call(this, time, delta); return; }
    if (!state.renderer) instrument(this, state);
    observeActivity(this, state);
    const names = JSON.stringify(scenes(this)), size = JSON.stringify(surface(this));
    if (state.lastScenes && state.lastScenes !== names || state.lastSurface && state.lastSurface !== size) state.epoch++;
    state.lastScenes = names; state.lastSurface = size;
    if (this.step !== ObservedGame.prototype.step || this.renderer !== state.renderer || this.canvas !== state.canvas || this.scene !== state.scene
      || !currentOwnership(this, state) || performance.now !== nativeNow || state.wrappers.some(wrapper => wrapper.object[wrapper.key] !== wrapper.value)) issue(state, 'observer_or_game_changed');
    state.inside = true; state.stage = 0; state.draws = 0; state.renderable = false; state.postCalls = 0; state.sceneRenders = 0; state.stepSequence++;
    try {
      nativeStep.call(this, time, delta);
      if (!this.isPaused && visible(this) && scenes(this).length && state.stage === 4 && state.postCalls === 1 && state.renderable && state.draws > 0 && !state.issues.size) {
        const at = clock(); if (state.frames.length && at <= state.frames.at(-1)!.time) issue(state, 'non_monotonic_frame_time');
        else { state.frames.push({ sequence: ++state.sequence, time: at, draws: state.draws, boundary: 'native-post-render', rendererPostCalls: 1,
          sceneRenders: state.sceneRenders, nativeStepSequence: state.stepSequence, loopFrame: this.loop.frame }); if (state.frames.length > 8192) state.frames.shift(); }
      }
    } finally { state.inside = false; }
  }
}
/** Creates a real Phaser Game with transparent render observation, before loop callback binding. */
export function createObservedGame(config: Phaser.Types.Core.GameConfig): Phaser.Game {
  const game = new ObservedGame(config);
  if (current) multipleGames = true;
  const state: State = { gameId: crypto.randomUUID(), sequence: 0, frames: [], issues: new Set(), epoch: 0,
    renderer: null, canvas: null, scene: null, context: null, wrappers: [], inside: false, stage: 0, draws: 0, renderable: false, lastScenes: '', lastSurface: '', stepSequence: 0, postCalls: 0, sceneRenders: 0, lastActivity: '' };
  states.set(game, state); current = game;
  for (const event of [Phaser.Core.Events.PAUSE, Phaser.Core.Events.RESUME, Phaser.Core.Events.HIDDEN, Phaser.Core.Events.VISIBLE]) game.events.on(event, () => { state.epoch++; });
  document.addEventListener('visibilitychange', () => { state.epoch++; });
  return game;
}
/** Read-only module export; author window/debug FPS declarations are never consumed. */
export function readRenderSnapshot() {
  const game = current, state = game && states.get(game); if (!game || !state) throw new Error('No Game was created by the captured observer factory.');
  observeActivity(game, state);
  if (state.renderer && (game.renderer !== state.renderer || game.canvas !== state.canvas || game.scene !== state.scene
    || !currentOwnership(game, state) || game.step !== ObservedGame.prototype.step || performance.now !== nativeNow || state.wrappers.some(wrapper => wrapper.object[wrapper.key] !== wrapper.value))) issue(state, 'observer_or_game_changed');
  const point = { formatVersion: 'phaser-render-observer/1', engineVersion: Phaser.VERSION, gameId: state.gameId,
    renderer: game.renderer instanceof CanvasRenderer ? 'canvas' : game.renderer instanceof WebGLRenderer ? 'webgl' : null,
    nativePipeline: !!state.renderer && !state.issues.size && !multipleGames, activeScenes: scenes(game), visible: visible(game), paused: game.isPaused || !game.isRunning,
    issues: [...state.issues, ...(multipleGames ? ['multiple_games'] : [])], activityEpoch: state.epoch, sequence: state.sequence, now: clock(), surface: surface(game), frames: state.frames.map(frame => Object.freeze({ ...frame })) };
  Object.freeze(point.frames); Object.freeze(point.activeScenes); Object.freeze(point.issues); Object.freeze(point.surface); return Object.freeze(point);
}
