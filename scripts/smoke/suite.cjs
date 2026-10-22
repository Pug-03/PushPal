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
  for (const c of ['pushpal.pull', 'pushpal.checkNow', 'pushpal.setup', 'pushpal.showTeam', 'pushpal.testNotification']) assert(cmds.includes(c), c);
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

  fs.writeFileSync(process.env.PUSHPAL_SMOKE_RESULT, JSON.stringify({ ok: true, log }));
};
