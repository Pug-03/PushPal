// GitHub Actions results for one commit, through the REST API
// (GET /repos/{owner}/{repo}/actions/runs?head_sha=…). No `vscode` import.

export interface RunInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

export type CiState = 'none' | 'running' | 'success' | 'failure';

export interface CiSummary {
  state: CiState;
  total: number;
  done: number;
  failed: RunInfo[];
  /** Link to open: the first failed run, else the first run. */
  url?: string;
}

/** "owner/repo" for github.com remotes (https, ssh and scp-like URLs), else null. */
export function githubSlug(remoteUrl: string): string | null {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(remoteUrl.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

const RUNNING = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const FAILED = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);

export function summarize(runs: RunInfo[]): CiSummary {
  if (runs.length === 0) return { state: 'none', total: 0, done: 0, failed: [] };
  const done = runs.filter((r) => !RUNNING.has(r.status)).length;
  const failed = runs.filter((r) => r.conclusion && FAILED.has(r.conclusion));
  const state: CiState = done < runs.length ? 'running' : failed.length ? 'failure' : 'success';
  return { state, total: runs.length, done, failed, url: (failed[0] ?? runs[0]).url };
}

export type FetchResult =
  | { kind: 'ok'; runs: RunInfo[]; etag?: string }
  | { kind: 'notModified' }
  | { kind: 'rateLimited'; resetAt?: number }
  | { kind: 'error'; status: number };

export async function fetchRuns(slug: string, sha: string, opts: { token?: string; etag?: string; fetchImpl?: typeof fetch } = {}): Promise<FetchResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PushPal-VSCode',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.etag) headers['If-None-Match'] = opts.etag;
  const url = `https://api.github.com/repos/${slug}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=30&exclude_pull_requests=true`;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch {
    return { kind: 'error', status: 0 };
  }
  if (res.status === 304) return { kind: 'notModified' };
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    return { kind: 'rateLimited', resetAt: Number.isFinite(reset) ? reset * 1000 : undefined };
  }
  if (!res.ok) return { kind: 'error', status: res.status };
  const body = (await res.json()) as { workflow_runs?: Array<{ id: number; name: string; status: string; conclusion: string | null; html_url: string }> };
  const runs = (body.workflow_runs ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url }));
  return { kind: 'ok', runs, etag: res.headers.get('etag') ?? undefined };
}
