import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { bounded } from './deadline.ts';

/** ESRCH is positive exit evidence; permission/other errors are not absence. */
export function browserProcessAbsent(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'; }
}

/** Only receives the dedicated child owned by this run's BrowserServer or persistent driver. */
export async function stopBrowserProcess(child: ChildProcess, timeoutMs: number): Promise<void> {
  const running = () => child.exitCode === null && child.signalCode === null;
  if (!running()) return;
  if (!child.pid) throw new Error('Owned browser has no process ID');
  let closed: () => void = () => {};
  const exited = new Promise<void>(resolve => { closed = resolve; child.once('close', closed); });
  try {
    await bounded(async () => {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve, reject) => {
          // Playwright's kill() uses an unbounded spawnSync here and also awaits temporary-directory removal.
          execFile('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: timeoutMs }, error => {
            if (error && running()) reject(error); else resolve();
          });
        });
      } else {
        // Playwright launches a separate process group on POSIX.
        try { process.kill(-child.pid!, 'SIGKILL'); } catch (error) { if (running()) throw error; }
      }
      await exited;
    }, timeoutMs, 'Owned browser process termination');
  } finally { child.off('close', closed); }
}
