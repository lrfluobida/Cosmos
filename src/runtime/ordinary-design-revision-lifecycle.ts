import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { regularFile } from '../artifacts/paths.ts';
import { sameValue } from '../contracts/validation.ts';
import type { RoleFactory } from '../roles/factory.ts';
import type { RunController } from './run.ts';
import type { RunSnapshot } from './run-types.ts';
import type { OwnedWork } from './recovery/owned-work.ts';
import { publishReceipt } from './recovery/receipt-file.ts';
import { authenticatedOrdinaryFunding, budgetDigest, budgetJson, budgetFields, ordinaryBudgetOwners, optionalBudgetJson, ownerCloseLocation, ownerStartContents, ownerStartReference } from './ordinary-design-revision-budget.ts';
import type { OrdinaryBudgetOwnerStart } from './ordinary-design-revision-budget.ts';

interface Capability { controller: RunController; scope: OrdinaryDesignBudgetLifecycle; operation: object; work: OwnedWork; sourceTaskId: string; sourceAttemptId: string; planSha256: string; epoch: number }
const capabilities = new WeakMap<object, Capability>();
const bindings = new WeakMap<RunController, OrdinaryDesignBudgetLifecycle>();
export interface OrdinaryDesignBudgetLifecycle {
  readonly start: OrdinaryBudgetOwnerStart;
  bindOperation(work: OwnedWork, operation: object): void;
  wrapFactory(factory: RoleFactory): RoleFactory;
  stage<T>(action: () => Promise<T>): Promise<T>;
  activate(sourceTaskId: string, sourceAttemptId: string, planSha256: string): Promise<void>;
  requireIdle(work: OwnedWork, operation: object, epoch: number): void;
  holdIdle(work: OwnedWork, operation: object, epoch: number): () => void;
  beforeClose(): Promise<void>;
}
/** A missing lock is not evidence that a previous host's actors ended. */
export async function verifyOrdinaryBudgetOwnerHistory(root: string, state: RunSnapshot, currentOwnerToken?: string) {
  for (const start of ordinaryBudgetOwners(state)) {
    const bytes = await regularFile(root, start.reference.location);
    if (budgetDigest(bytes) !== start.sha256 || !sameValue(await budgetJson(root, start.reference.location), ownerStartContents(state, start.owner))) throw new Error('Ordinary budget owner source changed.');
    if (start.owner.token === currentOwnerToken) continue;
    const closed = await optionalBudgetJson(root, ownerCloseLocation(start.owner.token));
    if (closed) {
      budgetFields(closed, ['formatVersion', 'started', 'epoch']);
      if (closed.formatVersion !== 'ordinary-design-budget-owner-closed/1' || !sameValue(closed.started, start) || !Number.isSafeInteger(closed.epoch) || closed.epoch < 0) throw new Error('Ordinary budget owner close source changed.');
      continue;
    }
    const { readFundingRecovery } = await import('./public-validation-funding.ts');
    const recovery = await readFundingRecovery(root, state, start.owner.token);
    if (!recovery) throw new Error('Prior ordinary budget owner has no proved close or exit.');
    const recovered = await budgetJson(root, recovery.source.location);
    if (!sameValue({ token: recovered.owner.token, pid: recovered.owner.pid, acquiredAt: recovered.owner.acquiredAt }, start.owner)) throw new Error('Ordinary budget recovery belongs to another owner.');
  }
}
export function requireOrdinaryBudgetCapability(controller: RunController, capability: object, sourceTaskId: string, sourceAttemptId: string, planSha256: string) {
  const value = capabilities.get(capability);
  if (!value || value.controller !== controller || bindings.get(controller) !== value.scope || value.sourceTaskId !== sourceTaskId
    || value.sourceAttemptId !== sourceAttemptId || value.planSha256 !== planSha256) throw new Error('Ordinary design budget capability is missing or belongs to another stage.');
  value.scope.requireIdle(value.work, value.operation, value.epoch);
  return { ownerStart: structuredClone(value.scope.start), epoch: value.epoch, release: value.scope.holdIdle(value.work, value.operation, value.epoch) };
}
/** Only the selected production host receives this closure; no public capability constructor. */
export async function createOrdinaryBudgetLifecycle(input: { root: string; controller: RunController; state: RunSnapshot; owner: OrdinaryBudgetOwnerStart['owner'];
  appendStart(start: OrdinaryBudgetOwnerStart): Promise<void> }): Promise<OrdinaryDesignBudgetLifecycle> {
  const { root, controller, state, owner } = input;
  if (bindings.has(controller) || !await authenticatedOrdinaryFunding(root, state)) throw new Error('Ordinary design lifecycle requires one authenticated funded host.');
  await verifyOrdinaryBudgetOwnerHistory(root, state);
  const reference = ownerStartReference(owner.token), contents = ownerStartContents(state, owner);
  await mkdir(dirname(join(root, reference.location)), { recursive: true });
  await publishReceipt(join(root, reference.location), contents);
  const start = { owner: structuredClone(owner), reference, sha256: budgetDigest(await regularFile(root, reference.location)) };
  let active = 0, epoch = 0, blocked = false, closing = false, stageReturned = false, boundFactory = false, activationHeld = false;
  let operation: object | undefined, work: OwnedWork | undefined;
  const requireLive = () => {
    controller.signal.throwIfAborted();
    if (activationHeld) throw new Error('Ordinary design activation commit is in progress.');
    if (closing || blocked || !work || !operation || work.operationState(operation) !== 'active') throw new Error('Ordinary design host operation is not live.');
  };
  const scope: OrdinaryDesignBudgetLifecycle = {
    start,
    bindOperation(value, token) {
      if (work || operation || value.operationState(token) !== 'active') throw new Error('Ordinary lifecycle needs its one actual live operation.');
      work = value; operation = token;
    },
    wrapFactory(factory) {
      if (boundFactory) throw new Error('Ordinary lifecycle factory cannot be replaced.');
      boundFactory = true;
      return async roleInput => {
        requireLive();
        if (roleInput.controller !== controller) throw new Error('Ordinary role belongs to another controller.');
        active++; epoch++;
        let session: Awaited<ReturnType<RoleFactory>>;
        try { session = await factory(roleInput); }
        catch (error) { blocked = true; epoch++; throw error; }
        let closePromise: Promise<void> | undefined;
        return { ...session, close: () => closePromise ??= Promise.resolve().then(async () => {
          try { await session.close(); active--; epoch++; }
          catch (error) { blocked = true; epoch++; throw error; }
        }) };
      };
    },
    async stage(action) { requireLive(); stageReturned = false; const result = await action(); stageReturned = true; return result; },
    async activate(sourceTaskId, sourceAttemptId, planSha256) {
      requireLive(); scope.requireIdle(work!, operation!, epoch);
      const token = Object.freeze({}); capabilities.set(token, { controller, scope, operation: operation!, work: work!, sourceTaskId, sourceAttemptId, planSha256, epoch });
      await controller.activateOrdinaryDesignRevision(token);
    },
    requireIdle(value, token, expectedEpoch) {
      requireLive();
      if (value !== work || token !== operation || expectedEpoch !== epoch || !stageReturned || active || !boundFactory) throw new Error('Ordinary design stage has active or changed sessions.');
    },
    holdIdle(value, token, expectedEpoch) {
      scope.requireIdle(value, token, expectedEpoch); activationHeld = true;
      return () => { activationHeld = false; };
    },
    async beforeClose() {
      closing = true; epoch++;
      if (active || blocked || work && (!operation || work.operationState(operation) !== 'settled')) throw new Error('Ordinary design sessions are not proved closed; retaining owner lock.');
      const path = ownerCloseLocation(owner.token), old = await optionalBudgetJson(root, path);
      if (old) {
        if (old.formatVersion !== 'ordinary-design-budget-owner-closed/1' || !sameValue(old.started, start)) throw new Error('Ordinary design owner close conflicts.');
        return;
      }
      await publishReceipt(join(root, path), { formatVersion: 'ordinary-design-budget-owner-closed/1', started: start, epoch });
    },
  };
  // Bind before publishing the snapshot anchor so failure cannot be washed out by a new tracker.
  bindings.set(controller, scope);
  await input.appendStart(start);
  return scope;
}
