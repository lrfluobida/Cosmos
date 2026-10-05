import type { Page } from '@playwright/test';
import type { Observation, Scalar, Step } from './plan.ts';
import type { ArtifactReference } from '../contracts/types.ts';
import type { PersistentAcceptanceSeries } from './persistent.ts';

export interface MediaObservationRequest {
  formatVersion: 'readonly-media/1'; media: ArtifactReference; manifestSha256: string;
  candidate: ArtifactReference; sourceVersion: string; planBindingSha256: string;
  scope: NonNullable<PersistentAcceptanceSeries['scope']>; fields: { id: string; path: string[] }[];
}
/** Generic host binding has no transfer source or persistent-series scope. */
export interface GenericMediaObservationRequest {
  formatVersion: 'readonly-media/generic-1'; media: ArtifactReference; manifestSha256: string;
  candidate: ArtifactReference; planBindingSha256: string; fields: { id: string; path: string[]; expected: Scalar }[];
}
export type ReadonlyMediaObservationRequest = MediaObservationRequest | GenericMediaObservationRequest;
export interface MediaObservationSample { request: ReadonlyMediaObservationRequest; recordedAt: string; values: Scalar[] }

/** Trusted fixed paths only. Read one document snapshot; never invoke nested getters or setters. */
export async function observeDebugScalars(page: Pick<Page, 'evaluate'>, paths: string[][], capacity: 592 | 4544 = 592): Promise<Scalar[]> {
  if (![592, 4544].includes(capacity) || !Array.isArray(paths) || !paths.length || paths.length > capacity || paths.some(path => !Array.isArray(path) || !path.length
    || path.length > 8 || path.some(key => typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(key)
      || ['__proto__', 'constructor', 'prototype'].includes(key)))) throw new Error('Invalid trusted debug observation paths');
  return page.evaluate((paths: string[][]) => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'cosmosDebug');
    if (!descriptor || descriptor.set || descriptor.writable === true || descriptor.configurable) throw new Error('cosmosDebug must be read-only and non-configurable');
    const snapshot: unknown = descriptor.get ? descriptor.get.call(window) : descriptor.value;
    return paths.map(path => {
      let value: unknown = snapshot;
      for (const key of path) {
        if (value === null || typeof value !== 'object') throw new Error(`Missing debug value: ${key}`);
        const field = Object.getOwnPropertyDescriptor(value, key);
        if (!field || field.get || field.set) throw new Error(`Debug path must contain data properties: ${key}`);
        value = field.value;
      }
      if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) throw new Error('Observation must be a JSON scalar');
      return value as string | number | boolean | null;
    });
  }, paths);
}

export async function observe(page: Page, observation: Observation, timeoutMs: number): Promise<Scalar> {
  if (observation.kind === 'text') return page.locator(observation.selector).filter({ visible: true }).innerText({ timeout: timeoutMs });
  if (observation.kind === 'visible') return page.locator(observation.selector).isVisible();
  return page.evaluate((path: string[]) => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'cosmosDebug');
    if (!descriptor || descriptor.set || descriptor.writable === true || descriptor.configurable) throw new Error('cosmosDebug must be read-only and non-configurable');
    let value: unknown = descriptor.get ? descriptor.get.call(window) : descriptor.value;
    for (const key of path) {
      if (value === null || typeof value !== 'object') throw new Error(`Missing debug value: ${key}`);
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || field.get || field.set) throw new Error(`Debug path must contain data properties: ${key}`);
      value = field.value;
    }
    if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) throw new Error('Observation must be a JSON scalar');
    return value as string | number | boolean | null;
  }, observation.path);
}

export async function input(page: Page, step: Exclude<Step, { kind: 'assert' | 'wait-for' }>): Promise<void> {
  if (step.kind === 'locator-click') {
    await page.locator(step.selector).click({ timeout: step.timeoutMs }); return;
  }
  let { x, y } = step;
  if (step.selector) {
    const bounds = await page.locator(step.selector).boundingBox({ timeout: 2000 });
    if (!bounds) throw new Error(`Input target is not visible: ${step.selector}`);
    x = bounds.x + x * bounds.width; y = bounds.y + y * bounds.height;
  }
  if (step.kind === 'mouse-click') await page.mouse.click(x, y);
  else await page.mouse.move(x, y);
}
