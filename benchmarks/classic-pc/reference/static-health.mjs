import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedSha256 = 'c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d';
const sourceCommit = 'c4692036c5e11d227c8fb7c593b734dac96da028';
const sourceBase = `https://github.com/Patoke/re-plants-vs-zombies/blob/${sourceCommit}`;
const samples = [
  ['region-prologue', 0x557c90, '558bec83e4f88b450c83ec1c5356ba2100000057'],
  ['esi-zero', 0x557cb1, '33f6'],
  ['shield-register-store', 0x557e99, '89b3dc000000'],
  ['helmet-register-store', 0x557e9f, '89b3d0000000'],
  ['default-body-store', 0x557f50, 'c783c80000000e010000'],
  ['definition-call', 0x557f6a, 'e851fcffff'],
  ['definition-index-and-address', 0x557bc5, '8d04cd000000002bc1390c85d89676008d0485d8967600'],
  ['type-2-compare', 0x557fa5, '83f902753b'],
  ['type-2-helmet-store', 0x557fd6, 'c783d000000072010000'],
  ['type-6-compare', 0x558025, '83f9067526'],
  ['type-6-shield-store', 0x558036, 'c783dc0000004c040000'],
  ['max-field-loads', 0x559a4a, '8b83d00000008b93c80000008b8bdc000000'],
  ['max-helmet-store', 0x559a5c, '8983d4000000'],
  ['max-body-store', 0x559a68, '8993cc000000'],
  ['max-shield-store', 0x559a74, '898be0000000'],
  ['region-return', 0x559b0b, '5f5e5b8be55dc21400'],
  ['region-assertion-end', 0x559b2d, 'ff15fca27000cc'],
];

