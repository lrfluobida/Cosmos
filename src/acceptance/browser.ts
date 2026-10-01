import type { Page } from '@playwright/test';
import type { Observation, Scalar, Step } from './plan.ts';

export async function observe(page: Page, observation: Observation, timeoutMs: number): Promise<Scalar> {
  if (observation.kind === 'text') return page.locator(observation.selector).innerText({ timeout: timeoutMs });
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
