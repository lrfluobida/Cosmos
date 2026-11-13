import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { TestContext } from 'node:test';
import { runCli } from '../../src/cli/index.ts';
import type { ApprovedArt } from '../../src/runtime/approved-art-source.ts';
import type { ApprovedDesign } from '../../src/runtime/approved-design-source.ts';
import { selectCodeDraft } from '../../src/runtime/code-draft-source.ts';
import type { ConfirmedRequirementsSource } from '../../src/runtime/confirmed-requirements-source.ts';
import { silentOutput } from '../runtime/confirmed-requirements.fixture.ts';
import { ordinaryHostFixture } from '../runtime/ordinary-design.fixture.ts';

/** Produce a captured and packaged candidate whose browser verification fails after the host build. */
export async function failedCodeCapture(t: TestContext, options: Parameters<typeof ordinaryHostFixture>[1], common: string[],
  design: ApprovedDesign, art: ApprovedArt, requirements: ConfirmedRequirementsSource, legacyRoot: string, target: { root: string }) {
  const main = 'authors/coding/src/main.ts', content = '// Partial entry\n';
  const previous = await ordinaryHostFixture(t, { ...options, fault: 'candidate', sessionFactory: async (config, session) => ({ ...session, prompt: async () => {
    const write = config.tools!.find(tool => tool.name === 'write')!;
    await write.execute('entry', { path: main, content }, undefined, undefined, undefined as never);
    return { text: JSON.stringify({ summary: 'Added the entry file', remaining: [], uncertainty: [] }) };
  } }) });
  const report: any = await runCli(['new', previous.root, ...common, '--approved-design-from', design.reference.location,
    '--approved-art-from', art.reference.location, '--code-draft-from', legacyRoot], {
    host: previous.host, input: Readable.from([]), output: silentOutput(),
  });
  assert.equal(report.outcome, 'incomplete');
  const candidate = 'registry/candidates/game/v1/', source = 'registry/captures/game-source/v1/';
  const project = join(previous.root, candidate, 'project');
  assert.ok(previous.plays.length);
  for (const name of ['dist/index.html', 'Play.cmd', '_cosmos/delivery.json']) assert.ok((await readFile(join(project, name))).length);
  const select = () => selectCodeDraft(previous.root, design, art, requirements, target);
  await writeFile(join(previous.root, main), '// Mutable author workspace\n');
  const { reference, files } = await select();
  assert.equal(files.get(main)?.toString(), content);
  assert.deepEqual([...files.keys()].sort(), ['authors/coding/index.html', 'authors/coding/src/helper.ts', main]);
  const taskId = design.selection.tasks.find(item => item.role === 'coding')!.task.taskId;
  for (const [file, change] of [
    [source + 'capture.json', (doc: any) => { doc.metadata.provenance.sourceRefs[0] += '-other-attempt'; }],
    [source + 'capture.json', (doc: any) => { doc.files.pop(); }],
    [candidate + 'candidate.json', (doc: any) => { doc.files.find((file: any) => file.destination === 'src/main.ts').artifactRef.version = 'v2'; }],
    [candidate + 'candidate.json', (doc: any) => { doc.files.push({ ...doc.files[0], destination: 'dist/index.html' }); }],
    [`journal/task-${taskId}/capture.json`, (doc: any) => { doc.attemptId += '-other'; }],
    ['snapshot.json', (doc: any) => { doc.tasks.find((task: any) => task.taskId === taskId).artifacts = []; }],
  ] as const) {
    const path = join(previous.root, file), bytes = await readFile(path), doc = JSON.parse(bytes.toString());
    change(doc);
    await writeFile(path, JSON.stringify(doc));
    await assert.rejects(select, /changed|receipt identity|differs/);
    await writeFile(path, bytes);
  }
  for (const path of [source + 'files/src/main.ts', candidate + 'project/src/main.ts']) {
    await writeFile(join(previous.root, path), '// Changed fixed file\n');
    await assert.rejects(select, /differs|changed/);
    await writeFile(join(previous.root, path), content);
  }
  const template = join(project, 'vite.config.ts');
  await rename(template, template + '.moved');
  await assert.rejects(select);
  await rename(template + '.moved', template);
  return { reference, main: { path: main, content }, snapshot: await readFile(join(previous.root, 'snapshot.json')) };
}
