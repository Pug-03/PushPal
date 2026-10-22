import { execFile } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface GitOptions {
  /** Path to the git binary. Defaults to `git` on PATH. */
  gitPath?: string;
  /** Kill git after this many ms. Network calls can hang on flaky Wi-Fi. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

let defaultGitPath = 'git';

export function setDefaultGitPath(p: string | undefined): void {
  if (p) defaultGitPath = p;
}

/**
 * Runs git with an argument array (never a shell string), so file names and
 * branch names can never be interpreted as shell syntax.
 */
export function runGit(cwd: string, args: string[], opts: GitOptions = {}): Promise<GitResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    // Never block waiting for a username/password on a hidden terminal.
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    // Stable English messages so stderr can be matched reliably.
    LC_ALL: 'C',
    LANG: 'C',
  };
  return new Promise((resolve) => {
    execFile(
      opts.gitPath ?? defaultGitPath,
      args,
      { cwd, env, timeout: opts.timeoutMs ?? 30_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        let code = 0;
        if (error) {
          const e = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
          if (typeof e.code === 'number') code = e.code;
          else code = e.killed ? 124 : 127;
          if (!stderr && e.message) stderr = e.message;
        }
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Like runGit but throws on a non-zero exit code. */
export async function git(cwd: string, args: string[], opts?: GitOptions): Promise<string> {
  const r = await runGit(cwd, args, opts);
  if (r.code !== 0) throw new GitError(args, r);
  return r.stdout;
}

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly result: GitResult,
  ) {
    super(`git ${args[0]} failed (${result.code}): ${result.stderr.trim().split('\n').slice(-3).join(' ')}`);
  }
}

export function splitZ(out: string): string[] {
  return out.split('\0').filter((s) => s.length > 0);
}
