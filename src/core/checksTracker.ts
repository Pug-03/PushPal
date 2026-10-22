// Follows the checks of a few commits until they finish, then says what
// happened. Polls only while something is still pending, slows down when the
// rate limit runs low, and remembers finished results (they never change).
// No `vscode` import; the extension drives it with a timer, tests with a fake clock.
import { fetchChecks, type CheckSummary, type Requester } from './checks';

/** Runs can take a moment to appear after a push: keep asking this long when there are none yet. */
export const APPEAR_WINDOW_MS = 3 * 60_000;
/** Below this many API calls left, poll four times slower. */
export const LOW_RATE = 50;

export interface WatchMeta {
  /** Pushed by the user (their e-mail), not a teammate. */
  mine: boolean;
  author: string;
  /** Tip of the branch (alerts and the status bar care), not just a timeline row. */
  head: boolean;
  branch: string;
}

interface Entry {
  repo: string;
  slug: string;
  sha: string;
  meta: WatchMeta;
  summary?: CheckSummary;
  sawPending: boolean;
  firstSeen: number;
  nextAt: number;
  reported: boolean;
}

export type TrackerEvent =
  | { type: 'result'; repo: string; sha: string; summary: CheckSummary; meta: WatchMeta; wasPending: boolean }
  | { type: 'recovered'; repo: string; sha: string; summary: CheckSummary; meta: WatchMeta; previousSha: string }
  | { type: 'pending'; repo: string; sha: string; summary: CheckSummary; meta: WatchMeta }
  | { type: 'needsAuth' }
  | { type: 'rateLimited'; resetAt?: number };

export class ChecksTracker {
  private readonly entries = new Map<string, Entry>();
  /** Last finished result of each branch tip, per repo: { sha, state }. */
  private readonly lastHead = new Map<string, { sha: string; state: string }>();
  private blockedUntil = 0;
  private slow = false;
  private authAsked = false;

  constructor(
    private request: Requester | null,
    private readonly now: () => number = Date.now,
    private readonly pollMs: () => number = () => 20_000,
  ) {}

  /** null = not signed in: nothing is fetched. */
  setRequester(r: Requester | null): void {
    this.request = r;
    if (r) this.authAsked = false;
  }

  /** Start following a commit (no-op for non-GitHub remotes: slug null). */
  watch(repo: string, slug: string | null, sha: string, meta: WatchMeta): void {
    if (!slug) return;
    const e = this.entries.get(sha);
    if (e) {
      e.meta = { ...e.meta, ...meta, head: e.meta.head || meta.head };
      return;
    }
    this.entries.set(sha, { repo, slug, sha, meta, sawPending: false, firstSeen: this.now(), nextAt: 0, reported: false });
  }

  summary(sha: string): CheckSummary | undefined {
    return this.entries.get(sha)?.summary;
  }

  /** Forget commits no longer shown, except finished ones (cheap to keep). */
  prune(keep: Set<string>): void {
    for (const [sha, e] of this.entries) if (!keep.has(sha) && e.summary?.state !== 'success' && e.summary?.state !== 'failure') this.entries.delete(sha);
  }

  private needsFetch(e: Entry): boolean {
    if (!e.summary) return true;
    if (e.summary.state === 'pending') return true;
    return e.summary.state === 'none' && this.now() - e.firstSeen < APPEAR_WINDOW_MS;
  }

  /** Milliseconds until the next fetch is due, or null when nothing needs asking. */
  nextDelay(): number | null {
    if (!this.request) return null;
    let soonest = Infinity;
    for (const e of this.entries.values()) if (this.needsFetch(e)) soonest = Math.min(soonest, Math.max(e.nextAt, this.blockedUntil));
    return soonest === Infinity ? null : Math.max(0, soonest - this.now());
  }

  private interval(): number {
    return this.pollMs() * (this.slow ? 4 : 1);
  }

  /** Fetch what's due and report what changed. */
  async tick(): Promise<TrackerEvent[]> {
    const events: TrackerEvent[] = [];
    if (!this.request) {
      if (!this.authAsked && [...this.entries.values()].some((e) => this.needsFetch(e))) {
        this.authAsked = true;
        events.push({ type: 'needsAuth' });
      }
      return events;
    }
    const now = this.now();
    if (now < this.blockedUntil) return events;
    for (const e of [...this.entries.values()]) {
      if (!this.needsFetch(e) || e.nextAt > now) continue;
      const r = await fetchChecks(this.request, e.slug, e.sha);
      if (r.kind === 'rateLimited') {
        this.blockedUntil = r.resetAt ?? now + 15 * 60_000;
        events.push({ type: 'rateLimited', resetAt: r.resetAt });
        break;
      }
      if (r.kind === 'needsAuth') {
        this.request = null;
        events.push({ type: 'needsAuth' });
        break;
      }
      if (r.kind === 'notFound') {
        this.entries.delete(e.sha); // no access, or not on GitHub: stop quietly
        continue;
      }
      if (r.kind === 'error') {
        e.nextAt = now + this.interval() * 2;
        continue;
      }
      this.slow = r.remaining !== undefined && r.remaining < LOW_RATE;
      if (r.remaining !== undefined && r.remaining <= 1 && r.resetAt) this.blockedUntil = r.resetAt;
      const before = e.summary?.state;
      e.summary = r.summary;
      e.nextAt = now + this.interval();
      const state = r.summary.state;
      if (state === 'pending') {
        if (!e.sawPending) events.push({ type: 'pending', repo: e.repo, sha: e.sha, summary: r.summary, meta: e.meta });
        e.sawPending = true;
        continue;
      }
      if ((state === 'success' || state === 'failure') && !e.reported && before !== state) {
        e.reported = true;
        events.push({ type: 'result', repo: e.repo, sha: e.sha, summary: r.summary, meta: e.meta, wasPending: e.sawPending });
        if (e.meta.head) {
          const prev = this.lastHead.get(e.repo);
          if (prev && prev.sha !== e.sha && prev.state === 'failure' && state === 'success') {
            events.push({ type: 'recovered', repo: e.repo, sha: e.sha, summary: r.summary, meta: e.meta, previousSha: prev.sha });
          }
          this.lastHead.set(e.repo, { sha: e.sha, state });
        }
      }
    }
    return events;
  }
}
