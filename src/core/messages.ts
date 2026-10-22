// Notification text, shared by the extension and the background worker.
import { basename } from 'node:path';
import { translate, relativeTime, type Lang } from '../i18n';
import type { Commit } from '../git/repo';

export interface IncomingSummary {
  title: string;
  body: string;
  /** Extra warning line when teammates touched files we are editing. */
  sameFile?: string;
}

export function uniqueAuthors(commits: Commit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of commits) {
    const key = c.email.toLowerCase() || c.author;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.author);
  }
  return out;
}

export function listFiles(files: string[], max = 3): string {
  const names = files.slice(0, max).map((f) => basename(f));
  return files.length > max ? `${names.join(', ')} +${files.length - max}` : names.join(', ');
}

export function summarizeIncoming(
  lang: Lang,
  root: string,
  incoming: Commit[],
  behind: number,
  overlap: string[],
  now = Date.now(),
): IncomingSummary {
  const authors = uniqueAuthors(incoming);
  const first = authors[0] ?? '?';
  const title = authors.length > 1 ? translate(lang, 'notify.whoMany', first, authors.length - 1) : translate(lang, 'notify.whoOne', first);
  const latest = incoming[0];
  const subject = latest ? truncate(latest.subject, 70) : '';
  const when = latest ? relativeTime(lang, latest.time, now) : '';
  const body = translate(lang, 'notify.body', behind, basename(root), subject, when);
  const sameFile = overlap.length ? translate(lang, 'notify.sameFile', first, listFiles(overlap)) : undefined;
  return { title, body, sameFile };
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
