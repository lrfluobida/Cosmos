import type { CDPSession } from '@playwright/test';
import type { PixelPattern } from './plan.ts';

// These functions run in Chromium's isolated world. The plan supplies data arguments only.
async function visibleLayout(selectors: string[]): Promise<boolean> {
  const elements = selectors.map(selector => {
    const matches = document.querySelectorAll(selector);
    if (matches.length !== 1) throw new Error(`Layout selector must resolve exactly once: ${selector}`);
    return matches[0];
  });
  const entries = await new Promise<IntersectionObserverEntry[]>(resolve => {
    const records = new Map<Element, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(batch => {
      for (const entry of batch) records.set(entry.target, entry);
      if (records.size === new Set(elements).size) {
        observer.disconnect(); resolve(elements.map(element => records.get(element)!));
      }
    }, { trackVisibility: true, delay: 100, threshold: 1 } as IntersectionObserverInit);
    elements.forEach(element => observer.observe(element));
  });
  return entries.every((entry, index) => {
    if (!('isVisible' in entry)) throw new Error('Chromium layout visibility evidence unavailable');
    const box = entry.boundingClientRect;
    return entry.isVisible === true && entry.intersectionRatio === 1 && box.width > 0 && box.height > 0
      && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
      && entries.slice(0, index).every(previous => {
        const other = previous.boundingClientRect;
        return box.left >= other.right || box.right <= other.left || box.top >= other.bottom || box.bottom <= other.top;
      });
  });
}

async function matchesPixels(png: string, viewport: { width: number; height: number }, pattern: PixelPattern): Promise<boolean> {
  const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const { x, y, width, height, rows, tolerance } = pattern;
  const context = new OffscreenCanvas(width, height).getContext('2d');
  if (!context || image.width !== viewport.width || image.height !== viewport.height) {
    image.close(); throw new Error('CSS viewport screenshot dimensions or decoder unavailable');
  }
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  image.close();
  const rgba = context.getImageData(0, 0, width, height).data;
  const color = [1, 3, 5].map(start => parseInt(pattern.color.slice(start, start + 2), 16));
  for (const [r, row] of rows.entries()) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      const left = Math.floor(c * width / row.length), right = Math.floor((c + 1) * width / row.length);
      const top = Math.floor(r * height / rows.length), bottom = Math.floor((r + 1) * height / rows.length);
      let matches = 0;
      for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
        const i = (py * width + px) * 4;
        if (rgba[i + 3] !== 255) throw new Error('Expected an opaque composited screenshot');
        if (Math.abs(rgba[i] - color[0]) <= tolerance && Math.abs(rgba[i + 1] - color[1]) <= tolerance
          && Math.abs(rgba[i + 2] - color[2]) <= tolerance) matches++;
      }
      const pixels = (right - left) * (bottom - top);
      if (row[c] === '+' ? matches * 100 < pixels * 35 : matches * 100 > pixels * 10) return false;
    }
  }
  return true;
}

async function isolatedCheck(session: CDPSession, implementation: string, args: unknown[]): Promise<boolean> {
  const { frameTree } = await session.send('Page.getFrameTree');
  const { executionContextId } = await session.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'cosmos-visual-observations' });
  const { result, exceptionDetails } = await session.send('Runtime.callFunctionOn', { executionContextId, functionDeclaration: implementation,
    arguments: args.map(value => ({ value })), returnByValue: true, awaitPromise: true });
  if (exceptionDetails || typeof result.value !== 'boolean') throw new Error(exceptionDetails?.exception?.description ?? 'Browser visual observation unavailable');
  return result.value;
}

export function observeLayout(session: CDPSession, selectors: string[]): Promise<boolean> {
  return isolatedCheck(session, visibleLayout.toString(), [selectors]);
}
export function observePixelPattern(session: CDPSession, screenshot: Buffer, viewport: { width: number; height: number }, pattern: PixelPattern): Promise<boolean> {
  return isolatedCheck(session, matchesPixels.toString(), [screenshot.toString('base64'), viewport, pattern]);
}
