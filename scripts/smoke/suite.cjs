// Runs inside a real VS Code extension host (see scripts/smoke/run.mjs).
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

exports.run = async function () {
  const log = [];
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'pushpal');
  assert(ext, 'extension found');
  await ext.activate();
  log.push('activated');
  const cmds = await vscode.commands.getCommands(true);
  for (const c of ['pushpal.pull', 'pushpal.checkNow', 'pushpal.setup', 'pushpal.showTeam', 'pushpal.testNotification', 'pushpal.switchMode', 'pushpal.openSettings']) assert(cmds.includes(c), c);
  log.push('commands ok');

  await sleep(1500);
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
  assert(tabs.some((l) => /PushPal|ตั้งค่า/.test(l)), 'wizard opened on first run: ' + tabs.join(','));
  log.push('wizard opened');

  await vscode.commands.executeCommand('pushpal.team.focus');
  log.push('team view focused');

  const bob = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const alice = path.join(path.dirname(bob), 'alice');
  fs.writeFileSync(path.join(alice, 'from-alice.txt'), 'hello from alice');
  execFileSync('git', ['add', '-A'], { cwd: alice });
  execFileSync('git', ['commit', '-qm', 'Alice adds a file'], { cwd: alice });
  execFileSync('git', ['push', '-q'], { cwd: alice });
  fs.writeFileSync(path.join(bob, 'bob-wip.txt'), 'uncommitted work');

  await vscode.commands.executeCommand('pushpal.checkNow');
  await vscode.commands.executeCommand('pushpal.pull', bob);
  await sleep(500);
  assert(fs.existsSync(path.join(bob, 'from-alice.txt')), 'pulled file present');
  assert(fs.readFileSync(path.join(bob, 'bob-wip.txt'), 'utf8') === 'uncommitted work', 'wip kept');
  log.push('pull ok');

  const storage = path.join(process.env.PUSHPAL_SMOKE_USERDIR, 'User', 'globalStorage', ext.id.toLowerCase());
  const hb = fs.readdirSync(path.join(storage, 'heartbeats'));
  assert(hb.length > 0, 'heartbeat written');
  log.push('heartbeat ok');

  // Modes and values stay in sync both ways, out-of-range values are clamped.
  const cfg = () => vscode.workspace.getConfiguration('pushpal');
  const waitFor = async (fn, what) => {
    for (let i = 0; i < 40; i++) {
      if (fn()) return;
      await sleep(100);
    }
    throw new Error('ASSERT: ' + what);
  };
  const G = vscode.ConfigurationTarget.Global;
  await cfg().update('mode', 'fast', G);
  await waitFor(() => cfg().get('checkIntervalSeconds') === 10 && cfg().get('background.intervalSeconds') === 60, 'fast preset fills in its values');
  await cfg().update('checkIntervalSeconds', 45, G);
  await waitFor(() => cfg().get('mode') === 'custom', 'editing a value switches to custom');
  await cfg().update('checkIntervalSeconds', 5, G);
  await waitFor(() => cfg().get('checkIntervalSeconds') === 10, 'out-of-range value clamped to 10');
  await cfg().update('mode', 'batterySaver', G);
  await waitFor(() => cfg().get('checkIntervalSeconds') === 60, 'battery saver preset');
  log.push('modes ok');
  await sleep(800);
  const workerCfg = JSON.parse(fs.readFileSync(path.join(storage, 'config.json'), 'utf8'));
  assert(workerCfg.frequency && workerCfg.frequency.backgroundSeconds === 300, 'config.json has the new background interval: ' + JSON.stringify(workerCfg.frequency));
  log.push('worker config ok');

  await vscode.commands.executeCommand('pushpal.openSettings');
  await sleep(800);
  const tabs2 = vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
  assert(tabs2.some((l) => /PushPal Settings|ตั้งค่า PushPal/.test(l)), 'settings page opened: ' + tabs2.join(','));
  log.push('settings page ok');

  fs.writeFileSync(process.env.PUSHPAL_SMOKE_RESULT, JSON.stringify({ ok: true, log }));
};
