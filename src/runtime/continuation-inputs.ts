import { createHash } from 'node:crypto';
import { regularFile } from '../artifacts/paths.ts';
import type { ArtifactReference, TaskContract } from '../contracts/types.ts';
import { sameValue } from '../contracts/validation.ts';
import type { PreparedTask } from './orchestrator.ts';
import type { RunSnapshot } from './run-types.ts';
import { RecoveryBlocked, requireOriginalTask } from './recovery/task-journal.ts';

/** Authority stays in D2. This read-only preflight preserves the authorized sources' topology and fixed inputs. */
export async function requireContinuationInputs(snapshot: RunSnapshot, prepared: PreparedTask[], artifactRoot: string): Promise<void> {
  if (snapshot.formatVersion !== 2) return;
  const window = snapshot.continuation!.windows.find(item => item.windowId === snapshot.continuation!.currentWindowId)!;
  const recorded = new Map(snapshot.tasks.map(task => [task.taskId, task])), supplied = new Map(prepared.map(item => [item.task.taskId, item]));
  const fail = (message: string): never => { throw new RecoveryBlocked(message); };
  if (window.grants.some(grant => !supplied.has(grant.taskId))) fail('Complete continuation DAG must include every quoted successor.');
  const aliases = new Map<string, string>();
  const source = window.quote.auxiliarySources.find(item => item.path === 'repair-plan.json');
  if (source) {
    const bytes = await regularFile(artifactRoot, source.path);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) fail('Quoted dependency replacement source changed.');
    const plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const replacements = plan.formatVersion === 2 ? plan.replacements : [{ sourceTaskId: plan.sourceTaskId, replacementTaskId: plan.replacementTaskId }];
    if (!Array.isArray(replacements) || !replacements.length || replacements.length > 3) fail('Quoted dependency replacement map is invalid.');
    for (const item of replacements) {
      if (!recorded.has(item?.sourceTaskId) || !recorded.has(item?.replacementTaskId) || aliases.has(item.sourceTaskId)) fail('Quoted dependency replacement identity is unavailable.');
      aliases.set(item.sourceTaskId, item.replacementTaskId);
    }
    if ([...aliases.values()].some(id => aliases.has(id)) || new Set(aliases.values()).size !== aliases.size) fail('Quoted dependency replacement map has an ambiguous source.');
  }
  const replacements = new Map(window.grants.map(grant => [grant.sourceTaskId, grant.taskId]));
  const effective = (id: string) => { const prior = aliases.get(id) ?? id; return replacements.get(prior) ?? prior; };
  for (const item of prepared) {
    const grant = window.grants.find(grant => grant.taskId === item.task.taskId);
    const original = recorded.get(grant?.sourceTaskId ?? item.task.taskId) ?? fail('Continuation source task is missing.');
    const dependencies = grant ? original.dependsOn.map(dep => ({ ...dep, taskId: effective(dep.taskId) })) : original.dependsOn;
    const edges = (task: Pick<TaskContract, 'dependsOn'>) => task.dependsOn.map(({ taskId, requiredState }) => ({ taskId, requiredState }));
    if (!sameValue(edges(item.task), edges({ dependsOn: dependencies }))) fail('Continuation dependency topology differs from its quoted source.');
    for (const dependency of dependencies) if (!supplied.has(dependency.taskId)) fail(`Complete continuation DAG must include dependency ${dependency.taskId}.`);
    if (!grant) {
      if (original.state !== 'passed') fail('Historical continuation inputs must come from passed tasks.');
      requireOriginalTask(item.task, original);
      if (!sameValue(item.expectedArtifacts, original.artifacts)) fail('Historical dependency output versions changed.');
      continue;
    }
    const bindings: { from: ArtifactReference; to: ArtifactReference }[] = [];
    for (const dependency of original.dependsOn) {
      const previous = recorded.get(dependency.taskId) ?? fail('Original dependency source is missing.');
      const target = supplied.get(effective(dependency.taskId))!;
      if (!target.expectedArtifacts?.length || target.task.outputs.length !== previous.outputs.length) fail('Dependency output binding is incomplete.');
      for (const [index, output] of previous.outputs.entries()) {
        const refs = original.inputs.filter(ref => ref.location === output.destination), nextOutput = target.task.outputs[index];
        const next = target.expectedArtifacts!.filter(ref => ref.location === nextOutput.destination);
        if (refs.length !== 1 || next.length !== 1 || next[0].artifactId !== refs[0].artifactId || nextOutput.type !== output.type || nextOutput.schema !== output.schema) fail('Dependency inputs require an unambiguous fixed output binding.');
        if (target.task.taskId === previous.taskId ? !sameValue(next[0], refs[0]) : next[0].version === refs[0].version || next[0].location === refs[0].location) fail('Changed dependency requires an explicit new fixed version.');
        bindings.push({ from: refs[0], to: next[0] });
      }
    }
    const rebind = (refs: ArtifactReference[]) => refs.map(ref => {
      const matches = bindings.filter(binding => binding.from.artifactId === ref.artifactId);
      if (!matches.length) return ref;
      if (matches.length !== 1 || !sameValue(ref, matches[0].from)) fail('Original dependency input version is ambiguous.');
      return matches[0].to;
    });
    if (!sameValue(item.task.inputs, rebind(original.inputs))) fail('Continuation fixed inputs differ from the quoted source dependency bindings.');
    for (const ref of rebind(original.context.interfaces)) {
      if (!item.task.context.interfaces.some(actual => sameValue(actual, ref))) fail('Continuation lost a fixed source interface.');
    }
    for (const ref of item.task.context.interfaces) {
      const binding = bindings.find(binding => binding.to.artifactId === ref.artifactId);
      if (binding && !sameValue(binding.to, ref)) fail('Continuation interface uses a stale dependency version.');
    }
  }
}
