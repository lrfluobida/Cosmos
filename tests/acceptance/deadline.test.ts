import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { bounded, DeadlineError } from '../../src/acceptance/deadline.ts';

test('operation setup time consumes the deadline instead of delaying the timeout timer', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  let outcome = 'pending';
  const result = bounded(() => {
    t.mock.timers.tick(40); // Synchronous setup consumes 40 ms of the original 50 ms allowance.
    return new Promise<void>(resolve => setTimeout(resolve, 30));
  }, 50, 'Operation');
  result.then(() => { outcome = 'passed'; }, error => { outcome = error instanceof DeadlineError ? 'timed-out' : 'unexpected'; });
  t.mock.timers.tick(10);
  await setImmediate();
  assert.equal(outcome, 'timed-out');
  t.mock.timers.runAll();
});
