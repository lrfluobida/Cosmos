import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { resolve, parse } from 'node:path';
import test from 'node:test';

export function bootFixture(paths: string[], bootAt = new Date(Date.now() - 1000).toISOString()) {
  return { formatVersion: 1, machineId: '11111111-2222-3333-4444-555555555555', machineName: 'TEMP-HOST',
    observedAt: new Date().toISOString(), lastBootUpTime: bootAt,
    kernelBoot: { provider: 'Microsoft-Windows-Kernel-Boot', eventId: 27, version: 1, recordId: '201', machine: 'TEMP-HOST', timeCreated: bootAt, bootType: 0 },
    kernelGeneral: { provider: 'Microsoft-Windows-Kernel-General', eventId: 12, version: 0, recordId: '200', machine: 'TEMP-HOST', timeCreated: bootAt, bootMode: 0, startTime: bootAt },
    paths: paths.map(path => ({ path, canonicalPath: resolve(path), drive: parse(resolve(path)).root, driveType: 3,
      volumeSerial: 'A1B2C3D4', fileSystem: 'NTFS', reparseFree: true })) };
}

test('fixed Windows collector accepts complete raw boot events and hides device identifiers', async t => {
  const api = await import('../../../src/runtime/recovery/windows-boot.ts').catch(() => null);
  assert.equal(typeof api?.collectWindowsBoot, 'function', 'The fixed Windows boot collector is required');
  const paths = [resolve('.')], raw = bootFixture(paths);
  t.mock.method(childProcess, 'execFileSync', (file: string, args: string[], options: any) => {
    assert.match(file, /powershell\.exe$/i); assert.ok(args.includes('-NoProfile')); assert.ok(args.includes('-NonInteractive'));
    assert.equal(options.windowsHide, true); assert.ok(options.timeout > 0 && options.timeout <= 30_000);
    assert.deepEqual(JSON.parse(options.input), { paths }); assert.ok(!args.join(' ').includes(paths[0]));
    return Buffer.from(JSON.stringify(raw));
  });
  const result = await api!.collectWindowsBoot(paths);
  assert.equal(Date.parse(result.bootAt), Date.parse(raw.lastBootUpTime)); assert.match(result.machineHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes(raw.machineId)); assert.ok(!JSON.stringify(result).includes(raw.paths[0].volumeSerial));
});

test('collector rejects incomplete, resume, fast-startup, unknown schemas and non-local paths', async t => {
  const api = await import('../../../src/runtime/recovery/windows-boot.ts').catch(() => null);
  assert.equal(typeof api?.collectWindowsBoot, 'function', 'The fixed Windows boot collector is required');
  const paths = [resolve('.')]; let raw: any;
  t.mock.method(childProcess, 'execFileSync', () => Buffer.from(JSON.stringify(raw)));
  const mutations = [
    (r: any) => { delete r.kernelBoot; }, (r: any) => { r.kernelBoot.bootType = 1; },
    (r: any) => { r.kernelBoot.bootType = 2; }, (r: any) => { r.kernelBoot.version = 2; },
    (r: any) => { r.kernelGeneral.bootMode = 1; }, (r: any) => { r.kernelGeneral.startTime = '2020-01-01T00:00:00.000Z'; },
    (r: any) => { r.kernelGeneral.machine = 'OTHER'; }, (r: any) => { r.extra = true; },
    (r: any) => { r.paths[0].driveType = 4; }, (r: any) => { r.paths[0].reparseFree = false; },
    (r: any) => { r.paths[0].canonicalPath += '-alias'; }, (r: any) => { r.paths[0].volumeSerial = ''; },
    (r: any) => { r.lastBootUpTime = '2026-01-01 00:00:00'; }, (r: any) => { r.kernelBoot.recordId = 201; },
  ];
  for (const change of mutations) { raw = bootFixture(paths); change(raw); await assert.rejects(api!.collectWindowsBoot(paths)); }
});

test('collector rejects impossible calendar dates and placeholder machine IDs', async t => {
  const { collectWindowsBoot } = await import('../../../src/runtime/recovery/windows-boot.ts');
  const paths = [resolve('.')]; let raw: any;
  t.mock.method(childProcess, 'execFileSync', () => Buffer.from(JSON.stringify(raw)));
  raw = bootFixture(paths, '2026-02-30T00:00:00.000Z');
  await assert.rejects(collectWindowsBoot(paths), /UTC|time|calendar/i);
  raw = bootFixture(paths); raw.machineId = 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF';
  await assert.rejects(collectWindowsBoot(paths), /identity/i);
});
