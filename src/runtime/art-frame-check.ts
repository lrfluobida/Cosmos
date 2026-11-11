import { chromium } from '@playwright/test';
import { regularFile } from '../artifacts/paths.ts';
import type { PixelPattern } from '../acceptance/plan.ts';
import { filterBrowserEnvironment } from '../acceptance/persistent.ts';
import { measurePixelPattern, type MeasuredCell } from '../acceptance/visual-observations.ts';
import { identifier, number, object } from '../media/validation.ts';
import { renderCharacter, type CharacterSpec } from '../media/vector.ts';
import type { BrowserScenario } from '../roles/requirements.ts';
import { validateDeclaredMedia, type DesignDocument } from './entrypoint-media.ts';
import { validationHash } from './validation-validation.ts';

type Stage = 'main' | 'reopen';
type Frame = { characterId: string; state: string; frame?: number };
export type Mapping = Frame & { stepId: string; stage?: Stage; background?: Frame };
type PatternStep = { stage: Stage; stepId: string; expected: boolean; pattern: PixelPattern };
const frameKeys = ['characterId', 'state', 'frame'];
const frame = (data: Record<string, unknown>): Frame => ({ characterId: identifier(data.characterId), state: identifier(data.state),
  ...(data.frame != null ? { frame: number(data.frame, 0, 63, true) } : {}) });

export function artMappings(input: unknown): Mapping[] {
  if (!Array.isArray(input) || input.length > 8) throw new Error('Supply at most eight art frame mappings.');
  return input.map(value => {
    const data = object(value, [...frameKeys, 'stepId', 'stage', 'background']);
    if (typeof data.stepId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(data.stepId)) throw new Error('Expected a plan stepId.');
    if (data.stage != null && data.stage !== 'main' && data.stage !== 'reopen') throw new Error('Use stage main or reopen.');
    return { ...frame(data), stepId: data.stepId, ...(data.stage ? { stage: data.stage } : {}),
      ...(data.background != null ? { background: frame(object(data.background, frameKeys)) } : {}) };
  });
}

function patternSteps(scenario: BrowserScenario) {
  const result: PatternStep[] = [];
  for (const [stage, steps] of [['main', scenario.steps], ['reopen', scenario.reopen?.steps ?? []]] as const) {
    for (const step of steps) if ('observation' in step && step.observation.kind === 'pixel-pattern' && typeof step.expected === 'boolean')
      result.push({ stage, stepId: step.id, expected: step.expected, pattern: step.observation });
  }
  return result;
}

export function artPatternIndex(scenario: BrowserScenario, offset = 1) {
  const distinct = new Map<string, PixelPattern & Omit<PatternStep, 'pattern'> & { count: number }>();
  for (const { stage, stepId, expected, pattern } of patternSteps(scenario)) {
    const { x, y, width, height, color, tolerance, rows } = pattern;
    const key = JSON.stringify([x, y, width, height, color.toLowerCase(), tolerance, rows, expected]);
    const existing = distinct.get(key);
    if (existing) existing.count++;
    else distinct.set(key, { stage, stepId, expected, count: 1, ...pattern });
  }
  if (!Number.isSafeInteger(offset) || offset < 1 || offset > Math.max(distinct.size, 1)) throw new Error('Art pattern index offset is out of range.');
  return { viewport: scenario.viewport, totalPatterns: distinct.size, patterns: [...distinct.values()].slice(offset - 1, offset + 7),
    ...(offset + 7 < distinct.size ? { nextOffset: offset + 8 } : {}) };
}

export function mappedPattern(scenario: BrowserScenario, mapping: Mapping) {
  const candidates = patternSteps(scenario).filter(step => step.stepId === mapping.stepId && (!mapping.stage || step.stage === mapping.stage));
  if (candidates.length !== 1) throw new Error(candidates.length ? 'Ambiguous stepId; select main or reopen.' : 'Pixel-pattern step missing: ' + mapping.stepId);
  return candidates[0];
}

