// Profile pictures for commit authors. No `vscode` import.
//   1. GitHub "noreply" addresses carry the account id or login → avatar URL without any request.
//   2. Otherwise one GitHub API call lists recent commits with each author's avatar_url.

/** Avatar URL straight from a GitHub noreply e-mail, else undefined. */
export function avatarFromEmail(email: string, size = 64): string | undefined {
  const e = email.trim().toLowerCase();
  const withId = /^(\d+)\+[^@]+@users\.noreply\.github\.com$/.exec(e);
  if (withId) return `https://avatars.githubusercontent.com/u/${withId[1]}?s=${size}`;
  const login = /^([a-z0-9-]+)@users\.noreply\.github\.com$/.exec(e);
  if (login) return `https://github.com/${login[1]}.png?size=${size}`;
  return undefined;
}

interface ApiCommit {
  commit?: { author?: { email?: string } };
  author?: { avatar_url?: string } | null;
}

/**
 * e-mail (lower case) → avatar URL for the recent commits of `ref`
 * (GET /repos/{owner}/{repo}/commits). Commits whose e-mail isn't linked to a
 * GitHub account have no avatar and are left out.
 */
export async function fetchCommitAvatars(
  slug: string,
  ref: string,
  opts: { token?: string; fetchImpl?: typeof fetch; size?: number } = {},
): Promise<Map<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'PushPug-VSCode',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const out = new Map<string, string>();
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`https://api.github.com/repos/${slug}/commits?sha=${encodeURIComponent(ref)}&per_page=50`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return out;
  }
  if (!res.ok) return out;
  const list = (await res.json()) as ApiCommit[];
  for (const c of Array.isArray(list) ? list : []) {
    const email = c.commit?.author?.email?.toLowerCase();
    const url = c.author?.avatar_url;
    if (email && url && !out.has(email)) out.set(email, url + (url.includes('?') ? '&' : '?') + `s=${opts.size ?? 64}`);
  }
  return out;
}
