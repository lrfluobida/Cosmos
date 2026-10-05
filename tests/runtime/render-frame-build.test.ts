import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { projectInputs, codingSignature, CODING_TEMPLATE_FILES } from '../../src/runtime/coding-check-worker.ts';
import { removeOwned } from '../../src/artifacts/paths.ts';
import { OBSERVER_SOURCE } from '../../src/runtime/entrypoint-frames.ts';

test('advisory staging uses the same optional readonly capture bytes/signature without widening author files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cos69-coding-')); t.after(() => removeOwned(tmpdir(), root));
  const source = new Map([['index.html', Buffer.from('<div></div>')], ['src/main.ts', Buffer.from('export {};')]]), template = new Map(CODING_TEMPLATE_FILES.map(name => [name, Buffer.from('{}')]));
  const ref = { artifactId: 'render-frame-observer', version: 'v1', location: 'registry/captures/render-frame-observer/v1/files' }, bytes = Buffer.from('export const captured = true;');
  for (const [name, value] of source) { await mkdir(join(root, 'authors/coding', name.split('/').slice(0, -1).join('/')), { recursive: true }); await writeFile(join(root, 'authors/coding', name), value); }
  await mkdir(join(root, 'template')); for (const [name, value] of template) await writeFile(join(root, 'template', name), value);
  await mkdir(join(root, 'media/public/assets'), { recursive: true }); await mkdir(join(root, ref.location, '_cosmos'), { recursive: true }); await writeFile(join(root, ref.location, OBSERVER_SOURCE), bytes);
  const input: any = { workspace: root, template: join(root, 'template'), media: join(root, 'media'), sourceSignature: codingSignature(source), templateSignature: codingSignature(template), mediaSignature: codingSignature(new Map()),
    observer: { directory: join(root, ref.location), ref, sha256: createHash('sha256').update(bytes).digest('hex') } };
  const staged = await projectInputs(input); assert.ok(staged.template.get(OBSERVER_SOURCE)!.equals(bytes)); assert.deepEqual([...staged.source.keys()], [...source.keys()]);
  assert.equal((await projectInputs({ ...input, observer: undefined })).template.size, 4);
  await assert.rejects(projectInputs({ ...input, observer: { ...input.observer, ref: { ...ref, location: 'different/capture' } } }), /observer|capture/i);
  await writeFile(join(root, ref.location, OBSERVER_SOURCE), 'changed'); await assert.rejects(projectInputs(input), /observer|signature/i);
});
