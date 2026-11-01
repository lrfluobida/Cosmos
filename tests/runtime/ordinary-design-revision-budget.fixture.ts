import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import type { TestContext } from 'node:test';
import { ordinaryHostFixture } from './ordinary-design.fixture.ts';
import { fundingFixture } from './public-validation-funding.fixture.ts';
import { reservePublicValidationFunding } from '../../src/runtime/public-validation-funding.ts';
import { runProductSession } from '../../src/cli/session.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RoleSession } from '../../src/roles/factory.ts';
import type { RunController } from '../../src/runtime/run.ts';
import { executeGeneration } from '../../src/runtime/entrypoint.ts';
import { createBrowserHost } from '../../src/runtime/entrypoint-host.ts';

export async function conservedFixture(t: TestContext, change?: (config: PiSessionOptions, fallback: RoleSession) => Promise<RoleSession>, options: { intercept?: (controller: RunController) => void; fault?: string } = {}) {
  const ordinary = await ordinaryHostFixture(t, { revisionPolicy: 'independent-review/2', fault: options.fault, limits: { limitMicroCny: 5000000, durationMs: 1800000 },
    sessionFactory: async (config, fallback) => {
      if (change) return change(config, fallback);
      const packet = JSON.parse(config.context!);
      if (packet.role === 'reviewer' && packet.taskId === 'design-task') return { ...fallback, prompt: async (...args) => {
        const reply = JSON.parse((await fallback.prompt(...args)).text);
        return { text: JSON.stringify({ ...reply, verdict: 'changes_requested', findings: ['Clarify original completion requirement.'] }) };
      } };
      if (packet.role === 'design' && packet.taskId.endsWith('-revision')) return { ...fallback, prompt: async () => { throw new Error('Synthetic stop after revision allocation'); } };
      return fallback;
    } });
  if (options.intercept) ordinary.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
    options.intercept!(hostInput.controller); return createBrowserHost({ ...hostInput, ...ordinary.hostOptions, ordinaryDesignRevisionPolicy: 'independent-review/2' });
  } });
  const shared = await fundingFixture(t), args = await shared.authorization('conserved');
  args.runRoot = ordinary.root; args.payload.runRoot = ordinary.root; args.payload.brief = ordinary.draft.brief;
  await writeFile(join(shared.root, args.authorization.location), JSON.stringify(args.payload, null, 2) + '\n', 'utf8');
  const binding = await reservePublicValidationFunding(args), output = new PassThrough(); output.resume();
  const execute = () => runProductSession({ command: 'new', root: ordinary.root, brief: ordinary.draft.brief, host: ordinary.host, funding: binding,
    limits: binding.limits, input: Readable.from(['点击后显示完成\nconfirm 1\n']), output });
  const state = async () => JSON.parse(await readFile(join(ordinary.root, 'snapshot.json'), 'utf8'));
  const resume = () => runProductSession({ command: 'resume', root: ordinary.root, host: ordinary.host, input: Readable.from([]), output });
  return { ...ordinary, shared, binding, execute, resume, state };
}