interface FrameResult {
  stepId: string; characterId: string; state: string; passed: boolean; expected?: boolean; matched?: boolean;
  failedCells?: MeasuredCell[]; matchingCells?: MeasuredCell[]; error?: string;
}

export function frameSvg(characters: CharacterSpec[], ref: Frame) {
  const character = characters.find(item => item.id === ref.characterId);
  if (!character) throw new Error('Character missing from current media: ' + ref.characterId);
  const state = character.states.find(item => item.name === ref.state);
  if (!state) throw new Error('State missing from current character: ' + ref.state);
  const pose = state.frames[ref.frame ?? 0];
  if (!pose) throw new Error('Frame index out of range for state ' + state.name);
  return renderCharacter({ ...character, states: [{ ...state, frames: [pose] }] }).files[0].svg;
}

type MeasureFrame = (pattern: PixelPattern, foreground: string, background?: string) => ReturnType<typeof measurePixelPattern>;

/** All callers supply SVG from frameSvg. Reuse the same offline Edge context throughout a search. */
export async function withFrameMeasurement<T>(viewport: BrowserScenario['viewport'], run: (measure: MeasureFrame) => Promise<T>) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, env: filterBrowserEnvironment(process.env) });
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, offline: true, serviceWorkers: 'block' });
    const session = await page.context().newCDPSession(page);
    const image = (svg: string, x: number, y: number, width: number, height: number) =>
      '<img style="position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + width + 'px;height:' + height
      + 'px" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '">';
    return await run(async (pattern, foreground, background) => {
      const layers = (background ? image(background, 0, 0, viewport.width, viewport.height) : '')
        + image(foreground, pattern.x, pattern.y, pattern.width, pattern.height);
      await page.setContent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' + layers);
      await page.evaluate(async () => { await Promise.all(Array.from(document.images, img => img.decode())); });
      return measurePixelPattern(session, await page.screenshot({ scale: 'css' }), viewport, pattern);
    });
  } finally { await browser.close(); }
}

export async function checkArtFrames(scenario: BrowserScenario, design: DesignDocument, media: unknown, checks: unknown) {
  const mappings = artMappings(checks);
  const { characters } = validateDeclaredMedia(media, design, 'draft-subset');
  return withFrameMeasurement(scenario.viewport, async measure => {
    const results: FrameResult[] = [];
    for (const mapping of mappings) {
      const row: FrameResult = { ...mapping, passed: false };
      results.push(row);
      let step: PatternStep, foreground: string, background: string | undefined;
      try {
        step = mappedPattern(scenario, mapping);
        foreground = frameSvg(characters, mapping);
        if (mapping.background) background = frameSvg(characters, mapping.background);
      } catch (error) { row.error = (error as Error).message; continue; }
      const { pattern, expected } = step;
      const pixels = await measure(pattern, foreground, background);
      row.expected = expected; row.matched = pixels.failedCells.length === 0; row.passed = row.matched === expected;
      if (!row.passed && row.matched) row.matchingCells = pixels.matchingCells;
      if (!row.passed && !row.matched) row.failedCells = pixels.failedCells;
    }
    return { method: 'Native frame at pattern ROI over white or explicit viewport background. Advisory art composition.',
      cells: 'Zero-based [row,column,matchingPixels,totalPixels]; + >=35%, - <=10%.', results };
  });
}

/** Only the owned host worker supplies these paths and pinned bytes. The model supplies frame mappings only. */
export async function runArtFrameWorker(input: { root: string; workspace: string; designLocation: string; hashes: string[]; checks: Mapping[] }) {
  const buffers = await Promise.all([regularFile(input.root, input.designLocation + '/_cosmos/acceptance-plan.json'),
    regularFile(input.root, input.designLocation + '/_cosmos/design.json'), regularFile(input.workspace, 'authors/art/media.json')]);
  const [plan, design, media] = buffers.map((bytes, i) => {
    if (validationHash(bytes) !== input.hashes[i]) throw new Error('Current art check input changed.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  });
  return checkArtFrames(plan.scenario, design, media, input.checks);
}
