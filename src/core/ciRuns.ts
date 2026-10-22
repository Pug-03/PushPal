// Which GitHub repository a remote points at. No `vscode` import.

/** "owner/repo" for github.com remotes (https, ssh and scp-like URLs), else null. */
export function githubSlug(remoteUrl: string): string | null {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(remoteUrl.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
