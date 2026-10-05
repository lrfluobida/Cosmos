import { createServer } from 'node:http';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

async function file(root, name) {
  if (!name || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part))) throw new Error('Invalid static path.');
  const path = resolve(root, name), part = relative(root, path);
  if (isAbsolute(part) || part === '..' || part.startsWith(`..${sep}`)) throw new Error('Static path escapes dist.');
  for (let current = path; ; current = dirname(current)) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || current === path && (!stat.isFile() || stat.nlink !== 1)) throw new Error('Static files must be independent regular files.');
    if (current === root) break;
  }
  return readFile(path);
}

/** This same Node-only server is shipped in every future game package. */
export async function startStaticServer({ root = dirname(fileURLToPath(import.meta.url)), port = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  const dist = resolve(root, 'dist');
  await file(dist, 'index.html');
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405); response.end(); return; }
      const name = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).slice(1) || 'index.html';
      const bytes = await file(dist, name);
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8'
        : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.wav') ? 'audio/wav'
          : name.endsWith('.png') ? 'image/png' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404, { 'Cache-Control': 'no-store' }); response.end('Not found'); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); done(undefined); }); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing static server address.');
  let closing;
  const close = () => closing ??= new Promise((done, reject) => {
    server.closeAllConnections(); server.close(error => error ? reject(error) : done(undefined));
  });
  return { url: `http://127.0.0.1:${address.port}`, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) throw new Error('Usage: node standalone-launcher.mjs [--port 4173]');
    const server = await startStaticServer({ port: args.length ? Number(args[1]) : 0 });
    console.log(server.url);
    const stop = () => { void server.close().catch(error => { console.error(error.message); process.exitCode = 1; }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
