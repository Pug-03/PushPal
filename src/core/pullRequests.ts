// GitHub pull requests: find / open the pull request of a task branch and say
// where it stands (open, conflicts with main, merged, closed). No `vscode`
// import; tested against a fake GitHub.
import type { ApiResponse, Requester } from './checks';
import type { Commit } from '../git/repo';

export type PrStatus = 'open' | 'draft' | 'conflict' | 'merged' | 'closed';

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  status: PrStatus;
  /** Branch the pull request comes from / goes into. */
  head: string;
  base: string;
  /** Commit the pull request points at (what gets merged). */
  headSha: string;
  author: string;
  createdAt: number;
}

interface ApiPull {
  number: number;
  title: string;
  html_url: string;
  state: 'open' | 'closed';
  draft?: boolean;
  merged_at?: string | null;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  created_at?: string;
  user?: { login?: string };
  head: { ref: string; sha: string };
  base: { ref: string };
}

export function parsePull(json: unknown): PullRequest | null {
  const p = json as ApiPull | undefined;
  if (!p || typeof p.number !== 'number' || !p.head || !p.base) return null;
  let status: PrStatus;
  if (p.merged_at || p.merged) status = 'merged';
  else if (p.state === 'closed') status = 'closed';
  // Only the single-pull endpoint knows about conflicts ("dirty" = conflicts with the base).
  else if (p.mergeable === false || p.mergeable_state === 'dirty') status = 'conflict';
  else status = p.draft ? 'draft' : 'open';
  return {
    number: p.number,
    title: p.title,
    url: p.html_url,
    status,
    head: p.head.ref,
    base: p.base.ref,
    headSha: p.head.sha,
    author: p.user?.login ?? '',
    createdAt: p.created_at ? Date.parse(p.created_at) : 0,
  };
}

export type PrLookup =
  | { kind: 'ok'; pr: PullRequest | null }
  | { kind: 'needsAuth' }
  | { kind: 'rateLimited'; resetAt?: number }
  | { kind: 'error'; status: number; message?: string };

function failed(r: ApiResponse): Exclude<PrLookup, { kind: 'ok' }> | null {
  if ((r.status === 403 || r.status === 429) && r.remaining === 0) return { kind: 'rateLimited', resetAt: r.resetAt };
  if (r.status === 401) return { kind: 'needsAuth' };
  if (r.status === 0 || r.status >= 400) return { kind: 'error', status: r.status, message: apiMessage(r.json) };
  return null;
}

/** GitHub's own explanation of a failed request ("Validation Failed: No commits between main and x"). */
export function apiMessage(json: unknown): string | undefined {
  const j = json as { message?: string; errors?: Array<{ message?: string } | string> } | undefined;
  if (!j?.message) return undefined;
  const details = (j.errors ?? []).map((e) => (typeof e === 'string' ? e : e.message)).filter(Boolean);
  return details.length ? `${j.message}: ${details.join('; ')}` : j.message;
}

async function call(request: Requester, path: string, opts?: Parameters<Requester>[1]): Promise<ApiResponse> {
  try {
    return await request(path, opts);
  } catch {
    return { status: 0 };
  }
}

/**
 * The newest pull request from this branch (open first, else the latest merged
 * or closed one), with its conflict state when it's open.
 */
export async function findPullRequest(request: Requester, slug: string, branch: string): Promise<PrLookup> {
  const owner = slug.split('/')[0];
  const list = await call(request, `/repos/${slug}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&sort=created&direction=desc&per_page=10`);
  const bad = failed(list);
  if (bad) return bad;
  const pulls = (Array.isArray(list.json) ? list.json : []).map(parsePull).filter((p): p is PullRequest => !!p && p.head === branch);
  const pr = pulls.find((p) => p.status !== 'closed' && p.status !== 'merged') ?? pulls[0] ?? null;
  if (!pr || (pr.status !== 'open' && pr.status !== 'draft')) return { kind: 'ok', pr };
  // The list doesn't say whether it conflicts with main; the single pull does.
  const one = await call(request, `/repos/${slug}/pulls/${pr.number}`);
  if (failed(one)) return { kind: 'ok', pr };
  return { kind: 'ok', pr: parsePull(one.json) ?? pr };
}

export type CreateResult =
  | { kind: 'created'; pr: PullRequest }
  | { kind: 'exists'; pr: PullRequest }
  | { kind: 'noCommits' }
  | { kind: 'needsAuth' }
  | { kind: 'rateLimited'; resetAt?: number }
  | { kind: 'error'; status: number; message?: string };

export async function createPullRequest(
  request: Requester,
  slug: string,
  pr: { title: string; body: string; head: string; base: string },
): Promise<CreateResult> {
  const r = await call(request, `/repos/${slug}/pulls`, { method: 'POST', body: { ...pr, maintainer_can_modify: true } });
  if (r.status === 201 || r.status === 200) {
    const created = parsePull(r.json);
    if (created) return { kind: 'created', pr: created };
  }
  if (r.status === 422) {
    const msg = apiMessage(r.json) ?? '';
    if (/already exists/i.test(msg)) {
      const found = await findPullRequest(request, slug, pr.head);
      if (found.kind === 'ok' && found.pr) return { kind: 'exists', pr: found.pr };
    }
    if (/No commits between/i.test(msg)) return { kind: 'noCommits' };
  }
  const bad = failed(r);
  return bad ?? { kind: 'error', status: r.status, message: apiMessage(r.json) };
}

/** Open pull requests of the repository, newest first (for "a teammate opened a pull request"). */
export async function listOpenPullRequests(request: Requester, slug: string): Promise<PullRequest[] | null> {
  const r = await call(request, `/repos/${slug}/pulls?state=open&sort=created&direction=desc&per_page=30`);
  if (failed(r) || !Array.isArray(r.json)) return null;
  return r.json.map(parsePull).filter((p): p is PullRequest => !!p);
}

/** Login of the signed-in GitHub user. */
export async function currentLogin(request: Requester): Promise<string | null> {
  const r = await call(request, '/user');
  const login = (r.json as { login?: string } | undefined)?.login;
  return r.status === 200 && login ? login : null;
}

/** GitHub's "Open a pull request" page, for when PushPug can't create it itself. */
export function compareUrl(slug: string, base: string, branch: string): string {
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${slug}/compare/${enc(base)}...${enc(branch)}?expand=1`;
}

/** Title: the only commit's subject, else the branch name made readable. */
export function prTitle(commits: Commit[], branch: string): string {
  if (commits.length === 1) return commits[0].subject;
  const name = branch.replace(/^(task|feat|feature|fix|bugfix|chore)\//i, '').replace(/[-_]+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : commits[0]?.subject ?? branch;
}

/** Body: the commits, oldest first. */
export function prBody(commits: Commit[]): string {
  return [...commits]
    .reverse()
    .map((c) => `- ${c.subject}`)
    .join('\n');
}
