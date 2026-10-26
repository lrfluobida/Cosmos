import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

// Only the test's owned-worker spawn wrapper supplies this local barrier address.
const { ready, readyBarrier } = JSON.parse(process.argv[2]);
const unlink = fs.unlink;
fs.unlink = async path => {
  if (typeof path === 'string' && path.startsWith(`${ready}.`) && path.endsWith('.tmp')) {
    const receipt = JSON.parse(await fs.readFile(path, 'utf8'));
    await fetch(`${readyBarrier}/linked`, { method: 'POST', body: JSON.stringify({ temporary: path, receipt }) });
    await unlink(path);
    await fetch(`${readyBarrier}/unlinked`, { method: 'POST' });
    return;
  }
  return unlink(path);
};
syncBuiltinESMExports();
