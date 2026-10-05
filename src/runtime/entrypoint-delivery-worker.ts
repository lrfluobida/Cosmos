import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { publishReceipt } from './recovery/receipt-file.ts';

// Only the source-owned host passes this fixed helper its package and control paths.
const input = JSON.parse(process.argv[2]);
const launcher = await import(pathToFileURL(join(input.project, 'standalone-launcher.mjs')).href);
const server = await launcher.startStaticServer({ root: input.project, port: 0 });
try {
  await publishReceipt(input.ready, { formatVersion: 'delivery-ready/1', candidate: input.candidate, project: input.project, url: server.url, pid: process.pid });
  while (true) {
    if (Date.now() >= input.deadlineAt) throw new Error('Clean launcher reached its cleanup deadline.');
    const stop = await readFile(input.stop, 'utf8').catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (stop !== null) {
      const value = JSON.parse(stop);
      if (value.stop !== true || !isDeepStrictEqual(value.candidate, input.candidate)) throw new Error('Clean launcher stop binding changed.');
      break;
    }
    await new Promise(done => setTimeout(done, 25));
  }
} finally { await server.close(); }
