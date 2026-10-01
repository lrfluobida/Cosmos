import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPiSession, createWorkspaceTools, PI_VERSION } from '../../src/providers/pi.ts';

export const PRIOR_PROBE_REQUEST_ID = 'prior-deepseek-direct-probes';
export const PRICING_VERSION = 'deepseek-flash-peak-cny-2026-10-01';
// Reserve the entire native model context window, even for tiny prompts and images.
// This deliberately avoids estimating growing tool/compaction context with chars / 4.
export const REQUEST_RESERVATION_MICRO_CNY = 1_000_000 * 2 + 2048 * 8;

export function peakCostMicroCny(usage) {
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    assert.ok(Number.isSafeInteger(usage[key]) && usage[key] >= 0, `Invalid usage.${key}`);
  }
  return Math.ceil((usage.input + usage.cacheWrite) * 2 + usage.output * 8 + usage.cacheRead * 0.04);
}

/** Requires an already initialized COS-06 shared validation ledger. Never creates another ledger. */
export async function runPiProbe({ controller, outputDirectory }) {
  const snapshot = await controller.read();
  assert.equal(snapshot.ledger.scope, 'validation');
  assert.ok(snapshot.ledger.limitMicroCny <= 150_000_000);
  assert.ok(snapshot.ledger.entries.some(entry => entry.requestId === PRIOR_PROBE_REQUEST_ID
    && entry.status === 'settled' && entry.settledMicroCny >= 721_771), 'Import the prior direct probes before running pi');
  assert.ok(process.env.DEEPSEEK_API_KEY?.trim(), 'DEEPSEEK_API_KEY is required');
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: false });
  const workspace = join(output, 'workspace');
  const stateDirectory = join(output, 'sessions');
  const evidenceDirectory = join(output, 'requests');
  await mkdir(workspace);
  await mkdir(evidenceDirectory);
  const started = performance.now();
  const timeout = AbortSignal.timeout(90_000);
  const signal = AbortSignal.any([timeout, controller.signal]);
  let admitted = 0;
  let stage = 'tools';
  const report = {
    sdkVersion: PI_VERSION, model: 'deepseek-flash', thinkingLevel: 'low',
    pricingVersion: PRICING_VERSION, priceSource: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
    costKind: 'conservative peak estimate from returned usage, not account receipt',
    maxRequests: 8, maxOutputTokens: 2048, timeoutMs: 90_000,
    requestReservationMicroCny: REQUEST_RESERVATION_MICRO_CNY,
    startedAt: new Date().toISOString(), checks: [], requests: [], tools: [], outcome: 'running',
  };
  const budget = {
    async beforeRequest(request) {
      signal.throwIfAborted();
      assert.ok(admitted < 8, 'Live probe request cap reached');
      await controller.reserve({
        requestId: request.requestId, taskId: 'COS-03', provider: 'deepseek',
        pricingVersion: PRICING_VERSION, estimatedMaxCostMicroCny: request.estimatedMaxCostMicroCny,
      });
      await controller.admit(request.requestId);
      admitted++;
    },
    async afterResponse(response) {
      const actualCostMicroCny = response.outcome === 'settled' ? peakCostMicroCny(response.usage) : undefined;
      const record = { ...response, stage, actualCostMicroCny };
      const location = join(evidenceDirectory, `${response.requestId}.json`);
      await writeFile(location, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      const evidence = [{ artifactId: `pi-request-${response.requestId}`, version: '1', location }];
      if (response.outcome === 'settled') {
        const result = await controller.settle(response.requestId, actualCostMicroCny, evidence);
        if (result.halted) throw new Error('Ledger halted after settlement');
      } else if (response.outcome === 'not_sent') {
        await controller.cancel(response.requestId, evidence, { provenNoCost: true });
      } else {
        await controller.markUnknown(response.requestId, evidence);
      }
      report.requests.push(record);
    },
  };
  const config = {
    workspace, stateDirectory,
    systemPrompt: 'Complete this small provider integration probe. Follow the specified order and use only declared tools.',
    context: 'COS-03 acceptance A-1: preserve the marker from the file task through compaction and resume. Input contract v1. Shared validation ledger owns authorization. Missing file is an intentional tool failure.',
    maxOutputTokens: 2048, maxRequests: 8, requestTimeoutMs: 30_000,
    estimatedMaxCostMicroCny: REQUEST_RESERVATION_MICRO_CNY,
    compactionKeepRecentTokens: 0, budget,
  };
  let session;
  function observe(session) {
    session.subscribe(event => {
      if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') {
        report.tools.push({ type: event.type, toolName: event.toolName, toolCallId: event.toolCallId,
          isError: event.type === 'tool_execution_end' ? event.isError : undefined, stage,
          elapsedMs: performance.now() - started });
      }
    });
  }
  try {
    session = await createPiSession({ ...config, tools: await createWorkspaceTools({ workspace, readPaths: ['.'], writePaths: ['output.json'] }) });
    observe(session);
    await session.prompt('First read missing.txt and observe its error. Then write output.json with exactly {"stage":"draft","marker":"中文验收A-1"}. Next use edit to replace draft with fixed. Do not change the marker. Finally reply DONE.', { signal });
    assert.deepEqual(JSON.parse(await readFile(join(workspace, 'output.json'), 'utf8')), { stage: 'fixed', marker: '中文验收A-1' });
    assert.ok(report.tools.some(event => event.toolName === 'read' && event.isError));
    assert.ok(report.tools.some(event => event.toolName === 'edit' && event.type === 'tool_execution_end' && !event.isError));
    report.checks.push({ id: 'tool-error-write-edit', passed: true });
    stage = 'compaction';
    await session.compact(signal);
    report.checks.push({ id: 'native-compaction', passed: true });
    const resumeFile = session.sessionFile;
    await session.close();
    stage = 'resume-image-no-tools';
    session = await createPiSession({ ...config, tools: [], resumeFile });
    observe(session);
    const png = await readFile(new URL('../2026-10-01-deepseek/vision-fixture-2026-09-30T17-47-57.205Z.png', import.meta.url));
    const answer = await session.prompt('Return JSON only: {"marker":"the exact marker from the earlier file task","green_cells":[[row,col],...],"red_cells":[[row,col],...]}. Inspect this 3-row, 4-column grid. Coordinates start at 1, rows top to bottom, columns left to right. Green squares and red circles only; sort coordinates in row-major order.', {
      signal, images: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }],
    });
    const parsed = JSON.parse(answer.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    report.visionAnswer = parsed;
    assert.deepEqual(parsed, { marker: '中文验收A-1', green_cells: [[1, 1], [2, 3], [3, 4]], red_cells: [[1, 4], [3, 2]] });
    assert.equal(report.tools.some(event => event.stage === stage), false);
    report.checks.push({ id: 'resume-marker-and-native-image-no-tools', passed: true });
    report.outcome = 'passed';
  } catch (error) {
    report.outcome = 'failed';
    // Deliberately omit arbitrary provider/host exception text from the report.
    report.failureCode = typeof error?.code === 'string' ? error.code : 'probe_assertion_or_host_failure';
  } finally {
    await session?.close();
    report.elapsedMs = performance.now() - started;
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [ledgerRoot, outputDirectory] = process.argv.slice(2);
  if (!ledgerRoot || !outputDirectory) throw new Error('Usage: node --experimental-strip-types probes/pi/live.mjs <existing-ledger-root> <new-output-directory>');
  const { RunController } = await import('../../src/runtime/run.ts');
  const controller = await RunController.open({ root: resolve(ledgerRoot) });
  try {
    const report = await runPiProbe({ controller, outputDirectory });
    console.log(JSON.stringify({ outcome: report.outcome, requests: report.requests.length, report: join(resolve(outputDirectory), 'report.json') }));
    if (report.outcome !== 'passed') process.exitCode = 1;
  } finally { await controller.close(); }
}
