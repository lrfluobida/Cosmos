import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compareFixedStepPacing } from '../../src/acceptance/equivalence.ts';

// A generic fixed-step mechanism fixture, not a generated game or browser test.
const initial = (seed: number) => ({ value: seed, cooldown: 0, outcome: 'running', save: 0 });
const step = (state: ReturnType<typeof initial>, input: number | undefined) => {
  const next = { ...state, cooldown: Math.max(0, state.cooldown - 1) };
  const events: string[] = [];
  if (input && !next.cooldown) { next.value += input; next.cooldown = 3; events.push('changed'); }
  if (next.value >= 10) next.outcome = 'complete';
  next.save = next.value;
  return { state: next, events };
};
const options = () => ({
  seed: 2, initial, step, steps: 12, inputs: [{ tick: 2, value: 3 }, { tick: 6, value: 5 }],
  checkpoints: [1, 2, 6, 12], normalBatchSize: 1, acceleratedBatchSize: 4,
});

test('same fixed-step function preserves exact events and checkpoint state across pacing', async () => {
  const waits: number[] = [];
  const result = await compareFixedStepPacing({ ...options(), pace: async (ticks) => { waits.push(ticks); } });
  assert.equal(result.outcome, 'passed');
  assert.equal(result.kind, 'mechanism_equivalence');
  assert.deepEqual(result.normal, result.accelerated);
  assert.deepEqual(result.normal.at(-1)?.state, { value: 10, cooldown: 0, outcome: 'complete', save: 10 });
  assert.deepEqual(waits, [...Array(12).fill(1), ...Array(3).fill(4)]);
});

test('detects a nondeterministic step instead of approving different pacing', async () => {
  let calls = 0;
  const result = await compareFixedStepPacing({ ...options(), step: (state, input) => {
    const next = step(state, input); calls += 1;
    if (calls > 12) next.state.save += 1;
    return next;
  } });
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(result.divergentTicks, [1, 2, 6, 12]);
});

test('rejects missing checkpoints and duplicate or out-of-range inputs', async () => {
  for (const override of [{ checkpoints: [] }, { inputs: [{ tick: 0, value: 1 }] },
    { inputs: [{ tick: 2, value: 1 }, { tick: 2, value: 2 }] }, { acceleratedBatchSize: 0 }]) {
    await assert.rejects(compareFixedStepPacing({ ...options(), ...override }), /Invalid/);
  }
});
