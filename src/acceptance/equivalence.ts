import { isDeepStrictEqual } from 'node:util';

export interface PacingProbe<State, Input, Event> {
  seed: number; initial: (seed: number) => State;
  step: (state: State, input: Input | undefined) => { state: State; events: Event[] };
  steps: number; inputs: { tick: number; value: Input }[]; checkpoints: number[];
  normalBatchSize: number; acceleratedBatchSize: number;
  pace?: (ticksInBatch: number) => Promise<void>;
}

/** Mechanism probe only: both schedules call the exact same fixed-step function and input sequence. */
export async function compareFixedStepPacing<State, Input, Event>(probe: PacingProbe<State, Input, Event>) {
  const validTick = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= probe.steps;
  if (!Number.isSafeInteger(probe.seed) || !Number.isSafeInteger(probe.steps) || probe.steps < 1 || probe.steps > 1_000_000
    || !validTick(probe.normalBatchSize) || !validTick(probe.acceleratedBatchSize)
    || !probe.checkpoints.length || !probe.checkpoints.includes(probe.steps) || !probe.checkpoints.every(validTick)
    || new Set(probe.checkpoints).size !== probe.checkpoints.length || !probe.inputs.every(input => validTick(input.tick))
    || new Set(probe.inputs.map(input => input.tick)).size !== probe.inputs.length) throw new Error('Invalid fixed-step probe bounds, inputs or checkpoints');
  const inputs = new Map(probe.inputs.map(input => [input.tick, structuredClone(input.value)]));
  const replay = async (batchSize: number) => {
    let state = probe.initial(probe.seed);
    const events: { tick: number; value: Event }[] = [];
    const checkpoints: { tick: number; state: State; events: typeof events }[] = [];
    for (let start = 1; start <= probe.steps; start += batchSize) {
      const end = Math.min(probe.steps, start + batchSize - 1);
      await probe.pace?.(end - start + 1);
      for (let tick = start; tick <= end; tick += 1) {
        const result = probe.step(state, structuredClone(inputs.get(tick)));
        state = result.state;
        events.push(...result.events.map(value => ({ tick, value: structuredClone(value) })));
        if (probe.checkpoints.includes(tick)) checkpoints.push(structuredClone({ tick, state, events }));
      }
    }
    return checkpoints;
  };
  const normal = await replay(probe.normalBatchSize), accelerated = await replay(probe.acceleratedBatchSize);
  const divergentTicks = normal.filter((checkpoint, i) => !isDeepStrictEqual(checkpoint, accelerated[i])).map(checkpoint => checkpoint.tick);
  return { kind: 'mechanism_equivalence' as const, outcome: divergentTicks.length ? 'failed' as const : 'passed' as const,
    seed: probe.seed, steps: probe.steps, inputs: structuredClone(probe.inputs), normal, accelerated, divergentTicks };
}
