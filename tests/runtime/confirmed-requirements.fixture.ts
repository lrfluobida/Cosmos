import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import type { TestContext } from 'node:test';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { runCli } from '../../src/cli/index.ts';
import { ordinaryDraft } from '../roles/ordinary.fixture.ts';
import type { OrdinaryGameDraft } from '../../src/roles/requirements.ts';

export const silentOutput = () => new Writable({ write(_chunk, _encoding, done) { done(); } });
export const snapshot = async (root: string) => JSON.parse(await readFile(join(root, 'snapshot.json'), 'utf8'));
export async function temporaryRun(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'cos129-'));
  t.after(() => removeOwned(tmpdir(), root)); return root;
}
/** The original public stdin path owns the only human confirmation, at revision 2. */
export async function confirmedSource(t: TestContext, options: { draft?: OrdinaryGameDraft; intake?: boolean; unconfirmed?: boolean; frames?: boolean; charged?: boolean } = {}) {
  const root = await temporaryRun(t), draft = options.draft ?? ordinaryDraft();
  let prepares = 0;
  const host = { ordinaryProfile: 'ordinary-design/1' as const,
    async prepare() { return { environmentReady: true, executionReady: !(options.intake && ++prepares === 2) }; },
    async questions() { return draft.questions; },
    async draft(input: any) {
      if (options.charged) {
        await input.controller.reserve({ requestId: input.roundId, taskId: 'intake', provider: 'source-fixture', pricingVersion: 'v1', estimatedMaxCostMicroCny: 10 });
        await input.controller.admit(input.roundId);
        await input.controller.settle(input.roundId, 2, [{ artifactId: 'fixture-answer', version: input.roundId, location: `intake-answers/v${input.roundId.slice(6)}.json` }]);
      }
      return { ...draft, answers: input.answers };
    },
    async execute(input: any) { return { draft: input.draft, requirement: input.requirement }; },
  };
  const answers = draft.questions.map(question => draft.answers[question.id]).join('\n');
  await runCli(['new', root, '--brief', draft.brief, '--render-frames', String(!!options.frames)], {
    host, input: Readable.from([`${answers}\nedit\n${answers}\n${options.unconfirmed ? 'cancel' : 'confirm 2'}\n`]), output: silentOutput(),
  });
  return { root, draft, state: await snapshot(root) };
}
