// Files shared between the extension (every open VS Code window) and the
// background worker. All of them live in the extension's globalStorage folder.
//
//   config.json          what the worker needs: language, watched repos, URIs…
//   notified.json        { [repoKey]: upstreamSha } — last commit we alerted about
//   heartbeats/<id>.json one per VS Code window: { ts, repos } written every 30 s
//   worker.js            copy of the bundled worker (survives extension updates)
//   worker-state.json    { lastCheckAt } — when the worker last ran a check
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Lang } from '../i18n';
import type { FrequencyConfig } from './frequency';

export const HEARTBEAT_INTERVAL_MS = 30_000;
/** A window counts as "open" if it wrote a heartbeat within this window. */
export const HEARTBEAT_MAX_AGE_MS = 95_000;

export interface WorkerConfig {
  version: 1;
  lang: Lang;
  repos: string[];
  /** e.g. "pushpal.pushpal" — used to build vscode:// links. */
  extensionId: string;
  /** "vscode", "vscode-insiders", "cursor"… */
  uriScheme: string;
  /** Folder that holds installed extensions, to detect an uninstall. */
  extensionsDir: string;
  /** Folder-name prefix of this extension inside extensionsDir. */
  extensionDirPrefix: string;
  gitPath?: string;
  alerterPath?: string;
  iconPath?: string;
  /** Windows AppUserModelID of VS Code, so toasts show the VS Code icon. */
  windowsAppId?: string;
  /** macOS bundle id of VS Code (alerter --sender). */
  macBundleId?: string;
  enabled: boolean;
  /** Background interval, battery rules and active hours. Missing in configs written by 1.0.0 (= every run). */
  frequency?: FrequencyConfig;
}

export function repoKey(root: string): string {
  const p = resolve(root);
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/** Stable id for one repo, used as notification group / toast tag. */
export function repoGroupId(root: string): string {
  return 'pushpal-' + createHash('sha1').update(repoKey(root)).digest('hex').slice(0, 12);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Write via temp file + rename so a reader never sees half a file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  // The folder can disappear under a running VS Code (storage reset, manual clean-up).
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

export class SharedStore {
  constructor(readonly dir: string) {
    mkdirSync(join(dir, 'heartbeats'), { recursive: true });
  }

  get configFile() {
    return join(this.dir, 'config.json');
  }
  get notifiedFile() {
    return join(this.dir, 'notified.json');
  }
  get workerFile() {
    return join(this.dir, 'worker.js');
  }
  get stateFile() {
    return join(this.dir, 'worker-state.json');
  }
  get heartbeatDir() {
    return join(this.dir, 'heartbeats');
  }

  readConfig(): WorkerConfig | null {
    return readJson<WorkerConfig | null>(this.configFile, null);
  }

  writeConfig(cfg: WorkerConfig): void {
    writeJsonAtomic(this.configFile, cfg);
  }

  /** Remember a repo the user opened in VS Code (the worker only watches these). */
  addRepos(roots: string[], base: Omit<WorkerConfig, 'repos'>): WorkerConfig {
    const existing = this.readConfig();
    const set = new Map<string, string>();
    for (const r of existing?.repos ?? []) set.set(repoKey(r), r);
    for (const r of roots) set.set(repoKey(r), r);
    const cfg: WorkerConfig = { ...base, repos: [...set.values()] };
    this.writeConfig(cfg);
    return cfg;
  }

  lastNotified(root: string): string | undefined {
    return readJson<Record<string, string>>(this.notifiedFile, {})[repoKey(root)];
  }

  /**
   * Atomically claim the right to notify about `sha` for `root`.
   * Returns false if someone (another window or the worker) already did.
   */
  claimNotification(root: string, sha: string): boolean {
    const all = readJson<Record<string, string>>(this.notifiedFile, {});
    const key = repoKey(root);
    if (all[key] === sha) return false;
    all[key] = sha;
    writeJsonAtomic(this.notifiedFile, all);
    return true;
  }

  writeHeartbeat(windowId: string, repos: string[], now = Date.now()): void {
    writeJsonAtomic(join(this.heartbeatDir, `${safeName(windowId)}.json`), { ts: now, pid: process.pid, repos: repos.map(repoKey) });
  }

  removeHeartbeat(windowId: string): void {
    rmSync(join(this.heartbeatDir, `${safeName(windowId)}.json`), { force: true });
  }

  /** Is this repo open in any VS Code window right now? */
  isRepoOpen(root: string, now = Date.now()): boolean {
    const key = repoKey(root);
    let names: string[] = [];
    try {
      names = readdirSync(this.heartbeatDir);
    } catch {
      return false;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = join(this.heartbeatDir, name);
      const hb = readJson<{ ts: number; repos: string[] } | null>(file, null);
      if (!hb) continue;
      if (now - hb.ts > HEARTBEAT_MAX_AGE_MS) {
        // Stale (window crashed); tidy up old files.
        try {
          if (now - statSync(file).mtimeMs > 24 * 3600_000) rmSync(file, { force: true });
        } catch {
          /* ignore */
        }
        continue;
      }
      if (hb.repos.includes(key)) return true;
    }
    return false;
  }
}

function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}
