import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { authorBudgetFixture } from './author-output-budget.fixture.ts';

test('COS231 actual factory selects only current evidence inventory and preserves ownership/budget', async t => {
  const f = await authorBudgetFixture(t);
  await mkdir(join(f.root, 'evidence')); await writeFile(join(f.root, 'evidence/report.json'), '{}', 'utf8');
  await mkdir(join(f.root, 'artifacts/game/v1'), { recursive: true });
  await writeFile(join(f.root, 'artifacts/game/v1/untrusted.json'), '{}', 'utf8');
  const before = await f.controller.read();
  await f.create({ ordinaryCodingReviewImageQuote: () => true }, { ...f.input, role: 'reviewer' });
  const config = f.configs[0], tool = config.tools!.find(t => t.name === 'read')!, packet = JSON.parse(config.context!);
  assert.ok('evidenceDetails' in tool.parameters.properties);
  assert.deepEqual(packet.reviewEvidenceFiles, ['evidence/report.json']);
  assert.deepEqual(packet.evidence, f.input.task.evidence);
  assert.deepEqual(packet.ownership.writePaths, []);
  assert.deepEqual(await f.controller.read(), before);
  assert.equal(config.maxOutputTokens, 8192);
  await assert.rejects(tool.execute('no-extra', { path: 'artifacts/game/v1/untrusted.json', evidenceOffset: 1 } as never, undefined, undefined, undefined as never), /selected path/);
});

test('COS231 unselected reviewers, authors and planning retain original read schema', async t => {
  const f = await authorBudgetFixture(t);
  for (const [role, purpose, selected] of [['reviewer', undefined, false], ['design', undefined, true], ['coding', undefined, true],
    ['art', undefined, true], ['cosmos', 'planning', true], ['reviewer', 'planning', true]] as const) {
    await f.create({ ordinaryCodingReviewImageQuote: () => selected }, { ...f.input, role, purpose });
    const config = f.configs.at(-1)!, tool = config.tools!.find(t => t.name === 'read')!;
    assert.equal('evidenceDetails' in tool.parameters.properties, false);
    assert.equal('reviewEvidenceFiles' in JSON.parse(config.context!), false);
  }
});
