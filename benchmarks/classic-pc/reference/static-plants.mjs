import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedSha256 = 'c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d';
const tableOffset = 0x36b000;
const stride = 0x24;
const rowCount = 53;
const sourceCommit = 'c4692036c5e11d227c8fb7c593b734dac96da028';
const sourceBase = `https://github.com/Patoke/re-plants-vs-zombies/blob/${sourceCommit}`;

try {
  if (process.argv.length !== 3) {
    throw new Error('Usage: node static-plants.mjs <explicit-reference-exe-path>');
  }
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
  const data = sections.find((section) => section.name === '.data');
  const rdata = sections.find((section) => section.name === '.rdata');
  if (!data || !rdata) throw new Error('Missing reference data sections.');
  requireValue(data.rva, 0x364000, '.data RVA');
  requireValue(data.rawOffset, 0x362a00, '.data file offset');
  requireValue(data.rawSize, 0xf800, '.data raw size');
  requireValue(rdata.rva, 0x30a000, '.rdata RVA');
  requireValue(rdata.rawOffset, 0x308a00, '.rdata file offset');
  requireValue(rdata.virtualSize, 0x59f2c, '.rdata virtual size');
  requireRange(tableOffset, rowCount * stride);
  if (tableOffset < data.rawOffset || tableOffset + rowCount * stride > data.rawOffset + data.rawSize) {
    throw new Error('Plant definition table is outside .data.');
  }

  const rows = [];
  for (let seed = 0; seed < rowCount; seed++) {
    const offset = tableOffset + seed * stride;
    const words = Array.from({ length: 9 }, (_, word) => u32(offset + word * 4));
    requireValue(words[0], seed, 'consecutive seed ordinal');
    requireValue(words[1], 0, 'zero word at +0x04');
    const nameRva = words[8] - imageBase;
    if (nameRva < rdata.rva || nameRva >= rdata.rva + Math.min(rdata.virtualSize, rdata.rawSize)) {
      throw new Error('Name pointer is outside file-backed .rdata.');
    }
    rows.push({ fileOffset: hex(offset), words });
  }

  const tableRva = data.rva + tableOffset - data.rawOffset;
  const result = {
    format: 'cosmos-static-plant-definitions-v1',
    evidenceKind: 'static_binary_observation',
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
      fileOffset: hex(peOffset),
      machine: hex(machine),
      magic: hex(magic),
      imageBase: hex(imageBase),
      sections: sections.map((section) => ({
        name: section.name,
        virtualSize: hex(section.virtualSize),
        rva: hex(section.rva),
        rawSize: hex(section.rawSize),
        rawOffset: hex(section.rawOffset),
      })),
    },
    table: {
      section: '.data',
      fileOffset: hex(tableOffset),
      rva: hex(tableRva),
      preferredVa: hex(imageBase + tableRva),
      strideBytes: stride,
      strideHex: hex(stride),
      rowCount,
      wordSizeBytes: 4,
      byteOrder: 'little-endian',
      rows,
    },
    sourceInference: {
      repository: 'Patoke/re-plants-vs-zombies',
      commit: sourceCommit,
      layout: `${sourceBase}/Lawn/Plant.h#L302`,
      definitions: `${sourceBase}/Lawn/Plant.cpp#L25`,
      seedEnum: `${sourceBase}/ConstEnums.h#L1042`,
      wordMeanings: [
        { offset: '0x00', name: 'mSeedType' },
        { offset: '0x04', name: 'mPlantImage' },
        { offset: '0x08', name: 'mReanimationType' },
        { offset: '0x0c', name: 'mPacketIndex' },
        { offset: '0x10', name: 'mSeedCost' },
        { offset: '0x14', name: 'mRefreshTime' },
        { offset: '0x18', name: 'mSubClass' },
        { offset: '0x1c', name: 'mLaunchRate' },
        { offset: '0x20', name: 'mPlantName' },
      ],
      note: 'Field names and roles are source inferences. The prior 318-field source comparison and its limits are recorded in docs/research/2026-10-02-static-plant-definitions.md; this collector performs no network comparison.',
    },
    notEstablished: [
      'playable plant count or complete benchmark denominator',
      'seconds, random timing or a fixed attack interval',
      'effective mode, upgrade or imitater costs and cooldowns',
      'damage, health, targeting or interactions',
      'classic edition equivalence, runtime acceptance or benchmark freeze',
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
