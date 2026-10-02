import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ValidationHostInput } from '../../probes/e2e/validation-run.ts';
import type { ValidationHostIO } from '../../probes/e2e/validation-host.ts';
import type { PiSessionOptions } from '../../src/providers/pi.ts';
import type { RoleSession } from '../../src/roles/factory.ts';
import { renderCharacter } from '../../src/media/vector.ts';
import { synthesizeWav } from '../../src/media/audio.ts';
import { requestReservation } from '../../probes/e2e/admission.ts';
import { writeJson } from '../../probes/e2e/host.ts';
import type { MediaMetadata } from '../../src/artifacts/types.ts';

/** Scripted geometry/constant source only. generatedByCosmos:false; no playable target game, API, browser or compiler. */
export function offlineNativeFixture(input: ValidationHostInput) {
  const media = {
    characters: ['producer', 'shooter', 'defender', 'normal', 'armored'].map(id => ({ id, width: 64, height: 64, anchor: { x: 32, y: 64 },
      layers: [{ id: 'body', shape: 'ellipse', x: 16, y: 16, width: 32, height: 32, fill: '#22aacc', stroke: '#112233', strokeWidth: 1 }],
      states: ['idle', 'attack', 'death'].map(name => ({ name, fps: 4, loop: name !== 'death', frames: [{ body: { opacity: 1 } }, { body: { opacity: 0.7, dx: 2 } }] })) })),
    audio: ['bgm', 'place', 'shoot', 'hit', 'victory', 'defeat'].map(id => ({ id, sampleRate: 22050, duration: 0.1, loop: id === 'bgm', notes: [{ midi: 60, start: 0, duration: 0.08, gain: 0.1, wave: 'sine', attack: 0.01, release: 0.01 }] })),
  };
  const calls: { taskId: string; role: string; cap: number }[] = [];
  const sessionFactory = async (config: PiSessionOptions): Promise<RoleSession> => {
    const packet = JSON.parse(config.context); let reviews = 0;
    return { close: async () => {}, prompt: async (_text, supplied = {}) => {
      const request = { requestId: randomUUID(), modelId: 'deepseek-flash' as const, maxOutputTokens: config.maxOutputTokens, inputBytes: 100, hasImages: !!supplied.images?.length };
      await config.budget.beforeRequest({ ...request, estimatedMaxCostMicroCny: requestReservation(request) }); calls.push({ taskId: packet.taskId, role: packet.role, cap: config.maxOutputTokens });
      await config.budget.afterResponse({ requestId: request.requestId, outcome: 'settled', responseModel: 'deepseek-flash', elapsedMs: 1,
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      if (packet.role === 'cosmos') return { text: JSON.stringify({ tasks: ['design', 'art', 'coding'].map(role => ({ taskId: `${input.window.caseId}-${role}`, role, objective: 'Offline non-playable native interface fixture',
        acceptanceIds: role === 'design' ? ['PILOT-DESIGN'] : role === 'art' ? ['PILOT-MEDIA'] : input.window.quote.requirements.acceptanceIds,
        dependsOn: role === 'art' ? [`${input.window.caseId}-design`] : role === 'coding' ? [`${input.window.caseId}-design`, `${input.window.caseId}-art`] : [] })) }) };
      if (packet.role === 'reviewer') return { text: JSON.stringify({ verdict: 'approved', inputVersions: packet.inputs, evidenceIds: packet.evidence.filter((evidence: any) => evidence.kind === 'test_report').map((evidence: any) => evidence.evidenceId),
        findings: packet.taskId.endsWith('-design') && ++reviews === 1 ? ['Invalid positive fixture finding'] : [] }) };
      const write = config.tools.find(tool => tool.name === 'write')!;
      const put = (path: string, content: string) => write.execute(randomUUID(), { path, content }, supplied.signal, undefined, undefined as never);
      if (packet.role === 'design') await put('authors/design/design.json', JSON.stringify({ summary: 'Offline non-playable fixture', implementationNotes: ['No game implementation'], acceptanceMapping: Object.fromEntries(input.window.quote.requirements.acceptanceIds.map(id => [id, 'Fixed fixture only'])) }));
      else if (packet.role === 'art') await put('authors/art/mediaSpec.json', JSON.stringify(media));
      else {
        const repair = packet.taskId.endsWith('-repair');
        if (repair) {
          const feedback = packet.interfaces.find((ref: any) => ref.artifactId.startsWith('repair-feedback-'));
          assert.ok(feedback); assert.equal(JSON.parse(await readFile(join(config.workspace, feedback.location), 'utf8')).sourceTaskId, `${input.window.caseId}-coding`);
          assert.ok(config.workspace.endsWith('repair-workspace'));
        }
        await put('authors/coding/src/main.ts', `export const fixture = ${repair ? 2 : 1}; // generatedByCosmos:false\n`);
        await put('authors/coding/index.html', '<!doctype html><meta charset="utf-8"><p>Offline non-playable fixture</p>');
      }
      return { text: JSON.stringify({ summary: 'Offline fixture only', remaining: [], uncertainty: [] }) };
    } };
  };
  const io: ValidationHostIO = {
    bootstrap: async () => { const path = join(input.root, 'toolchain'); await cp(join(input.repository, 'templates/2d'), path, { recursive: true }); return path; },
    async media(folder, value) {
      const spec = value as typeof media, base = join(input.root, folder), metadata: MediaMetadata = { characters: [], audio: [] };
      for (const character of spec.characters) {
        const output = renderCharacter(character), path = `public/assets/${character.id}`; await mkdir(join(base, path), { recursive: true });
        for (const file of output.files) await writeFile(join(base, path, file.name), file.svg, 'utf8');
        await writeJson(base, `${path}/manifest.json`, output.manifest); metadata.characters.push({ directory: path, manifest: output.manifest });
      }
      for (const clip of spec.audio) {
        const output = synthesizeWav(clip), path = 'public/assets/audio'; await mkdir(join(base, path), { recursive: true });
        await writeFile(join(base, path, output.manifest.file), output.bytes); metadata.audio.push({ directory: path, manifest: output.manifest });
      }
      await writeJson(base, 'public/assets/manifest.json', metadata); await writeJson(base, '_cosmos/mediaSpec.json', value);
      const screenshot = `${folder}/contact-sheet.png`;
      await writeFile(join(input.root, screenshot), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXcAAAAASUVORK5CYII=', 'base64'));
      return { media: metadata, screenshot };
    },
    async build(project) {
      await mkdir(join(project, 'dist')); await writeFile(join(project, 'dist/index.html'), 'Offline build fixture, generatedByCosmos:false', 'utf8');
      return { passed: true, work: project, results: [{ code: 0, stdout: 'Offline typecheck', stderr: '' }, { code: 0, stdout: 'Offline build', stderr: '' }] };
    },
    async play(plan, _signal, taskId) {
      assert.equal(plan.taskId, taskId, 'Offline adapter retains the production task authority check');
      const failed = plan.artifact.version === 'v1', reportPath = `${plan.taskId}/offline-browser.json`, at = new Date().toISOString();
      const row = plan.steps.find(step => (step.kind === 'assert' || step.kind === 'wait-for') && step.acceptanceId === 'PILOT-START')!;
      assert.ok(row, 'Offline fixture must select an actual fixed browser assertion');
      const report = { formatVersion: '1.0.0' as const, kind: 'normal_browser_input' as const, plan, startedAt: at, endedAt: at, outcome: failed ? 'failed' as const : 'passed' as const,
        browser: { name: 'chromium' as const, channel: 'offline-fixture', version: 'fixture', headless: true, viewport: plan.viewport }, timeoutMs: 1000,
        cleanup: { browserPid: null, forced: false, processExited: true }, errors: [], files: [reportPath], reportPath,
        steps: plan.steps.map(step => ({ id: step.id, kind: step.kind, ...('acceptanceId' in step ? { acceptanceId: step.acceptanceId } : {}), outcome: failed && step.id === row.id ? 'failed' as const : 'passed' as const,
          expected: 'expected' in step ? step.expected : 'input delivered', actual: failed && step.id === row.id ? 'offline wrong observation' : 'expected' in step ? step.expected : 'input delivered', error: null, screenshot: null })), evidence: [] };
      await writeJson(join(input.root, 'browser-evidence'), reportPath, report); return report;
    },
  };
  return { io, sessionFactory, calls };
}
