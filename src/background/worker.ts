// PushPal background worker — one self-contained Node script, started every
// minute by launchd / Task Scheduler with VS Code's own Electron binary
// (ELECTRON_RUN_AS_NODE=1), so users don't need Node installed.
//
//   worker.js <storageDir>                 check watched repos, notify, exit
//   worker.js --alert <payload.json>       (macOS/Linux) show one alert and wait for the click
//
// It only ever runs `git fetch` + read-only git commands. It never pulls.
import { spawn, execFile } from 'node:child_process';
import { existsSync, readdirSync, rmSync, writeFileSync, appendFileSync, statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { SharedStore, readJson, repoGroupId, type WorkerConfig } from '../core/storage';
import { checkRepo } from '../git/repo';
import { setDefaultGitPath } from '../git/exec';
import { summarizeIncoming } from '../core/messages';
import { translate } from '../i18n';
import { DesktopNotifier, type DesktopNote } from '../notify/desktop';
import { uninstallAgent, realRunner, type Runner } from './agent';

const LOCK_STALE_MS = 5 * 60_000;
const LOG_MAX_BYTES = 256 * 1024;

/** Tests set this to capture notifications / launchctl calls instead of running them. */
const TEST_LOG = process.env.PUSHPAL_TEST_LOG;

function testRecord(entry: unknown): void {
  if (TEST_LOG) appendFileSync(TEST_LOG, JSON.stringify(entry) + '\n');
}

const runner: Runner = TEST_LOG
  ? async (file, args) => {
      testRecord({ type: 'exec', file, args });
      return { code: 0, stdout: '', stderr: '' };
    }
  : realRunner;

function log(storageDir: string, line: string): void {
  const file = join(storageDir, 'worker.log');
  try {
    if (existsSync(file) && statSync(file).size > LOG_MAX_BYTES) rmSync(file, { force: true });
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* logging must never break the worker */
  }
}

/** Is the extension still installed? (Uninstalled extensions are listed in `.obsolete` until VS Code deletes them.) */
export function extensionStillInstalled(cfg: WorkerConfig): boolean {
  let names: string[];
  try {
    names = readdirSync(cfg.extensionsDir);
  } catch {
    return false;
  }
  const obsolete = readJson<Record<string, boolean>>(join(cfg.extensionsDir, '.obsolete'), {});
  return names.some((n) => (n === cfg.extensionDirPrefix || n.startsWith(cfg.extensionDirPrefix)) && !obsolete[n]);
}

function takeLock(storageDir: string): boolean {
  const lock = join(storageDir, 'worker.lock');
  try {
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs < LOCK_STALE_MS) return false;
    writeFileSync(lock, String(process.pid));
    return true;
  } catch {
    return false;
  }
}

function openUri(uri: string): void {
  if (TEST_LOG) return testRecord({ type: 'open', uri });
  if (process.platform === 'darwin') execFile('open', [uri], () => undefined);
  else if (process.platform === 'linux') execFile('xdg-open', [uri], () => undefined);
}

function vscodeUri(cfg: WorkerConfig, action: 'open' | 'pull', root: string): string {
  return `${cfg.uriScheme}://${cfg.extensionId}/${action}?repo=${encodeURIComponent(root)}`;
}

async function selfDestruct(storageDir: string): Promise<void> {
  log(storageDir, 'extension is gone: removing background task');
  testRecord({ type: 'selfDestruct' });
  await uninstallAgent({ platform: process.platform, home: homedir(), storageDir }, runner);
  for (const f of ['worker.js', 'config.json', 'worker.lock']) rmSync(join(storageDir, f), { force: true });
}

async function notify(storageDir: string, cfg: WorkerConfig, root: string, note: DesktopNote): Promise<void> {
  if (TEST_LOG) return testRecord({ type: 'notify', root, title: note.title, message: note.message, subtitle: note.subtitle });
  if (process.platform === 'win32') {
    // Toast buttons are vscode:// links, so nothing has to wait for the click.
    await new DesktopNotifier({ windowsAppId: cfg.windowsAppId, iconPath: cfg.iconPath }).show(note);
    return;
  }
  // macOS/Linux: the notifier blocks until clicked; hand it to a detached
  // child so this run can exit and launchd keeps its 60 s rhythm.
  const payload = join(storageDir, `alert-${note.group}.json`);
  writeFileSync(payload, JSON.stringify({ note, cfg, root }));
  const child = spawn(process.execPath, [__filename, '--alert', payload], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  child.unref();
}

async function runAlert(payloadFile: string): Promise<void> {
  const { note, cfg } = JSON.parse(readFileSync(payloadFile, 'utf8')) as { note: DesktopNote; cfg: WorkerConfig; root: string };
  rmSync(payloadFile, { force: true });
  const notifier = new DesktopNotifier({ alerterPath: cfg.alerterPath, iconPath: cfg.iconPath, macBundleId: cfg.macBundleId });
  const outcome = await notifier.show(note);
  if ((outcome === 'primary' || outcome === 'content') && note.primaryUri) openUri(note.primaryUri);
}

export async function runOnce(storageDir: string): Promise<void> {
  const store = new SharedStore(storageDir);
  const cfg = store.readConfig();
  if (!cfg) return;
  if (!extensionStillInstalled(cfg)) return selfDestruct(storageDir);
  if (!cfg.enabled) return;
  if (!takeLock(storageDir)) return;
  try {
    if (cfg.gitPath && existsSync(cfg.gitPath)) setDefaultGitPath(cfg.gitPath);
    for (const root of cfg.repos) {
      if (!existsSync(join(root, '.git'))) continue;
      // VS Code has this repo open: the extension already watches and alerts.
      if (store.isRepoOpen(root)) {
        testRecord({ type: 'skipOpen', root });
        continue;
      }
      const snap = await checkRepo(root, { fetch: true });
      if (snap.error) log(storageDir, `${root}: ${snap.error.code} ${snap.error.message.split('\n')[0]}`);
      if (snap.state !== 'behind' || !snap.upstreamSha) continue;
      if (!store.claimNotification(root, snap.upstreamSha)) continue;
      const s = summarizeIncoming(cfg.lang, root, snap.incoming, snap.behind, snap.overlap);
      log(storageDir, `${root}: ${snap.behind} new commit(s), notifying`);
      await notify(storageDir, cfg, root, {
        group: repoGroupId(root),
        title: s.title,
        subtitle: s.sameFile ? s.body : undefined,
        message: s.sameFile ?? s.body,
        primaryLabel: translate(cfg.lang, 'btn.open'),
        laterLabel: translate(cfg.lang, 'btn.later'),
        primaryUri: vscodeUri(cfg, 'open', root),
        contentUri: vscodeUri(cfg, 'open', root),
      });
    }
  } finally {
    rmSync(join(storageDir, 'worker.lock'), { force: true });
  }
}

async function main(): Promise<void> {
  const [, , first, second] = process.argv;
  if (first === '--alert' && second) return runAlert(second);
  const storageDir = first || dirname(__filename);
  try {
    await runOnce(storageDir);
  } catch (e) {
    log(storageDir, `fatal: ${e instanceof Error ? e.stack : e}`);
  }
}

if (require.main === module) void main();
