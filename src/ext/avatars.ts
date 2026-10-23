import * as vscode from 'vscode';
import { avatarFromEmail, fetchCommitAvatars } from '../core/avatars';
import { githubSlug } from '../core/ciRuns';
import { upstreamRemoteUrl } from '../git/repo';
import { repoKey } from '../core/storage';
import type { RepoEntry } from './repoManager';

const CACHE_KEY = 'pushpug.avatars';

/**
 * Remembers each author's GitHub profile picture. Asks GitHub once per new
 * upstream commit (not per check), and keeps the answers across restarts.
 */
export class Avatars implements vscode.Disposable {
  private readonly cache: Record<string, string>;
  private readonly asked = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly token: () => Promise<string | undefined>,
    private readonly log: vscode.OutputChannel,
  ) {
    this.cache = context.globalState.get<Record<string, string>>(CACHE_KEY, {});
  }

  get enabled(): boolean {
    return vscode.workspace.getConfiguration('pushpug').get<boolean>('avatars', true);
  }

  urlFor(email: string): string | undefined {
    if (!this.enabled || !email) return undefined;
    const e = email.toLowerCase();
    return this.cache[e] ?? avatarFromEmail(e);
  }

  /** After a check: if the upstream moved, look up avatars for its recent authors. */
  async refresh(entry: RepoEntry): Promise<void> {
    const sha = entry.snapshot?.upstreamSha;
    if (!this.enabled || !sha) return;
    const key = repoKey(entry.root);
    if (this.asked.get(key) === sha) return;
    this.asked.set(key, sha);
    // Nothing to look up when every author is already known (or has a noreply address).
    const missing = entry.recent.some((c) => !this.cache[c.email.toLowerCase()] && !avatarFromEmail(c.email));
    if (!missing) return;
    const url = await upstreamRemoteUrl(entry.root);
    const slug = url ? githubSlug(url) : null;
    if (!slug) return;
    const found = await fetchCommitAvatars(slug, sha, { token: await this.token() });
    let changed = false;
    for (const [email, avatar] of found) {
      if (this.cache[email] !== avatar) {
        this.cache[email] = avatar;
        changed = true;
      }
    }
    if (!changed) return;
    this.log.appendLine(`[avatars] ${entry.name}: ${found.size} author(s)`);
    await this.context.globalState.update(CACHE_KEY, this.cache);
    this.emitter.fire();
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
