import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { AcceptanceReport } from '../../src/acceptance/runner.ts';
import { RunController } from '../../src/runtime/run.ts';
import { createPilotGuard } from '../../probes/e2e/budget.ts';
import { generatePilot } from '../../probes/e2e/driver.ts';
import { runChild, writeJson } from '../../probes/e2e/host.ts';
import { TRIAL } from '../../probes/e2e/trial.ts';

// Small scripted native-session/host fixtures exercise the production driver.
// These contain no playable target game and are not runtime-generation evidence.
const mediaFixture = {
  characters: ['producer', 'shooter', 'defender', 'normal', 'armored'].map(id => ({ id, width: 64, height: 64, anchor: { x: 32, y: 64 },
    layers: [{ id: 'body', shape: 'ellipse', x: 16, y: 16, width: 32, height: 32, fill: '#22aacc', stroke: '#112233', strokeWidth: 1 }],
    states: ['idle', 'attack', 'death'].map(name => ({ name, fps: 4, loop: name !== 'death', frames: [{ body: { opacity: 1 } }, { body: { opacity: 0.7, dx: 2 } }] })) })),
  audio: ['bgm', 'place', 'shoot', 'hit', 'victory', 'defeat'].map(id => ({ id, sampleRate: 22050, duration: 0.1, loop: id === 'bgm', notes: [{ midi: 60, start: 0, duration: 0.08, gain: 0.1, wave: 'sine', attack: 0.01, release: 0.01 }] })),
};

