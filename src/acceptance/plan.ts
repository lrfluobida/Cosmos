import type { ArtifactReference } from '../contracts/types.ts';

export type Scalar = string | number | boolean | null;
export type Observation = { kind: 'debug'; path: string[] } | { kind: 'text'; selector: string } | { kind: 'visible'; selector: string };
export type Step = { id: string } & (
  | { kind: 'mouse-click' | 'mouse-move'; x: number; y: number; selector?: string }
  | { kind: 'locator-click'; selector: string; timeoutMs: number }
  | { kind: 'assert' | 'wait-for'; acceptanceId: string; observation: Observation; expected: Scalar; timeoutMs: number }
);
export interface AcceptancePlan {
  formatVersion: '1.0.0'; projectId: string; taskId: string; runId: string; reportId: string; specVersion: string;
  artifact: ArtifactReference; url: string; viewport: { width: number; height: number };
  acceptanceIds: string[]; steps: Step[];
}

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const identifier = (value: unknown) => text(value) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value) && !value.includes('..') && !value.endsWith('.')
  && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
const scalar = (value: unknown) => value === null || typeof value === 'boolean' || typeof value === 'string'
  || (typeof value === 'number' && Number.isFinite(value));

export function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
      && !url.username && !url.password;
  } catch { return false; }
}

/** Only JSON data is accepted. No script, expression, debug setter or arbitrary evaluation field exists. */
export function validatePlan(value: unknown): string[] {
  const issues: string[] = [];
  const fail = (path: string, valid: boolean, message: string) => { if (!valid) issues.push(`${path}: ${message}`); };
  const keys = (v: Record<string, any>, allowed: string[], path: string) => {
    fail(path, Object.keys(v).every(key => allowed.includes(key)), 'Unknown field');
  };
  if (!object(value)) return ['$: Expected a plan object'];
  keys(value, ['formatVersion', 'projectId', 'taskId', 'runId', 'reportId', 'specVersion', 'artifact', 'url', 'viewport', 'acceptanceIds', 'steps'], '$');
  fail('formatVersion', value.formatVersion === '1.0.0', 'Expected 1.0.0');
  for (const key of ['projectId', 'taskId', 'runId', 'reportId', 'specVersion']) fail(key, identifier(value[key]), 'Expected a safe nonempty identifier');
  if (!object(value.artifact)) issues.push('artifact: Expected a fixed artifact reference');
  else {
    keys(value.artifact, ['artifactId', 'version', 'location'], 'artifact');
    fail('artifact.artifactId', identifier(value.artifact.artifactId), 'Expected an identifier');
    fail('artifact.version', identifier(value.artifact.version) && !/^(main|master|head|latest|current|dev|develop)$/i.test(value.artifact.version), 'Expected a fixed snapshot version');
    fail('artifact.location', text(value.artifact.location), 'Expected the snapshot location');
  }
  fail('url', text(value.url) && isLocalUrl(value.url), 'Expected a loopback HTTP(S) URL without credentials');
  if (!object(value.viewport)) issues.push('viewport: Expected width and height');
  else {
    keys(value.viewport, ['width', 'height'], 'viewport');
    for (const key of ['width', 'height']) fail(`viewport.${key}`, integer(value.viewport[key], 100, 4096), 'Expected 100..4096 pixels');
  }
  const ids = value.acceptanceIds;
  if (!Array.isArray(ids) || !ids.length || !ids.every(identifier) || new Set(ids).size !== ids.length) issues.push('acceptanceIds: Expected unique acceptance identifiers');
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 200) return [...issues, 'steps: Expected 1..200 steps'];
  const seen = new Set(), covered = new Set();
  value.steps.forEach((step: unknown, index: number) => {
    const path = `steps[${index}]`;
    if (!object(step)) { issues.push(`${path}: Expected a step`); return; }
    fail(path, identifier(step.id) && !seen.has(step.id), 'Expected a unique step identifier'); seen.add(step.id);
    if (['mouse-click', 'mouse-move'].includes(step.kind)) {
      keys(step, ['id', 'kind', 'x', 'y', 'selector'], path);
      for (const axis of ['x', 'y']) fail(path, typeof step[axis] === 'number' && Number.isFinite(step[axis]) && step[axis] >= 0
        && step[axis] < (step.selector ? 1 : (value.viewport?.[axis === 'x' ? 'width' : 'height'] ?? 0)), 'Coordinates must be within viewport or normalized selector bounds [0,1)');
      if (step.selector !== undefined) fail(path, text(step.selector), 'Expected a selector');
    } else if (step.kind === 'locator-click') {
      keys(step, ['id', 'kind', 'selector', 'timeoutMs'], path);
      fail(path, text(step.selector), 'Expected a selector');
      fail(path, integer(step.timeoutMs, 1, 60_000), 'Expected timeoutMs 1..60000');
    } else if (['assert', 'wait-for'].includes(step.kind)) {
      keys(step, ['id', 'kind', 'acceptanceId', 'observation', 'expected', 'timeoutMs'], path);
      fail(path, Array.isArray(ids) && ids.includes(step.acceptanceId), 'Unknown acceptanceId'); covered.add(step.acceptanceId);
      fail(path, scalar(step.expected), 'Expected a finite JSON scalar');
      fail(path, integer(step.timeoutMs, 1, 60_000), 'Expected timeoutMs 1..60000');
      const observation = step.observation;
      if (!object(observation)) { issues.push(`${path}: Expected observation`); return; }
      if (observation.kind === 'debug') {
        keys(observation, ['kind', 'path'], path);
        fail(path, Array.isArray(observation.path) && observation.path.length > 0 && observation.path.length <= 8
          && observation.path.every((key: unknown) => text(key) && /^[a-zA-Z0-9_]+$/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key)), 'Expected a read-only cosmosDebug data path');
      } else if (['text', 'visible'].includes(observation.kind)) {
        keys(observation, ['kind', 'selector'], path);
        fail(path, text(observation.selector), 'Expected a selector');
        if (observation.kind === 'visible') fail(path, typeof step.expected === 'boolean', 'Visibility expects a boolean');
      } else issues.push(`${path}: Unknown observation kind`);
    } else issues.push(`${path}: Unsupported step kind`);
  });
  if (Array.isArray(ids)) for (const id of ids) fail('acceptanceIds', covered.has(id), `Missing assertion for ${id}`);
  return issues;
}
