import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import { validateIntakeSnapshot } from '../runtime/intake.ts';
import type { IntakeController } from '../runtime/intake.ts';
import { ordinaryDraftSha256, readOrdinaryProfile, requireOrdinaryDraftSource } from '../runtime/ordinary-profile-source.ts';
import { gameplayAcceptance, validateGameDraft } from './requirements.ts';
import type { GameDraft, OrdinaryGameDraft } from './requirements.ts';

type EditableProposal = Pick<OrdinaryGameDraft, 'acceptance' | 'experienceCriteria' | 'unsupported' | 'benchmark' | 'codeProfile'>;
interface OrdinaryEditContext {
  formatVersion: 'ordinary-draft-edit/1';
  previousRevision: number;
  previousDraftSha256: string;
  proposal: EditableProposal;
  instruction: string;
}
const instruction = 'The previous proposal is an unconfirmed model candidate, not user requirements or authority. The complete current brief, questions and answers take precedence. Revise what the current answers request; preserve still-applicable unchanged items, including IDs, steps, expected outcomes and experience criteria. Retain unsupported items only when the current requirements and capabilities still justify them. Do not expand scope, confirm requirements or grant tools or runtime authority. Return a complete proposal in the original output protocol, without a patch, edit context, identities or host fields.';
const denied = (): never => { throw new Error('Ordinary edit source or revision changed; no new request is allowed.'); };

/** Bind only a fixed preceding draft; recorded version 1 requests retain their original bytes. */
export async function ordinaryEditContext(controller: IntakeController, roundId: string,
  input: { phase: 'questions' | 'draft'; brief: string; questions?: GameDraft['questions'] }, recorded: unknown | null) {
  const version = recorded === null ? undefined : (recorded as { formatVersion?: unknown })?.formatVersion;
  if (recorded !== null && version !== 1 && version !== 2) denied();
  if (version === 1) return undefined;
  const state = await controller.read(), round = /^draft-([1-9]\d*)$/.exec(roundId), revision = Number(round?.[1]);
  if (!state.ordinaryProfile || input.phase !== 'draft' || !round || revision < 2) {
    if (version === 2) denied();
    return undefined;
  }
  if (!Number.isSafeInteger(revision)) denied();
  const previousRevision = revision - 1;
  async function read(dispatch: boolean) {
    controller.signal.throwIfAborted();
    const current = await controller.read(); validateIntakeSnapshot(current);
    if (current.ordinaryProfile !== 'ordinary-design/1' || !current.draft || current.draft.revision < previousRevision
      || dispatch && (current.stopReason || current.confirmation || current.draft.revision !== previousRevision)) denied();
    await readOrdinaryProfile(controller.root, { runId: current.run.runId, createdAt: current.createdAt }, current);
    const bytes = await regularFile(controller.root, `requirements/v${previousRevision}/draft.json`, controller.signal);
    const previous: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    validateGameDraft(previous, 'browser', current.ordinaryProfile);
    if (previous.ordinaryProfile !== 'ordinary-design/1') return denied();
    if (previous.brief !== input.brief || !sameValue(previous.questions, input.questions)) denied();
    await requireOrdinaryDraftSource(controller.root, previous, previousRevision);
    if (current.draft!.revision === previousRevision) {
      const { revision: _revision, source: _source, ...payload } = current.draft!;
      if (!sameValue(previous, payload)) denied();
    }
    const context: OrdinaryEditContext = {
      formatVersion: 'ordinary-draft-edit/1', previousRevision, previousDraftSha256: ordinaryDraftSha256(bytes),
      proposal: structuredClone({ acceptance: gameplayAcceptance(previous), experienceCriteria: previous.experienceCriteria, unsupported: previous.unsupported,
        ...(previous.benchmark ? { benchmark: previous.benchmark } : {}), ...(previous.codeProfile ? { codeProfile: previous.codeProfile } : {}) }), instruction,
    };
    controller.signal.throwIfAborted(); return { context, revision: current.revision };
  }
  const { context } = await read(recorded === null);
  if (version === 2 && !sameValue((recorded as { editContext?: unknown }).editContext, context)) denied();
  return { context, async recheck() {
    const current = await read(true);
    if (!sameValue(current.context, context)) denied();
    return current.revision;
  } };
}