for (const staleFinalReport of [false, true]) test(`production driver corrects review JSON and repairs real compiler failure; stale final report: ${staleFinalReport}`, { timeout: 60_000 }, async t => {
  const repository = fileURLToPath(new URL('../../', import.meta.url)), root = await mkdtemp(join(tmpdir(), 'cosmos-driver-trial-'));
  const toolchain = join(root, 'toolchain'); await mkdir(toolchain);
  await cp(join(repository, 'templates/2d'), toolchain, { recursive: true, filter: path => !path.includes('node_modules') });
  const controller = await RunController.create({ root: join(root, 'ledger'), runId: 'fixture-validation', ledgerId: 'fixture-ledger', kind: 'evaluation', specVersion: '1.0', scope: 'validation',
    allocations: [{ taskId: 'COS-10', amountMicroCny: 10_000_000 }, { taskId: 'prior', amountMicroCny: 892_282 }] });
  await controller.importSettled({ requestId: 'fixture-prior', taskId: 'prior', provider: 'fixture', pricingVersion: 'fixture', actualCostMicroCny: 892_282, evidence: [{ artifactId: 'prior', version: 'v1', location: 'prior.json' }] });
  const guard = await createPilotGuard({ root, controller, deadlineAt: new Date(Date.now() + 55_000).toISOString(), maxRequests: 40 });
  t.after(async () => { guard.close(); await controller.close(); await rm(root, { recursive: true, force: true }); });
  const limits: Record<string, number[]> = {}, versions: string[] = [], reviewerContexts: string[] = [];
  let requestCount = 0, corrected = false;
  const result = await generatePilot({ repository, root, prefix: TRIAL.id, controller, guard, toolchain, childAllocationCapMicroCny: 19_000_000, confirmedAt: new Date().toISOString(), trial: true,
    // The time estimate is host-owned; the fixture replaces slow build/browser work.
    repairEstimate: { costMicroCny: 1000, durationMs: 1000, cleanupMs: 100, requests: 3 },
    sessionFactory: async config => {
      const packet = JSON.parse(config.context); (limits[packet.role] ??= []).push(config.maxOutputTokens);
      if (packet.role === 'reviewer') reviewerContexts.push(packet.contextId);
      let prompts = 0;
      return { async prompt(text) {
        prompts++; const requestId = randomUUID(); requestCount++;
        await config.budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 1, maxOutputTokens: 1, hasImages: false, estimatedMaxCostMicroCny: 10 });
        try {
          if (packet.role === 'cosmos') {
            const acceptance = packet.acceptance.map((a: any) => a.acceptanceId);
            return { text: JSON.stringify({ tasks: [
              { taskId: `${TRIAL.id}-design`, role: 'design', objective: 'Offline design fixture', acceptanceIds: ['PILOT-DESIGN'], dependsOn: [] },
              { taskId: `${TRIAL.id}-art`, role: 'art', objective: 'Offline media fixture', acceptanceIds: ['PILOT-MEDIA'], dependsOn: [`${TRIAL.id}-design`] },
              { taskId: `${TRIAL.id}-coding`, role: 'coding', objective: 'Offline compiler fixture', acceptanceIds: acceptance.filter((id: string) => !['PILOT-DESIGN', 'PILOT-MEDIA'].includes(id)), dependsOn: [`${TRIAL.id}-design`, `${TRIAL.id}-art`] },
            ] }) };
          }
          if (packet.role === 'reviewer') {
            const needsCorrection = packet.taskId.endsWith('-design') && prompts === 1;
            if (prompts === 2) { assert.match(text, /only protocol correction/); corrected = true; }
            return { text: JSON.stringify({ verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.filter((e: any) => e.kind === 'test_report').map((e: any) => e.evidenceId), findings: needsCorrection ? ['All fixture checks passed.'] : [] }) };
          }
          const write = config.tools.find(tool => tool.name === 'write')!;
          const put = (path: string, content: string) => write.execute(randomUUID(), { path, content }, undefined, undefined, undefined as never);
          if (packet.role === 'design') {
            const frozen = JSON.parse(await readFile(join(repository, 'probes/e2e/requirements.json'), 'utf8'));
            await put('authors/design/design.json', JSON.stringify({ summary: 'Offline design fixture only', implementationNotes: ['No target game is implemented by this test'], acceptanceMapping: Object.fromEntries(frozen.acceptanceIds.map((id: string) => [id, 'Fixed fixture mapping'])) }));
          } else if (packet.role === 'art') await put('authors/art/mediaSpec.json', JSON.stringify(mediaFixture));
          else {
            const repair = packet.interfaces.some((ref: any) => ref.artifactId.startsWith('repair-feedback-'));
            if (repair) {
              const feedback = packet.interfaces.find((ref: any) => ref.artifactId.startsWith('repair-feedback-'));
              const data = JSON.parse(await readFile(join(root, feedback.location), 'utf8'));
              assert.equal(data.issues[0].checkId, 'build/typecheck'); assert.equal(data.issues[0].classification, 'code_defect');
            }
            await put('authors/coding/src/main.ts', repair ? 'export const fixture: number = 1;\n' : 'export const fixture: number = "broken";\n');
            await put('authors/coding/index.html', '<!doctype html><meta charset="utf-8"><p>Offline host fixture only</p>');
          }
          return { text: JSON.stringify({ summary: 'Assigned offline fixture output is complete', remaining: [], uncertainty: [] }) };
        } finally {
          await config.budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', stopReason: 'stop', elapsedMs: 0,
            usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
        }
      }, async close() {} };
    },
    host: {
      async buildProject(_root, project, _toolchain, _name, signal) {
        versions.push(project.includes('/v2/') || project.includes('\\v2\\') ? 'v2' : 'v1');
        const check = await runChild(process.execPath, [join(repository, 'node_modules/typescript/bin/tsc'), '--noEmit', '--skipLibCheck', '--target', 'ES2022', 'src/main.ts'], { cwd: project, signal, timeoutMs: 15_000 });
        if (check.code !== 0) return { passed: false, results: [check], work: project };
        await mkdir(join(project, 'dist')); await cp(join(project, 'index.html'), join(project, 'dist/index.html'));
        return { passed: true, results: [check, { code: 0, stdout: 'Offline fixture bundle', stderr: '' }], work: project };
      },
      async runAcceptance(plan, options) {
        const fixed = plan as import('../../src/acceptance/plan.ts').AcceptancePlan;
        assert.equal(fixed.artifact.version, 'v2');
        const reportedPlan = structuredClone(fixed); if (staleFinalReport) reportedPlan.artifact.version = 'v1';
        const reportPath = 'offline-fixture/report.json', at = new Date().toISOString();
        const report: AcceptanceReport = { formatVersion: '1.0.0', kind: 'normal_browser_input', plan: reportedPlan, startedAt: at, endedAt: at, outcome: 'passed',
          browser: { name: 'chromium', channel: 'offline-fixture', version: 'fixture', headless: true, viewport: fixed.viewport }, timeoutMs: 1000,
          cleanup: { browserPid: null, forced: false, processExited: true }, errors: [], files: [reportPath], reportPath,
          steps: fixed.steps.map(step => ({ id: step.id, kind: step.kind, outcome: 'passed', expected: 'expected' in step ? step.expected : 'input delivered', actual: 'expected' in step ? step.expected : 'input delivered',
            ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}), error: null, screenshot: null })),
          evidence: [{ contractVersion: '1.0.0', evidenceId: 'offline-browser-proof', taskId: fixed.taskId, acceptanceIds: fixed.acceptanceIds, kind: 'test_report', source: { artifactId: 'offline-browser-report', version: fixed.reportId, location: reportPath }, artifactVersions: [fixed.artifact], outcome: 'passed', recordedAt: at, summary: 'Scripted host report; not game-generation evidence' }],
        };
        await writeJson(options.evidenceRoot, reportPath, report); return report;
      },
    },
  });
  assert.deepEqual(limits.cosmos, [4096]); assert.ok(limits.design.every(limit => limit === 16384)); assert.ok(limits.coding.every(limit => limit === 16384)); assert.ok(limits.reviewer.every(limit => limit === 16384));
  assert.equal(result.outcome, staleFinalReport ? 'failed' : 'passed'); assert.equal(corrected, true); assert.deepEqual(versions, ['v1', 'v2']);
  if (staleFinalReport) assert.equal(result.accepted, undefined);
  else { assert.equal(result.accepted!.candidateRef.version, 'v2'); assert.equal(result.accepted!.review.attemptId, result.accepted!.evidence.attemptId); }
  assert.equal(new Set(reviewerContexts).size, reviewerContexts.length);
  const failed = result.tasks.find(task => task.taskId.endsWith('-coding'))!, repaired = result.tasks.at(-1)!;
  assert.equal(failed.state, 'failed'); assert.equal(failed.evidence[0].outcome, 'failed'); assert.equal(repaired.state, staleFinalReport ? 'failed' : 'passed');
  assert.ok(repaired.context.interfaces.some(ref => ref.artifactId.startsWith('repair-feedback-')));
  assert.equal(result.tasks.filter(task => task.context.interfaces.some(ref => ref.artifactId.startsWith('repair-feedback-'))).length, 1);
  const journal = JSON.parse(await readFile(join(root, 'pilot-budget.json'), 'utf8')), snapshot = await controller.read();
  assert.equal(journal.requestIds.length, requestCount); assert.ok(requestCount <= 40);
  assert.equal(snapshot.ledger.entries[0].settledMicroCny, 892_282);
  assert.equal(snapshot.ledger.entries.filter(entry => entry.taskId === repaired.taskId).length, staleFinalReport ? 1 : 2);
  assert.equal(requestCount, staleFinalReport ? 8 : 9);
  assert.equal(snapshot.ledger.entries.reduce((sum, entry) => sum + entry.settledMicroCny, 0), 892_282 + requestCount * 2);
});
