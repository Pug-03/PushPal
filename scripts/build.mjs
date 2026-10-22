// Bundles the extension, the background worker and the uninstall hook with esbuild.
// `--tests` bundles test/*.test.ts into out-test/ for `node --test`.
import * as esbuild from 'esbuild';
import { readdirSync, existsSync } from 'node:fs';
import { generateL10nBundle } from './l10n.mjs';

const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const watch = args.has('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: production ? false : 'linked',
  minify: production,
  logLevel: 'info',
};

generateL10nBundle();

if (args.has('--tests')) {
  const entries = readdirSync('test').filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`);
  await esbuild.build({ ...common, entryPoints: entries, outdir: 'out-test', external: ['vscode'], logLevel: 'warning' });
  // Tests spawn the real worker bundle.
  if (existsSync('src/background/worker.ts'))
  await esbuild.build({ ...common, entryPoints: ['src/background/worker.ts'], outfile: 'out-test/worker.cjs', logLevel: 'warning' });
} else {
  const builds = [
    { ...common, entryPoints: ['src/ext/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] },
    { ...common, entryPoints: ['src/background/worker.ts'], outfile: 'dist/worker.js' },
    { ...common, entryPoints: ['src/background/uninstallHook.ts'], outfile: 'dist/uninstall.js' },
  ];
  if (watch) {
    for (const b of builds) await (await esbuild.context(b)).watch();
  } else {
    await Promise.all(builds.map((b) => esbuild.build(b)));
  }
}
