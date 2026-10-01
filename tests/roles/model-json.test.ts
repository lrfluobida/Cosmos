import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeModelJson } from '../../src/roles/protocol.ts';

const object = { summary: '设计已完成', remaining: [], uncertainty: [] };
const raw = JSON.stringify(object);
const fence = `\`\`\`json\n${raw}\n\`\`\``;

for (const text of [raw, `  ${raw}\n`, fence, `Design is complete.\n${fence}\nHost capture follows.`, `说明\r\n${fence.replaceAll('\n', '\r\n')}\r\n后续检查`, `Completed 2 files.\n${fence}\n"Host capture" follows.`]) {
  test(`accept one complete model JSON object: ${text.slice(0, 24)}`, () => assert.deepEqual(decodeModelJson(text), object));
}

for (const [name, text] of [
  ['two fences', `${fence}\n${fence}`], ['trailing JSON', `${fence}\n${raw}`], ['leading JSON', `${raw}\n${fence}`],
  ['extra code', `${fence}\n\`\`\`js\nrun()\n\`\`\``], ['tilde code', `${fence}\n~~~js\nrun()\n~~~`],
  ['missing fence end', fence.slice(0, -3)], ['truncated object', '\`\`\`json\n{"summary":\n\`\`\`'],
  ['unlabelled fence', `\`\`\`\n${raw}\n\`\`\``], ['javascript fence', `\`\`\`javascript\n${raw}\n\`\`\``],
  ['unfenced prose', `Done. ${raw}`], ['array', '[]'], ['null', 'null'], ['string', '"done"'],
  ['fenced array', '\`\`\`json\n[]\n\`\`\`'], ['two raw objects', `${raw}\n${raw}`],
  ['second JSON null', `${fence}\nnull`], ['second JSON boolean', `true\n${fence}`],
  ['second JSON string', `${fence}\n"other answer"`], ['second JSON number', `Notes follow.\n123\n${fence}`],
]) test(`reject ambiguous or invalid model JSON: ${name}`, () => assert.throws(() => decodeModelJson(text)));

for (const payload of ['null true', '"first" "second"', '1 2', 'false\t-1.25e+2',
  ['first with spaces', 'second with spaces'].map(value => JSON.stringify(value)).join(' '),
  ['escaped "quote" and \\ path', 'tab\tand line\nbreak'].map(value => JSON.stringify(value)).join(' '),
  '"\\u4e2d with spaces" "\\\"escaped\\\""',
]) for (const text of [`${payload}\n${fence}`, `${fence}\n${payload}`]) {
  test(`reject multiple JSON scalars outside the fence: ${JSON.stringify(text)}`, () => assert.throws(() => decodeModelJson(text)));
}
