export function artifact(artifactId = 'game', version = 'v1', location = 'artifacts/game/v1') {
  return { artifactId, version, location };
}

export function context() {
  return { contextId: 'author-context', rules: ['保留中文内容'], interfaces: [], knownFailures: [], tools: ['node'] };
}

export function evidence() {
  return {
    contractVersion: '1.0.0', evidenceId: 'evidence-1', taskId: 'COS-example',
    acceptanceIds: ['AC-1'], kind: 'test_report', source: artifact('report', 'v1', 'evidence/report.json'),
    artifactVersions: [artifact()], outcome: 'passed', recordedAt: '2026-10-01T01:00:00.000Z', summary: '离线检查通过',
  };
}

export function requirement() {
  return {
    contractVersion: '1.0.0', specVersion: 'spec-v1', confirmedBy: 'user-1', confirmedAt: '2026-10-01T00:00:00.000Z',
    sources: [artifact('requirements', 'v1', 'requirements/v1.json')],
    acceptance: [{ acceptanceId: 'AC-1', description: '游戏启动', steps: ['运行启动检查'], expected: '退出码为 0', evidenceKinds: ['test_report'] }],
  };
}

export function task() {
  return {
    contractVersion: '1.0.0', taskId: 'COS-example', kind: 'runtime_generation', runId: 'run-1', specVersion: 'spec-v1',
    authorId: 'author-1', acceptanceIds: ['AC-1'], objective: '生成可启动游戏',
    dependsOn: [{ taskId: 'COS-input', requiredState: 'passed', state: 'passed' }],
    inputs: [artifact('requirements', 'v1', 'requirements/v1.json')], context: context(),
    ownership: { writePaths: ['game/'], readOnlyPaths: ['requirements/'] },
    outputs: [{ type: 'game', schema: 'game/1', destination: 'artifacts/game/v1' }],
    acceptance: [{ acceptanceId: 'AC-1', steps: ['运行启动检查'], expected: '退出码为 0', evidenceDestinations: ['evidence/report.json'] }],
    budget: { ledgerId: 'ledger-1', allocationMicroCny: 50_000_000, originalDeadlineAt: '2026-10-01T12:00:00.000Z' },
    state: 'awaiting_review', stateReason: null,
    attempts: [{ attemptId: 'attempt-1', sessionRef: 'sessions/attempt-1.jsonl', startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T01:00:00.000Z', outcome: 'passed', failure: null }],
    artifacts: [artifact()], evidence: [evidence()],
    handoff: { completed: ['工程与测试'], remaining: ['独立评审'], uncertainty: [], resumeFrom: 'artifacts/game/v1' },
    review: { reviewerId: null, contextId: null, inputVersions: [], verdict: 'pending', evidenceIds: [] },
  };
}

export function passedTask() {
  const value = task();
  value.state = 'passed';
  value.handoff.remaining = [];
  Object.assign(value.review, { reviewerId: 'reviewer-1', contextId: 'review-context', inputVersions: structuredClone([...value.inputs, ...value.artifacts]), verdict: 'approved', evidenceIds: ['evidence-1'] });
  return value;
}

export function ledger() {
  return {
    contractVersion: '1.0.0', ledgerId: 'ledger-1', scope: 'generation', limitMicroCny: 200_000_000, warningThresholdPercent: 80,
    allocations: [{ taskId: 'COS-example', amountMicroCny: 50_000_000 }],
    entries: [{ requestId: 'request-1', taskId: 'COS-example', provider: 'fixture-provider', pricingVersion: '2026-10-01', reservedMicroCny: 1_000_000, settledMicroCny: 0, unknown: false, status: 'reserved', evidence: [] }],
  };
}

export function run() {
  return {
    contractVersion: '1.0.0', runId: 'run-1', kind: 'runtime_generation', specVersion: 'spec-v1', ledgerId: 'ledger-1',
    originalStartedAt: '2026-10-01T00:00:00.000Z', originalDeadlineAt: '2026-10-01T12:00:00.000Z',
    state: 'running', taskIds: ['COS-example'], fees: { reservedMicroCny: 1_000_000, settledMicroCny: 0, unknownRequestIds: [] },
    artifacts: [artifact()], humanDecisions: [],
  };
}
