// Builds docs/demo-light.gif and docs/demo-dark.gif from the English team-view
// screenshots (teammate pushed → pulling → merged → up to date).
import { execFileSync } from 'node:child_process';
for (const theme of ['light', 'dark']) {
  const shots = ['team-behind', 'team-pulling', 'team-success', 'team-upToDate'].map((n) => `docs/screenshots/en/${n}-${theme}.png`);
  const inputs = shots.flatMap((f) => ['-loop', '1', '-t', '1.6', '-i', f]);
  const fades = '[0][1]xfade=transition=slideleft:duration=0.35:offset=1.25[a];[a][2]xfade=transition=fade:duration=0.3:offset=2.5[b];[b][3]xfade=transition=fade:duration=0.35:offset=3.8,scale=380:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fades, '-r', '15', `docs/demo-${theme}.gif`], { stdio: 'inherit' });
  console.log(`docs/demo-${theme}.gif written`);
}
