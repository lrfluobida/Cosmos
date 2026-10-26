import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { groupFixture } from './validation-group.fixture.ts';
import type { PublicValidationAuthorization } from '../../src/runtime/public-validation-funding-types.ts';
import { PassThrough, Readable } from 'node:stream';
import { runCli } from '../../src/cli/index.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { IntakeController } from '../../src/runtime/intake.ts';
import { createRoleBudget } from '../../src/roles/provider-budget.ts';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';
import { RunController } from '../../src/runtime/run.ts';
import { OwnedWork } from '../../src/runtime/recovery/owned-work.ts';
import { planTaskDag } from '../../src/roles/planner.ts';
import { executeTaskDag } from '../../src/runtime/orchestrator.ts';
import { deliveryTaskProofs, publishGenerationReport } from '../../src/runtime/experience.ts';
import { finishCompletion } from '../../src/runtime/completion-timing.ts';
import { startBudgetWarnings, startControl } from '../../src/cli/control.ts';
import { publishReceipt } from '../../src/runtime/recovery/receipt-file.ts';

export async function fundingFixture(t: TestContext, spent = 1_116_402) {
  const f = await groupFixture(t, spent);
  const authorization = async (name = 'one', limitMicroCny = 5_000_000) => {
    const shared = await f.snapshot(), runRoot = resolve(f.root, '..', `公共运行-${name}`);
    const payload: PublicValidationAuthorization = {
      formatVersion: 'public-validation-authorization/1', fundingId: name,
      sharedRoot: resolve(f.root), sharedRunId: shared.run.runId, sharedLedgerId: shared.ledger.ledgerId,
      runRoot, runId: `game-${name}`, ledgerId: `game-${name}-budget`,
      limits: { limitMicroCny, durationMs: 1_800_000 }, brief: '鼠标配对小游戏', renderFrames: false,
      decisionId: `operator-${name}`, actorId: 'offline-operator', decidedAt: new Date().toISOString(), sourceRefs: f.evidence,
    };
    const ref = { artifactId: 'funding-authorization', version: name, location: `funding-${name}.json` };
    await writeFile(join(f.root, ref.location), JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return { sharedRoot: resolve(f.root), runRoot, authorization: ref, payload };
  };
  return { ...f, authorization, child: async (root: string) => JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8')) };
}

export async function fundedIntake(f: Awaited<ReturnType<typeof fundingFixture>>, name = 'one', cap = 5_000_000) {
  const args = await f.authorization(name, cap), binding = await reservePublicValidationFunding(args);
  const output = new PassThrough(); output.resume();
  await runCli(['new', args.runRoot, '--brief', args.payload.brief, '--max-cny', (cap / 1_000_000).toFixed(6), '--max-minutes', '30'], {
    funding: binding, input: Readable.from([]), output, host: {
      async prepare() { return { environmentReady: false, executionReady: false }; },
      async questions() { throw new Error('No question'); }, async draft() { throw new Error('No draft'); }, async execute() { throw new Error('No execution'); },
    },
  });
  const controller = await IntakeController.open({ root: args.runRoot });
  return { ...args, binding, controller };
}

export async function chargeIntake(value: Awaited<ReturnType<typeof fundedIntake>>, requestId: string, input = 1, estimate = 20) {
  const budget = createRoleBudget({ controller: value.controller, taskId: 'intake', evidenceDirectory: join(value.runRoot, 'intake-sessions', requestId) });
  await budget.beforeRequest({ requestId, modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: estimate });
  await budget.afterResponse({ requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
    usage: { input, output: 0, cacheRead: 0, cacheWrite: 0 } as any });
}

/** Produce the historical mismatch through real publication and signing, before any test mutation. */
export async function signedOrdinaryIncompleteFunding(t: TestContext, fault = '') {
  const f = await fundingFixture(t), ordinary = await ordinaryHostFixture(t, { revisionPolicy: true, sessionFactory: async (config, fallback) => {
    const packet = JSON.parse(config.context!);
    if (packet.role !== 'design') return fallback;
    return { ...fallback, prompt: async () => {
      await config.budget.beforeRequest({ requestId: 'synthetic-design-charge', modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 20 });
      await config.budget.afterResponse({ requestId: 'synthetic-design-charge', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 } as any });
      throw new Error('Synthetic initial design failure after settled charge');
    } };
  } });
  const args = await f.authorization('ordinary-history');
  args.runRoot = ordinary.root; args.payload.runRoot = ordinary.root; args.payload.brief = ordinary.draft.brief;
  await writeFile(join(f.root, args.authorization.location), JSON.stringify(args.payload, null, 2) + '\n', 'utf8');
  const binding = await reservePublicValidationFunding(args);
  let published: any, completion: any, planned: any;
  ordinary.host.execute = async input => {
    const controller = await RunController.open({ root: ordinary.root }), work = new OwnedWork(controller.signal);
    const control = await startControl(ordinary.root, binding.runId, () => controller.stop('Synthetic stop'));
    const warnings = await startBudgetWarnings(ordinary.root, () => {});
    await controller.markFundingExecution();
    const host = await createBrowserHost({ ...input, controller, work, ...ordinary.hostOptions, ordinaryDesignRevisionPolicy: 'independent-review/1', ordinaryMediaObservationPolicy: 'audio-state/1' });
    planned = await planTaskDag({ controller, requirement: input.requirement, planningTaskId: 'planning', workspace: ordinary.root, sessionRoot: join(ordinary.root, 'sessions'),
      availableArtifacts: host.availableArtifacts, taskPolicies: host.taskPolicies, roleFactory: host.roleFactory });
    host.validateTasks!(planned.tasks);
    await publishReceipt(join(ordinary.root, 'execution.json'), { capability: host.capability, requirement: input.requirement, tasks: planned.tasks, availableArtifacts: host.availableArtifacts, plan: planned.plan,
      authorProtocolCorrections: 1, ordinaryDesignBudgetPolicy: 'review-reserve/1', ordinaryDesignRevisionPolicy: 'independent-review/1', ordinaryMediaObservationPolicy: 'audio-state/1' });
    const design = planned.tasks.find((item: any) => item.role === 'design'); await host.bindPreparedTasks!([design]);
    await executeTaskDag({ controller, requirement: input.requirement, tasks: [design], sessionRoot: join(ordinary.root, 'sessions'), availableArtifacts: host.availableArtifacts,
      roleFactory: host.roleFactory, preAuthor: host.preAuthor, capture: host.capture, verify: host.verify, diagnoseFailure: host.diagnoseFailure,
      reviewProtocolCorrections: 1, authorProtocolCorrections: 1, recovery: { artifactRoot: ordinary.root, journalRoot: join(ordinary.root, 'journal'), recoverCapture: host.recoverCapture } });
    if (fault === 'registered-downstream' || fault === 'charged-downstream') {
      const art = planned.tasks.find((item: any) => item.role === 'art').task; await controller.registerTasks([art]);
      if (fault === 'charged-downstream') {
        const budget = createRoleBudget({ controller, taskId: art.taskId, evidenceDirectory: join(ordinary.root, 'sessions/synthetic-art') });
        await budget.beforeRequest({ requestId: 'synthetic-art-charge', modelId: 'deepseek-flash', inputBytes: 1, hasImages: false, maxOutputTokens: 1, estimatedMaxCostMicroCny: 20 });
        await budget.afterResponse({ requestId: 'synthetic-art-charge', outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1, usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 } as any });
      }
    }
    const state = await controller.read(), proof = deliveryTaskProofs(planned.tasks.map((item: any) => state.tasks.find(task => task.taskId === item.task.taskId) ?? item.task));
    if (fault === 'design-proof') proof[0].attemptId = 'unknown-attempt';
    if (fault === 'downstream-attempt') proof[1].attemptId = 'unknown-attempt';
    if (fault === 'downstream-artifact') proof[1].artifacts = [{ artifactId: 'unknown-output', version: 'v1', location: 'unknown/output' }];
    if (fault === 'downstream-review') proof[1].review.reviewerId = 'unknown-reviewer';
    published = await publishGenerationReport(ordinary.root, { outcome: 'incomplete', runId: state.run.runId, ledgerId: state.ledger.ledgerId, currentProject: ordinary.root,
      gaps: ['Original initial design incomplete; art and coding have not executed.'], effectiveTasks: proof, requiresCompletionTiming: true,
      ...(fault === 'candidate' ? { acceptedCandidate: { candidateRef: { artifactId: 'unknown', version: 'v1', location: 'unknown/candidate' } } } : {}),
      ordinaryDesignReview: { authority: 'independent_model_review', sourceTaskId: design.task.taskId, revisionAttempted: false, selectedVersion: null,
        blocked: [{ taskId: design.task.taskId, reason: 'Ordinary design revision blocked: initial_design_incomplete.' }] },
      taskHistory: state.tasks.map(task => ({ taskId: task.taskId, state: task.state, artifacts: task.artifacts, handoff: task.handoff })), userExperience: 'not_confirmed' },
    { capability: host.capability, requirement: input.requirement, unsupported: input.draft.unsupported });
    const resources = [
      { name: 'warnings', close: async () => { await warnings.close(); if (fault === 'warnings-failed') throw new Error('Synthetic warnings close failure'); } },
      { name: 'control', close: async () => { await control.close(); if (fault === 'control-failed') throw new Error('Synthetic control close failure'); } },
      ...(fault === 'preparation-failed' ? [{ name: 'preparation', close: async () => { throw new Error('Synthetic preparation close failure'); } }] : []),
      ...(fault === 'duplicate-cleanup' ? [{ name: 'control', close: async () => {} }] : []),
      ...(fault === 'unknown-cleanup' ? [{ name: 'unknown-resource', close: async () => {} }] : []),
    ];
    if (fault === 'owner-failed' || fault === 'fallback') {
      const close = controller.closeForCompletion.bind(controller);
      controller.closeForCompletion = async (...args) => { if (fault === 'owner-failed') await close(...args); throw new Error('Synthetic owner drain failure'); };
    }
    completion = await finishCompletion({ root: ordinary.root, controller, work, published: published.report, cleanup: resources });
    return { ...published, completionTiming: completion };
  };
  const output = new PassThrough(); output.resume();
  await runCli(['new', ordinary.root, '--brief', args.payload.brief, '--max-cny', '5.000000', '--max-minutes', '30'], {
    funding: binding, host: ordinary.host, input: Readable.from(['点击后显示完成\nconfirm 1\n']), output,
  });
  const marker = JSON.parse(await readFile(join(ordinary.root, 'delivery/current-report.json'), 'utf8'));
  const names = (await readdir(join(ordinary.root, 'delivery'))).filter(name => /^completion-(?:[a-f0-9-]{36}|unreported-\d+)\.json$/.test(name));
  if (names.length !== 1) throw new Error('Synthetic funded history must have exactly one real completion receipt.');
  const actualReceiptPath = join(ordinary.root, 'delivery', names[0]);
  const receiptBytes = await readFile(actualReceiptPath), receipt = JSON.parse(receiptBytes.toString('utf8'));
  if (fault !== 'no-stop') {
    const accounting = await RunController.open({ root: ordinary.root });
    if (fault === 'new-execution') await accounting.markFundingExecution();
    await accounting.stop('Permanent stop after the original signed cleanup'); await accounting.close();
  }
  return { f, ...args, binding, ordinary, planned, published, completion, receipt, receiptBytes, receiptPath: actualReceiptPath,
    source: `delivery/${names[0]}`, reportPath: join(ordinary.root, marker.report.location),
    snapshot: () => f.child(ordinary.root) };
}
