// GitHub API through the GitHub CLI (`gh`), for the background worker: it has
// no VS Code sign-in, but can use the user's own `gh auth login`. No `vscode` import.
import { execFile } from 'node:child_process';
import type { ApiResponse, Requester } from './checks';

const GH_PATHS = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh'];

function run(file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 20_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as NodeJS.ErrnoException).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Path of a `gh` that is installed and signed in to github.com, else null. */
export async function findSignedInGh(): Promise<string | null> {
  for (const p of GH_PATHS) {
    const r = await run(p, ['auth', 'status', '--hostname', 'github.com']);
    if (r.code === 0) return p;
  }
  return null;
}

export function ghRequester(gh: string): Requester {
  return async (path): Promise<ApiResponse> => {
    const r = await run(gh, ['api', path.replace(/^\//, '')]);
    if (r.code === 0) {
      try {
        return { status: 200, json: JSON.parse(r.stdout) };
      } catch {
        return { status: 200, text: r.stdout };
      }
    }
    const m = /HTTP (\d{3})/.exec(r.stderr);
    return { status: m ? Number(m[1]) : 500 };
  };
}
