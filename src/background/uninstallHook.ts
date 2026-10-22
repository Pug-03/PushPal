// "vscode:uninstall" hook: VS Code runs this with Node after the extension is
// removed (on the next restart). Remove the background task right away; the
// worker also removes itself if it notices the extension is gone.
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, rmSync } from 'node:fs';
import { uninstallAgent } from './agent';

function extensionId(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { publisher: string; name: string };
    return `${pkg.publisher}.${pkg.name}`.toLowerCase();
  } catch {
    return 'pushpal.pushpal';
  }
}

function storageCandidates(): string[] {
  const products = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor'];
  const base =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
        : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return products.map((p) => join(base, p, 'User', 'globalStorage', extensionId()));
}

async function main(): Promise<void> {
  for (const dir of storageCandidates()) {
    await uninstallAgent({ platform: process.platform, home: homedir(), storageDir: dir });
    for (const f of ['worker.js', 'config.json']) rmSync(join(dir, f), { force: true });
  }
}

void main();
