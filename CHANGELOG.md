# Changelog

## Unreleased

- New mascot: Pal is a flat-style pug head whose expressions follow what's going on — asleep when you're up
  to date, sniffing while checking, startled and barking when a teammate pushes, tugging a two-colour rope
  while merging, jump-spinning on success, puzzled at conflicts, teary when GitHub Actions fail, winking when
  they pass, heart-eyed when clicked. Random idle life (blinks, ear twitches, glances, little smiles).
  Animated with GSAP; respects reduced motion
- New extension icon and Activity Bar icon (pug head)
- Check frequency modes: ⚡ Fastest (10 s), ⚖️ Balanced (30 s, new default), 🔋 Battery saver (60 s) and 🛠 Custom,
  in the setup wizard (new step) and the settings page, each with checks/hour and data/hour estimates from measured fetch sizes
- Automatic battery saving: idle, low battery (not plugged in), Low Power Mode / Battery Saver, plugged in = normal;
  the status bar tooltip explains when and why checks are slower
- Checking hours (e.g. 08:00–23:00), honoured by the background job too
- Separate background interval (60–3600 s); the background job re-reads its settings on every run
- GitHub Actions watcher: status bar progress while tests run, a message when they pass or fail
- New “PushPal Settings” page (Notifications / Frequency & battery / Language & theme / GitHub), live two-way sync with
  VS Code Settings, Restore defaults; new command “PushPal: Switch Check Mode”
- Values outside their range are pulled back in and you're told what changed
- `pushpal.checkIntervalSeconds` now allows 10–300 s (default 30). An explicit value from 1.0.0 is kept and the mode becomes Custom
- New mascot: Pal is now a round face whose brows, eyes, mouth and cheeks change with the state
- Poke Pal: it squishes, bounces and giggles, and gets dizzy if you poke too fast
- Activity bar icon matches the new face
- Releases: `npm run release` bumps the version and pushes a tag; CI publishes to the Marketplace and Open VSX
- Fix: background-worker test no longer expects launchctl/schtasks on Linux

## 1.0.0 — 2026-10-22

First release.

- Checks the remote every 60 s and whenever VS Code regains focus; one alert per new commit
- Same-file warning (uncommitted, committed-but-unpushed and new files)
- One-click “Pull in changes” (`git pull --no-rebase --autostash --no-edit`) that never loses uncommitted work
- Conflict guide: merge vs. autostash conflicts, Merge Editor, “Finish merge”, automatic autostash cleanup
- Status bar with four states; multi-repo workspaces; branches without upstream
- Desktop notifications on macOS (alerter / osascript), Windows (toast) and Linux (notify-send)
- Optional background checks while VS Code is closed (LaunchAgent / Task Scheduler), self-removing on uninstall
- Setup wizard, “My Team” view with timeline and mascot animations
- Thai and English; Light, Dark and Match-VS-Code themes