try {
  if (process.argv.length !== 3) throw new Error('Usage: node static-health.mjs <explicit-reference-exe-path>');
  const exePath = resolve(process.argv[2]);
  const bytes = readFileSync(exePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha256) throw new Error('Unknown reference build: SHA-256 does not match.');

  function requireRange(offset, size) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length) {
      throw new Error('Reference file range is outside the EXE.');
    }
  }
  function u16(offset) {
    requireRange(offset, 2);
    return bytes.readUInt16LE(offset);
  }
  function u32(offset) {
    requireRange(offset, 4);
    return bytes.readUInt32LE(offset);
  }
  function requireValue(actual, expected, label) {
    if (actual !== expected) throw new Error(`Unexpected reference ${label}.`);
  }
  const hex = (value) => `0x${value.toString(16)}`;

  requireValue(u16(0), 0x5a4d, 'DOS signature');
  const peOffset = u32(0x3c);
  requireValue(u32(peOffset), 0x4550, 'PE signature');
  const machine = u16(peOffset + 4);
  const sectionCount = u16(peOffset + 6);
  const optionalHeaderSize = u16(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  requireRange(optionalHeaderOffset, optionalHeaderSize);
  const magic = u16(optionalHeaderOffset);
  const imageBase = u32(optionalHeaderOffset + 28);
  requireValue(machine, 0x14c, 'x86 machine');
  requireValue(magic, 0x10b, 'PE32 magic');
  requireValue(imageBase, 0x400000, 'image base');
  requireValue(sectionCount, 4, 'section count');

  const sections = [];
  const sectionHeadersOffset = optionalHeaderOffset + optionalHeaderSize;
  requireRange(sectionHeadersOffset, sectionCount * 40);
  for (let i = 0; i < sectionCount; i++) {
    const offset = sectionHeadersOffset + i * 40;
    const section = {
      name: bytes.toString('ascii', offset, offset + 8).replace(/\0.*$/, ''),
      virtualSize: u32(offset + 8),
      rva: u32(offset + 12),
      rawSize: u32(offset + 16),
      rawOffset: u32(offset + 20),
    };
    requireRange(section.rawOffset, section.rawSize);
    sections.push(section);
  }
  const text = sections.find((section) => section.name === '.text');
  if (!text) throw new Error('Missing reference .text section.');
  requireValue(text.rva, 0x1000, '.text RVA');
  requireValue(text.rawOffset, 0x400, '.text file offset');
  requireValue(text.rawSize, 0x308600, '.text raw size');
  function fileOffset(va, size) {
    const relative = va - imageBase - text.rva;
    if (relative < 0 || relative + size > Math.min(text.virtualSize, text.rawSize)) {
      throw new Error('Instruction sample is outside file-backed .text.');
    }
    const offset = text.rawOffset + relative;
    requireRange(offset, size);
    return offset;
  }
  fileOffset(0x557c90, 0x559b34 - 0x557c90);
  const observations = samples.map(([id, va, expected]) => {
    const offset = fileOffset(va, expected.length / 2);
    const actual = bytes.subarray(offset, offset + expected.length / 2).toString('hex');
    requireValue(actual, expected, `instruction bytes for ${id}`);
    return { id, preferredVa: hex(va), fileOffset: hex(offset), bytesHex: actual };
  });
  const observed = (id) => observations.find((sample) => sample.id === id);
  const call = observed('definition-call');
  const callOffset = Number(call.fileOffset);
  const callTarget = Number(call.preferredVa) + 5 + bytes.readInt32LE(callOffset + 1);
  requireValue(callTarget, 0x557bc0, 'definition call target');
  const tableAddress = u32(Number(observed('definition-index-and-address').fileOffset) + 12);
  requireValue(tableAddress, 0x7696d8, 'definition table address');
  const immediateStores = ['default-body-store', 'type-2-helmet-store', 'type-6-shield-store'].map((id) => {
    const offset = Number(observed(id).fileOffset);
    return { sampleId: id, baseRegister: 'ebx', destinationOffset: hex(u32(offset + 2)), immediate: u32(offset + 6) };
  });

  const result = {
    format: 'cosmos-static-zombie-health-v1',
    evidenceKind: 'source_correlated_static_instructions',
    reference: {
      exePath,
      sha256,
      bytes: bytes.length,
      recordedVersionMetadata: {
        fileVersion: '1.2.0.1073',
        productVersion: 'GOTY',
        source: 'reference.json#/installation; previously inspected metadata bound by the exact SHA-256, not decoded by this collector',
      },
      runtimeObserved: false,
    },
    pe: {
      fileOffset: hex(peOffset), machine: hex(machine), magic: hex(magic), imageBase: hex(imageBase),
      text: { virtualSize: hex(text.virtualSize), rva: hex(text.rva), rawSize: hex(text.rawSize), rawOffset: hex(text.rawOffset) },
    },
    region: {
      section: '.text', startPreferredVa: '0x557c90', endExclusivePreferredVa: '0x559b34',
      startFileOffset: hex(fileOffset(0x557c90, 1)), endExclusiveFileOffset: hex(fileOffset(0x559b33, 1) + 1),
    },
    observations,
    immediateStores,
    definitionLink: { callSampleId: call.id, targetPreferredVa: hex(callTarget), tablePreferredVa: hex(tableAddress) },
    sourceInference: {
      repository: 'Patoke/re-plants-vs-zombies', commit: sourceCommit,
      layout: `${sourceBase}/Lawn/Zombie.h#L132`,
      initialization: `${sourceBase}/Lawn/Zombie.cpp#L87`,
      definitionLookup: `${sourceBase}/Lawn/Zombie.cpp#L71`,
      maxCopies: `${sourceBase}/Lawn/Zombie.cpp#L877`,
      inferredMethod: 'Zombie::ZombieInitialize',
      memberNames: [
        { offset: '0xc8', name: 'mBodyHealth' }, { offset: '0xcc', name: 'mBodyMaxHealth' },
        { offset: '0xd0', name: 'mHelmHealth' }, { offset: '0xd4', name: 'mHelmMaxHealth' },
        { offset: '0xdc', name: 'mShieldHealth' }, { offset: '0xe0', name: 'mShieldMaxHealth' },
      ],
      types: [{ id: 2, sourceName: 'ZOMBIE_TRAFFIC_CONE' }, { id: 6, sourceName: 'ZOMBIE_DOOR' }],
      registerStores: 'The prior disassembly and source correlation identify esi-zero followed by +0xdc/+0xd0 stores as initial shield/helmet zeroing.',
      maxCopyInterpretation: 'The checked load/store samples correspond to +0xd0 -> +0xd4, +0xc8 -> +0xcc, +0xdc -> +0xe0.',
      note: 'Method, member and type names are source inferences. Prior objdump research establishes the region and branches; this collector checks fixed byte samples, without disassembly, a uniqueness search, network comparison or runtime execution.',
    },
    notEstablished: [
      'final effective HP, combined durability or death threshold',
      'all later type and mode overrides or scaling',
      'damage, speed, targeting or interactions',
      'classic edition equivalence, runtime acceptance or benchmark freeze',
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
