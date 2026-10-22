// Smoke test in the locally installed VS Code with an isolated profile under .vscode-test/.
// Usage: npm run build && node scripts/smoke/run.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const base = join(root, '.vscode-test', 'smoke');
rmSync(base, { recursive: true, force: true });
const ws = join(base, 'team');
const userDir = join(base, 'user');
mkdirSync(join(userDir, 'User'), { recursive: true });
writeFileSync(join(userDir, 'User', 'settings.json'), JSON.stringify({ 'pushpal.notify.desktop': false, 'security.workspace.trust.enabled': false }));
mkdirSync(ws, { recursive: true });
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'gitconfig') };
writeFileSync(env.GIT_CONFIG_GLOBAL, '[user]\n\tname = Smoke\n\temail = smoke@example.com\n[init]\n\tdefaultBranch = main\n');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, env, stdio: 'ignore' });
g(ws, 'init', '-q', '--bare', 'remote.git');
g(ws, 'clone', '-q', 'remote.git', 'alice');
writeFileSync(join(ws, 'alice', 'readme.md'), '# smoke\n');
g(join(ws, 'alice'), 'add', '-A');
g(join(ws, 'alice'), 'commit', '-qm', 'init');
g(join(ws, 'alice'), 'push', '-q', '-u', 'origin', 'main');
g(ws, 'clone', '-q', 'remote.git', 'bob');

const result = join(base, 'result.json');
const app = process.env.VSCODE_APP ?? '/Applications/Visual Studio Code.app';
const electron = join(app, 'Contents', 'MacOS', 'Code');
try {
  execFileSync(electron, [
    `--extensionDevelopmentPath=${root}`,
    `--extensionTestsPath=${join(root, 'scripts', 'smoke', 'suite.cjs')}`,
    `--user-data-dir=${userDir}`,
    `--extensions-dir=${join(base, 'extensions')}`,
    '--disable-extensions',
    '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
    join(ws, 'bob'),
  ], { env: { ...env, PUSHPAL_SMOKE_RESULT: result, PUSHPAL_SMOKE_USERDIR: userDir }, stdio: 'inherit', timeout: 120_000 });
} catch (e) {
  console.error('VS Code exited with error', e.status);
}
if (!existsSync(result)) {
  console.error('SMOKE FAILED');
  process.exit(1);
}
console.log('SMOKE OK', readFileSync(result, 'utf8'));
