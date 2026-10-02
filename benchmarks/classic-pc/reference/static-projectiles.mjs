import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedSha256 = 'c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d';
const tableOffset = 0x36af50;
const stride = 0x0c;
const rowCount = 14;
const sourceCommit = 'c4692036c5e11d227c8fb7c593b734dac96da028';
const sourceBase = `https://github.com/Patoke/re-plants-vs-zombies/blob/${sourceCommit}`;
const samples = [
  ['definition-type-load', 0x493c30, '8b485c'],
  ['definition-type-times-three', 0x493c33, '8d0449'],
  ['definition-type-compare', 0x493c36, '390c8550c57600'],
  ['definition-address', 0x493c3d, '8d048550c57600'],
  ['definition-success-branch', 0x493c44, '7423'],
  ['definition-return', 0x493c69, 'c3'],
  ['consumer-type-load', 0x4924c9, '8b475c'],
  ['consumer-type-times-three', 0x4924cc, '8d1c40'],
  ['consumer-type-compare', 0x4924cf, '39049d50c57600'],
  ['consumer-address', 0x4924d6, '8d1c9d50c57600'],
  ['consumer-record-read', 0x492549, '8b6b08'],
];

try {
  if (process.argv.length !== 3) throw new Error('Usage: node static-projectiles.mjs <explicit-reference-exe-path>');
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
      virtualSize: u32(offset + 8), rva: u32(offset + 12),
      rawSize: u32(offset + 16), rawOffset: u32(offset + 20),
    };
    requireRange(section.rawOffset, section.rawSize);
    sections.push(section);
  }
  const data = sections.find((section) => section.name === '.data');
  const text = sections.find((section) => section.name === '.text');
  if (!data || !text) throw new Error('Missing reference data or text section.');
  requireValue(data.rva, 0x364000, '.data RVA');
  requireValue(data.rawOffset, 0x362a00, '.data file offset');
  requireValue(data.rawSize, 0xf800, '.data raw size');
  requireValue(text.rva, 0x1000, '.text RVA');
  requireValue(text.rawOffset, 0x400, '.text file offset');
  requireValue(text.rawSize, 0x308600, '.text raw size');
  requireRange(tableOffset, rowCount * stride);
  if (tableOffset < data.rawOffset || tableOffset + rowCount * stride > data.rawOffset + Math.min(data.virtualSize, data.rawSize)) {
    throw new Error('Projectile definition table is outside file-backed .data.');
  }
  const rows = [];
  for (let type = 0; type < rowCount; type++) {
    const offset = tableOffset + type * stride;
    const words = Array.from({ length: 3 }, (_, word) => u32(offset + word * 4));
    requireValue(words[0], type, 'consecutive projectile type ordinal');
    rows.push({ fileOffset: hex(offset), words });
  }
  const tableRva = data.rva + tableOffset - data.rawOffset;
  const tableVa = imageBase + tableRva;
  const observations = samples.map(([id, va, expected]) => {
    const relative = va - imageBase - text.rva;
    const size = expected.length / 2;
    if (relative < 0 || relative + size > Math.min(text.virtualSize, text.rawSize)) {
      throw new Error('Instruction sample is outside file-backed .text.');
    }
    const offset = text.rawOffset + relative;
    requireRange(offset, size);
    const actual = bytes.subarray(offset, offset + size).toString('hex');
    requireValue(actual, expected, `instruction bytes for ${id}`);
    if (id.endsWith('compare') || id.endsWith('address')) requireValue(u32(offset + 3), tableVa, 'instruction table address');
    return { id, preferredVa: hex(va), fileOffset: hex(offset), bytesHex: actual };
  });

  const result = {
    format: 'cosmos-static-projectile-definitions-v1',
    evidenceKind: 'source_correlated_static_binary_observation',
    reference: {
      exePath, sha256, bytes: bytes.length,
      recordedVersionMetadata: {
        fileVersion: '1.2.0.1073', productVersion: 'GOTY',
        source: 'reference.json#/installation; previously inspected metadata bound by the exact SHA-256, not decoded by this collector',
      },
      runtimeObserved: false,
    },
    pe: {
      fileOffset: hex(peOffset), machine: hex(machine), magic: hex(magic), imageBase: hex(imageBase),
      sections: [data, text].map((section) => ({
        name: section.name, virtualSize: hex(section.virtualSize), rva: hex(section.rva),
        rawSize: hex(section.rawSize), rawOffset: hex(section.rawOffset),
      })),
    },
    table: {
      section: '.data', fileOffset: hex(tableOffset), rva: hex(tableRva), preferredVa: hex(tableVa),
      strideBytes: stride, strideHex: hex(stride), rowCount, wordSizeBytes: 4, byteOrder: 'little-endian', rows,
    },
    instructionObservations: observations,
    sourceInference: {
      repository: 'Patoke/re-plants-vs-zombies', commit: sourceCommit,
      layout: `${sourceBase}/Lawn/Projectile.h#L15`, typeField: `${sourceBase}/Lawn/Projectile.h#L41`,
      typeEnum: `${sourceBase}/ConstEnums.h#L781`, methodDeclaration: `${sourceBase}/Lawn/Projectile.h#L72`,
      wordMeanings: [
        { offset: '0x00', name: 'mProjectileType' },
        { offset: '0x04', name: 'mImageRow' },
        { offset: '0x08', name: 'mDamage' },
      ],
      ordinaryPea: { typeId: 0, sourceName: 'PROJECTILE_PEA', basicFieldValue: rows[0].words[2] },
      objectTypeOffset: '0x5c',
      inferredLookupMethod: 'Projectile::GetProjectileDef',
      numericCppComparisonPerformed: false,
      ordinaryPeaHitPathObserved: false,
      note: 'Prior research found two tables by contiguous IDs. The checked type indexing, table address and record +8 read bind this candidate; this collector repeats neither the search nor disassembly. Member, type and method names come from UTF-8 headers, not runtime symbols.',
    },
    encodingLimitation: {
      sourceFile: 'Lawn/Projectile.cpp', commit: sourceCommit,
      priorUtf8FailureByteOffset: 4780, priorInvalidByteHex: 'bd', decoded: false,
      note: 'Strict UTF-8 failed in prior research; reading stopped. No alternative decoder or source presentation was used. This collector reads no external source files.',
    },
    notEstablished: [
      'cpp table count or full numeric source comparison',
      'ordinary pea normal hit path or final damage',
      'armor, multipliers, freezing, splash or death thresholds',
      'speed, targeting or interactions',
      'complete content denominator, classic edition equivalence, runtime acceptance or benchmark freeze',
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
