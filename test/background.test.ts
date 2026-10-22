import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTeam, write, commitAndPush, type Team } from './helpers';
import { git } from '../src/git/exec';
import { installAgent, uninstallAgent, isAgentInstalled, isBackgroundSupported, plistPath, windowsTaskName, type AgentPaths, type Runner } from '../src/background/agent';
import { SharedStore, type WorkerConfig } from '../src/core/storage';

function fakeRunner() {
  const calls: Array<{ file: string; args: string[] }> = [];
  const run: Runner = async (file, args) => {
    calls.push({ file, args });
    return { code: 0, stdout: '', stderr: '' };
  };
  return { calls, run };
}

describe('background job registration', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pushpal-agent-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const paths = (platform: NodeJS.Platform): AgentPaths => ({
    platform,
    home: join(dir, 'home'),
    storageDir: join(dir, 'storage dir'),
    nodeExe: '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
    workerFile: join(dir, 'storage dir', 'worker.js'),
  });

  test('macOS: writes a LaunchAgent that runs every 60 s with VS Code’s Node, then removes it', async () => {
    const p = paths('darwin');
    const { calls, run } = fakeRunner();
    await installAgent(p, run);
    const plist = readFileSync(plistPath(p.home), 'utf8');
    assert.match(plist, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/);
    assert.match(plist, /<key>ELECTRON_RUN_AS_NODE<\/key>\s*<string>1<\/string>/);
    assert.match(plist, /<string>\/Applications\/Visual Studio Code\.app\/Contents\/MacOS\/Code<\/string>/);
    assert.match(plist, /<key>AbandonProcessGroup<\/key>\s*<true\/>/);
    assert.ok(calls.some((c) => c.file === 'launchctl' && c.args[0] === 'bootstrap'));
    assert.equal(isAgentInstalled(p), true);

    calls.length = 0;
    await uninstallAgent(p, run);
    assert.equal(existsSync(plistPath(p.home)), false);
    assert.ok(calls.some((c) => c.file === 'launchctl' && c.args[0] === 'bootout'));
    assert.equal(isAgentInstalled(p), false);
  });

  test('Windows: creates a hidden every-minute task through a wscript launcher, then deletes it', async () => {
    const p = { ...paths('win32'), nodeExe: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe' };
    const { calls, run } = fakeRunner();
    await installAgent(p, run);
    const vbs = readFileSync(join(p.storageDir, 'launcher.vbs'), 'utf8');
    assert.match(vbs, /ELECTRON_RUN_AS_NODE"\) = "1"/);
    assert.match(vbs, /, 0, False/); // 0 = hidden window
    const xmlBuf = readFileSync(join(p.storageDir, 'task.xml'));
    assert.deepEqual([...xmlBuf.subarray(0, 2)], [0xff, 0xfe]);
    const xml = xmlBuf.subarray(2).toString('utf16le');
    assert.match(xml, /<Interval>PT1M<\/Interval>/);
    assert.match(xml, /<Hidden>true<\/Hidden>/);
    assert.match(xml, /<DisallowStartIfOnBatteries>false/);
    const create = calls.find((c) => c.file === 'schtasks.exe');
    assert.deepEqual(create?.args.slice(0, 4), ['/Create', '/F', '/TN', windowsTaskName()]);
    assert.equal(isAgentInstalled(p), true);

    calls.length = 0;
    await uninstallAgent(p, run);
    assert.deepEqual(calls[0].args, ['/Delete', '/F', '/TN', windowsTaskName()]);
    assert.equal(isAgentInstalled(p), false);
  });
});

describe('background worker', () => {
  let t: Team;
  let storage: string;
  let extensionsDir: string;
  let home: string;
  let logFile: string;
  const workerBundle = join(__dirname, 'worker.cjs');

  beforeEach(async () => {
    t = await makeTeam();
    storage = join(t.dir, 'globalStorage');
    extensionsDir = join(t.dir, 'extensions');
    home = join(t.dir, 'home');
    logFile = join(t.dir, 'worker-test.log');
    mkdirSync(join(extensionsDir, 'pushpal.pushpal-1.0.0'), { recursive: true });
    mkdirSync(home, { recursive: true });
    const store = new SharedStore(storage);
    const cfg: WorkerConfig = {
      version: 1,
      lang: 'th',
      repos: [t.bob],
      extensionId: 'pushpal.pushpal',
      uriScheme: 'vscode',
      extensionsDir,
      extensionDirPrefix: 'pushpal.pushpal-',
      enabled: true,
    };
    store.writeConfig(cfg);
    writeFileSync(store.workerFile, '// copy');
  });
  afterEach(() => t.cleanup());

  function runWorker() {
    execFileSync(process.execPath, [workerBundle, storage], {
      env: { ...process.env, PUSHPAL_TEST_LOG: logFile, HOME: home, USERPROFILE: home },
      timeout: 60_000,
    });
  }
  function events(type?: string): any[] {
    if (!existsSync(logFile)) return [];
    const all = readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return type ? all.filter((e) => e.type === type) : all;
  }

  test('notifies once per new commit, in the chosen language, and never pulls', async () => {
    runWorker();
    assert.equal(events('notify').length, 0, 'nothing new yet');

    write(t.alice, 'x.txt', 'x');
    await commitAndPush(t.alice, 'เพิ่มหน้า login');
    const bobHead = (await git(t.bob, ['rev-parse', 'HEAD'])).trim();
    runWorker();
    const n = events('notify');
    assert.equal(n.length, 1);
    assert.equal(n[0].title, 'Alice Lee push โค้ดใหม่มาแล้ว');
    assert.match(n[0].message, /เพิ่มหน้า login/);
    assert.equal((await git(t.bob, ['rev-parse', 'HEAD'])).trim(), bobHead, 'worker must not pull');

    runWorker();
    runWorker();
    assert.equal(events('notify').length, 1, 'no repeat for the same commit');

    write(t.alice, 'y.txt', 'y');
    await commitAndPush(t.alice, 'Second push');
    runWorker();
    assert.equal(events('notify').length, 2, 'a newer commit is announced again');
  });

  test('stays quiet while VS Code has the repo open (fresh heartbeat)', async () => {
    new SharedStore(storage).writeHeartbeat('window-1', [t.bob]);
    write(t.alice, 'x.txt', 'x');
    await commitAndPush(t.alice, 'While open');
    runWorker();
    assert.equal(events('notify').length, 0);
    assert.equal(events('skipOpen').length, 1);
    assert.equal((await git(t.bob, ['rev-parse', '--verify', '-q', 'origin/main'])).trim(), (await git(t.bob, ['rev-parse', 'HEAD'])).trim(), 'did not even fetch');

    // Heartbeat goes stale (VS Code closed / crashed) → notify.
    new SharedStore(storage).writeHeartbeat('window-1', [t.bob], Date.now() - 5 * 60_000);
    runWorker();
    assert.equal(events('notify').length, 1);
  });

  test('does nothing when disabled', async () => {
    const store = new SharedStore(storage);
    store.writeConfig({ ...store.readConfig()!, enabled: false });
    write(t.alice, 'x.txt', 'x');
    await commitAndPush(t.alice, 'x');
    runWorker();
    assert.equal(events('notify').length, 0);
  });

  test('removes itself when the extension was uninstalled', async () => {
    rmSync(join(extensionsDir, 'pushpal.pushpal-1.0.0'), { recursive: true });
    runWorker();
    assert.equal(events('selfDestruct').length, 1);
    if (isBackgroundSupported(process.platform)) {
      assert.ok(events('exec').some((e) => e.file === 'launchctl' || e.file === 'schtasks.exe'));
    }
    assert.equal(existsSync(join(storage, 'worker.js')), false);
    assert.equal(existsSync(join(storage, 'config.json')), false);
  });

  test('treats an extension marked obsolete (pending uninstall) as removed', async () => {
    writeFileSync(join(extensionsDir, '.obsolete'), JSON.stringify({ 'pushpal.pushpal-1.0.0': true }));
    runWorker();
    assert.equal(events('selfDestruct').length, 1);
  });
});
