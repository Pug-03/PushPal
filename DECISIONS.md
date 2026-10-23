# PushPal — Design decisions

Decisions made while building PushPal on my own, with the reasoning behind each one.
Newest sections are appended at the bottom of each topic.

## 0. Name check (2026-10-22)

- **VS Code Marketplace**: searched the public gallery API for "PushPal" — **0 results**. Open VSX — **0 results**.
- **GitHub**: ~218 repositories match "pushpal", almost all are people named Pushpal / Pushpalatha.
  Two are in a similar space:
  - `Bostigger/pushpal` — scans local repos for uncommitted/unpushed changes (4 stars)
  - `amkumirab/pushpal` — "publish local projects to GitHub safely without learning Git"
  Neither is a VS Code extension, so there is no Marketplace collision, but the name is not unique on GitHub.
- **Backup names** (checked on the Marketplace: no extension uses them):
  1. **PullPal** — same friendly tone, emphasises "pull in your friends' code"
  2. **SyncNudge** — describes the nudge when the remote moves
  3. **MergeMate** — friendly, emphasises the one-click merge
- Continued with **PushPal** as instructed. The extension id is read at runtime (`context.extension.id`),
  so renaming later only touches `package.json`, the README and the icon text.

## 1. Git logic

- **All git calls go through `execFile` with argument arrays** (`src/git/exec.ts`). No shell strings anywhere,
  so file names like `งาน ใหม่.txt` or `$(rm -rf).txt` are just data.
- Every git process gets `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never` so a missing credential fails
  fast instead of hanging, plus `LC_ALL=C` so error messages are English and can be classified
  (auth / network / identity / locked). Network calls have a timeout (fetch 90 s, pull 120 s).
- `src/git/` imports nothing from `vscode`. The same code runs in the extension, in the background worker
  and in the tests.
- **Detecting the two conflict kinds** (verified by experiment with git 2.54 before writing code):
  - Conflict with *our commits*: `git pull` exits 1, `MERGE_HEAD` exists. Git also writes `MERGE_AUTOSTASH`
    and re-applies the uncommitted work by itself when the merge commit is made. PushPal therefore only
    has to help the user resolve and then run `git commit --no-edit` ("Finish merge").
  - Conflict with *uncommitted work*: `git pull` **exits 0**, no `MERGE_HEAD`, files are `UU`, and the top
    stash entry's reflog subject (`%gs`) is exactly `autostash`. That is how PushPal recognises it.
- **Auto `git stash drop`** happens only when *all* of these hold: no unmerged files, no `MERGE_HEAD`,
  the top stash subject is `autostash`, and (when PushPal saw the conflict happen) its sha equals the sha
  recorded at conflict time. If the user stashed something else on top, nothing is dropped (tested).
- **No double pull**: `pull()` checks `getConflictState()` first and returns `blocked` without running git.
- Untracked files that would be overwritten by the incoming commit are reported as their own result
  (`untrackedInTheWay`) with the file list, because that is a common beginner situation.
- `fetch` fetches only the branch's remote, with `--no-write-fetch-head` (falls back for old git).
- Incoming commits: `HEAD..@{u}`; overlap: `HEAD...@{u}` (theirs) ∩ (status + `@{u}...HEAD` + untracked).

## 2. Tests

- Node's built-in test runner (`node --test`), bundled with esbuild first. No Mocha/Jest dependency.
- Each test creates a real bare remote plus two clones (alice and bob) in a temp dir, with an isolated
  `GIT_CONFIG_GLOBAL` so the developer's own git config (templates, hooks, pull.rebase) can't leak in.

## 3. In-VS Code alerts, status bar and pull

- **One status bar item for the whole window** (not one per repo) so it never crowds the bar. Priority:
  pulling → conflict (red, `statusBarItem.errorBackground`) → behind (yellow, `warningBackground`, click = pull)
  → can't check → up to date. "No upstream" is shown as its own neutral state instead of "error",
  because for a beginner "เช็กไม่ได้" would sound like something is broken. The tooltip lists every repo.
- **Repos** come from the built-in Git extension API (covers nested repos and multi-root) plus a
  `git rev-parse --show-toplevel` of each workspace folder (works even if the Git extension is disabled).
  Git's `repository.state.onDidChange` triggers a cheap local re-check (no fetch) so the autostash cleanup
  and "all conflicts fixed" detection react within ~1 s of the user staging a file.
- **One alert per new upstream commit**: `notified.json` in globalStorage stores the last upstream sha
  alerted per repo. It's shared by every VS Code window *and* the background worker, so the same push is
  never announced twice, wherever it was first seen.
- Per-repo lock: a fetch never runs during a pull.
- **Conflicts** open the conflicted files (max 5) and the first one in VS Code's Merge Editor
  (`git.openMergeEditor`, falls back to a normal editor). A "Finish merge" action runs `git commit --no-edit`
  when every file is staged; git then restores any autostashed work by itself.
- After PushPal's own pull hits an autostash conflict, the stash sha is stored in `workspaceState`, so the
  automatic `git stash drop` survives a VS Code restart and drops exactly that entry.

## 4. Desktop notifications

- **macOS**: `alerter` when found in `/opt/homebrew/bin` or `/usr/local/bin`. Both flag styles are supported:
  alerter ≥ 26 (`--title`, `--close-label`) and the original 1.x (`-title`, `-closeLabel`), detected from
  `--help`. `--timeout 0`, `--group <repo id>` (a newer alert replaces the older one for the same repo),
  `--sender com.microsoft.VSCode` (read from VS Code's product.json) so it carries the VS Code icon.
  Fallback: `osascript display notification` with the text passed as `argv` (never spliced into AppleScript).
  Known limit of the fallback: no buttons, can't be removed later, and clicking it opens Script Editor.
- **Windows**: toast XML with `scenario="reminder"` (stays until a button is pressed) shown through
  `powershell.exe -EncodedCommand` (UTF-16 base64, no quoting problems with Thai text). Toast buttons
  can't call back into a running Node process, so they are `vscode://<id>/pull?repo=…` protocol links,
  handled by the extension's URI handler — which also brings VS Code to the front.
  The toast uses VS Code's AppUserModelID (`Microsoft.VisualStudioCode`), falling back to Windows
  PowerShell's well-known id if Windows rejects it.
- **Linux**: `notify-send`, with `--action … --wait` buttons when the installed libnotify supports them;
  closed later through `gdbus … CloseNotification`. If `notify-send` is missing, VS Code pop-ups are used.
- **Focus rule**: if the VS Code window is focused → VS Code pop-up only; otherwise → desktop only.
- **Bringing VS Code to the front** after a button click: run VS Code's own CLI (`out/cli.js`, through the
  bundled Electron with `ELECTRON_RUN_AS_NODE=1`) on this window's folder / `.code-workspace` — VS Code
  focuses the window that already has it open. Works the same on every OS.
- After any successful pull (button, status bar, terminal, Source Control) the next check sees
  `behind` drop to 0 and removes the desktop notification (`alerter --remove`, `History.Remove`, `CloseNotification`).

## 5. Background checking (VS Code closed)

- Off by default; turned on only from the wizard or the `pushpal.notify.background` setting.
- **Runtime**: VS Code's own Electron binary with `ELECTRON_RUN_AS_NODE=1` — no separate Node install.
  On macOS the extension host's `process.execPath` is a "Code Helper (Plugin)" binary, so PushPal uses
  `<App>.app/Contents/MacOS/Code` instead (verified: runs Node 24 headless, no Dock icon).
- `dist/worker.js` is a single esbuild bundle. It is **copied to globalStorage** and the OS job points at the copy,
  so an extension update (new folder) never breaks the job. Each activation re-copies it if it changed and
  re-registers the job only if the plist / launcher differs.
- **macOS**: `~/Library/LaunchAgents/com.pushpal.watcher.plist`, `StartInterval 60`, `RunAtLoad`,
  `ProcessType Background`, `LowPriorityIO`, `AbandonProcessGroup` (so the alert child process survives the
  60-second run exiting). Loaded with `launchctl bootstrap gui/<uid>` (falls back to `load -w`).
  PATH includes `/opt/homebrew/bin` so git and alerter are found.
- **Windows**: Task Scheduler task registered from an XML definition (`schtasks /Create /XML`) rather than
  `/SC MINUTE` flags, because the XML is the only way to turn off "start only on AC power" (laptops on
  battery would otherwise never get alerts) and to set `Hidden`, `IgnoreNew` and a 5-minute time limit.
  The action is `wscript.exe //B launcher.vbs`, which sets `ELECTRON_RUN_AS_NODE` and starts the worker
  with window style 0, so no console window flashes. Task name includes the Windows user name.
- **Linux**: not offered (setting shows a friendly "macOS and Windows only" message).
- The worker only runs `git fetch` and read-only commands. It never pulls.
- Repos watched: only those the extension has seen (`config.json` → `repos`), added as you open them.
- **No double alerts**: each VS Code window writes `heartbeats/<sessionId>.json` every 30 s; the worker skips
  (doesn't even fetch) a repo listed in a heartbeat younger than 95 s. Shared `notified.json` remembers the
  last alerted upstream sha.
- **Button**: "เปิดใน VS Code / Open in VS Code" opens `vscode://<id>/open?repo=…`. The URI handler opens that
  folder (or hands the action to the window that already has it through `pending.json`) and shows the
  My Team view with a fresh check — it does not pull by itself.
- **macOS click handling**: alerter blocks until clicked, so the worker starts a detached copy of itself
  (`worker.js --alert payload.json`) and exits immediately; the copy waits for the click and runs `open <uri>`.
- **Turning off** the setting removes the LaunchAgent / task immediately.
- **Uninstall**: two layers. (1) `vscode:uninstall` hook removes the job when VS Code finalises the uninstall.
  (2) Every run, the worker checks that a folder `<publisher>.pushpal-*` still exists in the extensions dir and
  isn't listed in `.obsolete`; if not, it removes the job and its own files.
- Known limit: the LaunchAgent label / task name is shared, so VS Code Stable and Insiders on the same
  machine would share one job (the last one to write config wins).
- macOS 13+ shows a "Background item added" notice the first time — expected; mentioned in the README FAQ.
- Tests use a fake command runner (`PUSHPAL_TEST_LOG`) and a temp `HOME`, so running the test suite never
  touches the real `~/Library/LaunchAgents` or Task Scheduler.

## 6. Language system

- Catalogs: `src/i18n/locales/en.json` and `th.json` (one key per message). Keys starting with `wv.` are the
  webviews' own translation file; they are sent to the page as JSON, so switching language in the wizard
  is instant (both languages are sent to the wizard up front).
- **Why not only `vscode.l10n`**: `vscode.l10n` always follows VS Code's display language, but PushPal lets
  the user pick Thai/English independently — and Microsoft ships no official Thai language pack, so for
  almost every Thai user VS Code itself is in English. So:
  - `pushpal.language = auto`: Thai if VS Code's UI language **or the OS locale** is Thai. When VS Code
    itself is Thai (community pack), messages go through `vscode.l10n.t` using `l10n/bundle.l10n.th.json`,
    which the build generates from `th.json` (it fails the build if a Thai key is missing).
  - `th` / `en`: our catalog directly.
  - Manifest strings (command titles, settings) use `package.nls.json` / `package.nls.th.json`, which can
    only follow VS Code's language. Command titles are therefore **bilingual** in the default file
    (e.g. "ตั้งค่าใหม่ · Run Setup Again") so "PushPal: ตั้งค่าใหม่" is findable in the Command Palette
    whatever language VS Code runs in.
- Thai copy is written to sound like a friend talking ("ดึงโค้ดมารวม", "ไว้ทีหลัง", "ไม่ต้องห่วง งานคุณมีสำรองไว้")
  rather than translated word-for-word. Git terms (commit, push, stash, branch) stay in English because
  that's what Thai developers actually say.
- Relative times use `Intl.RelativeTimeFormat` ("2 นาทีที่ผ่านมา" / "2 minutes ago").

## 7. Theme system and visual language

- `media/base.css` defines tokens (`--pp-bg`, `--pp-surface`, `--pp-text`, `--pp-accent`, status colours…)
  for three themes set by a class on `<html>`:
  - `theme-light`, `theme-dark`: PushPal's own palettes (warm paper / deep slate, teal accent, coral "new").
    Text colours were chosen for ≥ 4.5:1 contrast on their surfaces.
  - `theme-system`: surfaces, text, buttons and focus ring come from `--vscode-*` variables, so any VS Code
    theme (including high contrast) is followed **live** — VS Code updates those variables and the body
    class in the webview when the user switches theme, no reload or message needed. Status colours
    (new/warn/danger/success) have no VS Code equivalents, so PushPal picks its light or dark variant from
    the `vscode-light` / `vscode-dark` body class.
- Changing the setting posts a message to open webviews, which swap the class instantly.
- Fonts: system UI font for Latin, then Sukhumvit Set (macOS), Noto Sans Thai, Leelawadee UI (Windows).
  No web fonts are bundled (keeps the .vsix small; every target OS has a good Thai face).
  Line-height is raised to 1.65 for Thai because of stacked vowels and tone marks.
- Spacing scale 4/8/12/16/24/32/48, radii 8/12/18/pill.
- **Mascot "Pal"**: replaced by a pug in section 13. (Originally a round teal buddy whose antenna is a coral git
  commit node.) Parts (arms, eyes, antenna, whole body) are separate groups, animated only with CSS
  `transform` / `opacity`. Poses: idle, wave, point, cheer, worry, chill, busy. The 128×128 icon
  (`media/icon.png`) is rendered from the same SVG with headless Chrome (`npm run icon`). The Activity Bar
  icon is a single-colour silhouette with cut-out eyes, as VS Code requires.
- **Motion**: transitions 150–400 ms with ease-out / spring curves. Small ambient loops (breathing, the
  "new" dot pulse, a wave) run longer but are low-amplitude transform-only animations. With
  `prefers-reduced-motion: reduce` every animation and transition collapses to 1 ms and confetti is not drawn.
- **CSP** (every webview): `default-src 'none'`, styles and images only from the extension's `media/`
  folder (`webview.cspSource`) plus `data:` images, scripts only with a per-render nonce. No inline
  `style=""` attributes (blocked by the policy); dynamic values are set through the CSSOM. Initial data is
  passed in a `<script type="application/json">` block with `<`, `>` and `&` escaped.
- No framework: plain HTML/CSS/JS. Total webview JS + CSS is a few dozen KB.

## 8. Setup wizard

- Opens automatically once, on the first activation after install (`globalState` flag set as soon as it opens,
  so closing it half-way doesn't nag on every start). "PushPal: ตั้งค่าใหม่ · Run Setup Again" reopens it.
- One `WebviewPanel` in the editor area, `retainContextWhenHidden` so switching tabs doesn't lose the step.
  The current step is also kept with `vscode.setState`.
- All seven steps (a "how often" step was added in section 12) live in the same CSS grid cell, so the page height never jumps; the active step slides
  (48 px translate + fade, 380 ms ease-out), direction-aware for Back. The progress bar is a `scaleX` transform.
- Language and theme are saved to Settings the moment they're picked (the whole wizard re-renders in the
  new language without a round-trip, and the status bar follows). Notification toggles are saved immediately
  too, except "even when VS Code is closed": that one is applied when the wizard finishes, so flicking the
  switch doesn't install and remove a LaunchAgent several times. The result (enabled / failed + reason) is
  shown on the last step.
- "Skip setup" on the first step finishes with defaults (in-VS Code + desktop on, background off).
- The test step sends a real notification through the same code path as real alerts; on macOS it shows
  whether alerter is present and offers to install it (`brew install vjeantet/tap/alerter` in a visible
  VS Code terminal; links to brew.sh if Homebrew is missing), plus per-OS "not seeing it?" steps.
- Keyboard: every control is a real `<button>` with `role=radio/switch` + `aria-checked`; focus moves to
  the new step's heading; Alt+→ / Alt+← navigate.

## 9. My Team view

- `WebviewViewProvider` in PushPal's own Activity Bar container. It picks the repo that needs attention most
  (conflict > behind > others) unless the user selected one; multi-repo workspaces get a row of pills with a
  coloured state dot and the "behind" count.
- The page keeps its DOM between updates: the mascot element is re-used and only its pose class changes;
  timeline items are keyed by sha, so only commits that weren't on screen before slide in (staggered 70 ms).
  Switching repo doesn't replay the slide-in for every row.
- States → mascot pose: up to date = chill, teammates pushed = wave, pulling = busy + two branch lanes with
  commit dots flowing into one, success = cheer + a check mark that "draws itself" (a clip rect scaled with
  `transform`, so it stays transform/opacity-only) + light confetti, conflict / error = worried with a sweat drop,
  no upstream = pointing at the Publish button, no repo = waving with Open Folder / Clone.
- The "what do the buttons mean?" card swaps meanings by conflict kind: in a normal merge conflict "Current"
  is *your* commit and "Incoming" is your teammate's, but in an autostash conflict git applies your stash
  *onto* the merged code, so "Current" is your teammate's code and "Incoming" is your uncommitted work.
  Getting that backwards would make beginners throw away the wrong side.
- Avatar colour = hash of the author e-mail → hue, so one person always has the same colour. Thai names use a
  single leading consonant as the initial (two Thai letters read oddly).

## 10. Screenshots

- `npm run screenshots` renders every wizard step and every team state in headless Chrome with a mocked
  `acquireVsCodeApi`, the real CSS/JS from `media/`, and VS Code's Dark Modern / Light Modern variables,
  at 2× scale, into `docs/screenshots/`. They were reviewed by eye; issues found and fixed that way:
  sidebar cards overflowing (grid min-width), a translation key used twice, the Back button showing on step 1
  (`[hidden]` lost to `display:inline-flex`).
- These are faithful renders of the webview pages, not captures of the full VS Code window (automating
  real VS Code window screenshots isn't reliable headless).

## 11. Distribution

- `README.md` is bilingual in one file (Thai first, then English) because the Marketplace only renders
  `README.md`. Images use repo-relative paths, which `vsce` rewrites to GitHub URLs from `repository.url`.
- `publisher` is a placeholder (`pushpal`) and the repo URL assumes `github.com/Pug-03/pushpal` (from the
  local git user name). PUBLISHING.md says to replace both before publishing.
- CI: tests + typecheck + build on Ubuntu, macOS and Windows (Node 22) on every push; on a `v*` tag it packages
  the .vsix and attaches it to a GitHub Release (`softprops/action-gh-release`), then publishes to the Marketplace /
  Open VSX when the `VSCE_PAT` / `OVSX_PAT` secrets exist (skipped otherwise, so CI never fails for lack of them).
  `npm run release` bumps the patch version, tags and pushes.
- `.vscodeignore` is an allow-list: only `dist/*.js` (no source maps), `media/`, `l10n/`, manifest files,
  README, CHANGELOG and LICENSE go into the .vsix.
- The package is built with `--production` (minified, no source maps) by `vscode:prepublish`.
- `npm run smoke` runs the built extension inside the locally installed VS Code with an isolated
  `--user-data-dir` / `--extensions-dir` under `.vscode-test/` (git-ignored): activation, commands, the
  first-run wizard, the team view and a real pull with uncommitted work are all checked.

## 12. Check frequency, battery saving and GitHub Actions (2026-10-22)

- **One source of truth: the individual settings.** `pushpal.mode` is a label for a set of values. Picking a preset
  (wizard, settings page, quick pick or the Settings UI) writes the preset's values into the individual settings;
  editing any value by hand while a preset is active switches the mode to `custom`. Logic lives in
  `src/core/frequency.ts` (`reconcileMode`, pure + tested) and `src/ext/modes.ts` (applies it to VS Code settings,
  ignoring the configuration events caused by its own writes). Everything is written to User settings.
- **Migration from 1.0.0**: `checkIntervalSeconds` defaults to 30 now. A user who had set e.g. 60 explicitly keeps 60 and
  the mode becomes Custom on first start, instead of their value being overwritten by the Balanced preset.
- **Presets** (active hours are not part of a preset, so switching mode never changes them):

  | | normal | background | Actions | idle | low battery | low power |
  |---|---|---|---|---|---|---|
  | Fastest | 10 s | 60 s | 10 s | 10 min → 60 s | < 20% → 60 s | 60 s |
  | Balanced | 30 s | 120 s | 20 s | 10 min → 60 s | < 20% → 60 s | 60 s |
  | Battery saver | 60 s | 300 s | 30 s | 5 min → 180 s | < 30% → 180 s | 300 s |
- **Ranges**: normal 10–300 s and Actions 10–120 s (as asked); background **60–3600 s**, because Windows Task Scheduler
  can't repeat more often than once a minute and the LaunchAgent stays at a fixed 60 s tick (see below).
  Out-of-range values (settings.json, the page, anything) are rounded, clamped, written back, and a warning names the
  field, the bad value, the range and the value used. Malformed times fall back to 08:00 / 23:00.
- **Battery rules only slow down.** When several apply the slowest wins, and a rule faster than the normal interval is
  ignored. "Plugged in → normal" overrides every rule (it says "always"). A rule whose input is unknown
  (no battery, probe failed) doesn't apply — PushPal never guesses "on battery".
- **Reading the power state** (`src/core/power.ts`, no `vscode`, shared with the worker):
  macOS `pmset -g batt`, `pmset -g` (lowpowermode), `ioreg` HIDIdleTime; Windows one PowerShell call reading WinRT
  `PowerManager` (charge, supply, battery status, Energy Saver) and `GetLastInputInfo`; Linux `/sys/class/power_supply`,
  `powerprofilesctl get`, `xprintidle` (each optional). The probe runs at most once a minute and only when a rule is on
  (≈ 30 ms on macOS; a PowerShell start on Windows, hence the cache).
- **Idle** = min(OS idle time, time since the last VS Code activity: typing, selection, editor/terminal switch, window
  focus). VS Code activity is instant, so coming back to the keyboard re-evaluates immediately instead of after the
  next probe. Where the OS idle time isn't available (Linux without xprintidle) only VS Code activity counts.
- **Scheduler** (`src/ext/scheduler.ts`) replaces the fixed `setInterval`: the next check is due at
  *last check + effective interval*, and the effective interval is recomputed on settings change, power probe and user
  activity, so a change takes effect without waiting out the old interval. Focus-triggered checks still happen, except
  outside the checking hours. "Check now" always works.
- **Checking hours** work across midnight (22:00–06:00); start == end means all day. Outside them nothing is fetched
  (VS Code or background); the status bar tooltip says when checks resume.
- **Background job**: the OS schedule stays a fixed 1-minute tick; the worker decides whether a check is due from
  `config.json` (`frequency`) and `worker-state.json` (`lastCheckAt`), with 10 s slack for launchd/Task Scheduler jitter.
  The extension rewrites `config.json` within 300 ms of any PushPal setting change, so the very next tick uses the new
  values — no re-registration of the LaunchAgent / task. The battery is probed only when the normal interval has
  already passed (rules can only make it later). Configs written by 1.0.0 have no `frequency` and keep running every tick.
- **Status bar**: the existing item's tooltip gains "why" (e.g. "Checking every 1 min right now because the battery is
  at 15%") and the mode with "Switch mode" / "Settings" command links. **Right-click isn't possible**: VS Code's API has
  no context-menu contribution point for an extension's status bar item, so quick switching is the
  "PushPal: Switch Check Mode" command plus the tooltip link.
- **Estimates are measured, not guessed.** `scripts/measure-fetch.mjs` sends PushPal's exact fetch command through a
  local CONNECT proxy that counts every byte both ways (TLS included). Against github.com: 5,457 B for a 1-ref remote;
  `ls-refs` grows ≈ 58 B per branch/tag (28,030 B at 372 refs, 120,019 B at 2,032 refs). So one check ≈
  5,400 + 58 × refs bytes, with refs counted from the repo's own remote-tracking refs + tags. One Actions API call
  ≈ 7,300 B (gzip), a 304 ≈ 5,200 B. SSH wasn't measured (no key on the test machine); the HTTPS figure is used for all.
- **GitHub Actions** (`src/core/ciRuns.ts`, `src/ext/ciWatcher.ts`): when a repo's upstream sha changes (anyone's push,
  including your own), PushPal asks once for runs of that commit, keeps asking for up to 3 minutes until runs appear,
  then polls only while a run is queued / in progress, and announces pass/fail (only for runs it saw running, so old
  results aren't announced on startup). Auth uses VS Code's built-in GitHub sign-in silently (`repo` scope); without it
  public repos still work, but polling is held to ≥ 60 s because GitHub allows 60 unauthenticated requests per hour.
  ETags are sent so unchanged results come back as 304. Not done in the background worker (no token there).
- **Settings page** (`src/ext/settingsPage.ts`, `media/settings.*`): rendered once, then patched in place on every
  update, so a slider drag, a focused input or the mode-card animation is never interrupted by the echo of its own
  change. Sliders post on release; numbers on change/Enter. Toggles and option cards share `media/controls.css`
  with the wizard (moved out of `wizard.css`). Restore defaults is a two-step button (no `confirm()` in webviews).
  Clamped fields flash and the notice says what changed.
- Tests: `test/frequency.test.ts` (modes, clamping, each battery rule, plugged in, slowest wins, checking hours across
  midnight, estimates, power-output parsers, Actions parsing/fetch with a fake `fetch`) and new worker cases in
  `test/background.test.ts` (due / not due, new config applied on the next run, outside hours, battery rules through
  `PUSHPAL_TEST_POWER`). The smoke test also switches modes in a real VS Code and checks the sync, the clamping,
  `config.json` and the settings page.

## 13. Pal becomes a pug (2026-10-22)

- **Name**: the request calls the product "PushPug". I kept the extension name **PushPal** (id, publisher,
  URI handler, LaunchAgent label, settings keys all depend on it) and made the mascot a pug called Pal.
  Renaming the product is a separate, breaking change and wasn't asked for explicitly.
- **Drawing** (`media/mascot.js`): every shape is a bezier `path`; a small `blob()` helper draws organic,
  slightly uneven ovals so there is no `circle`/`ellipse`/`rect` anywhere (a unit test checks this).
  Chibi proportions: head 26–137 of a 22–192 figure (≈ 65 %). Pug traits: flat face, short nose with a
  nose roll, droopy "w" mouth, forehead wrinkles that follow the skull, folded rose ears, big wide-set
  eyes, curled tail, stubby legs.
- **Line and colour**: outline is warm dark brown `#3a2820`, never black. Variable weight comes from an
  ink copy of each shape 1.8 units lower: thick along the bottom where the weight is, thin on top.
  Cel shading = one flat shade band + one flat highlight per part, clipped to the part (no gradients).
  Palette: cream fur `#f3ddb6` / shade `#e0bf8e` / light `#fcf1dd`, mask `#655149`, blush `#f39a92`,
  collar `#1f9e89` and arrow-tag `#ff7a59` (PushPal's teal and coral). Checked on light and dark.
- **Eyes**: dark eye, warm iris crescent, light lower-lid crescent, two highlights (big + small); the
  eyelid is a separate layer scaled from the top, so blinks, sleepy and sad eyes are the same part.
- **Layers and pivots**: root, spin, body, head, ears (from the ear root), eyes + lids, brows,
  wrinkles, muzzle, mouth (morphs), open mouth, tongue, cheeks, tail (from the tail root), four legs
  (from the shoulder/hip), collar, tag (from the ring) and props (z's, bark lines, "?", rope + knot,
  stars, dust). Pivots are set with GSAP `svgOrigin` in viewBox coordinates.
- **Static first**: the markup without any script is already the resting "sit" face (lids pre-scaled
  open, mouth closed). That's what `npm run icon`, previews and reduced motion fall back to.
- **Small sizes**: the full body isn't readable at 32/16 px, so there's a separate simplified head
  (`PushPalIconHead`): ears, mask, eyes, nose; mouth/wrinkle/blush only above 20 px; thicker ink. Used for
  the extension icon and the wizard's top bar. The Activity Bar icon is a one-colour pug-head
  silhouette with cut-out eyes, nose and a wrinkle, as VS Code requires.
- **GSAP**: version 3.15.0 (April 2026, older than two weeks), bundled as files in `media/vendor/`
  (`gsap.min.js`, `MorphSVGPlugin.min.js`) and loaded with the page's CSP nonce — no CDN. Licence: GSAP
  and all its former bonus plugins (MorphSVG included) are free for everyone, commercial use included,
  under GreenSock's Standard "No Charge" License; this is stated in the package README and in each
  file's header ("Subject to the terms at https://gsap.com/standard-license"). The licence page itself
  could not be loaded on 2026-10-22 (gsap.com redirected every page to a forums-outage notice), so this
  relies on the package's own text. As I understand the licence, its main restriction is not using GSAP
  in a product that competes with Webflow (visual site/animation builders) — a git helper in VS Code
  isn't one. Re-check https://gsap.com/standard-license before publishing. If it ever can't be used,
  `media/mascot.js` still draws every pose correctly without GSAP (static).
- **Animation**: each pose = a held position + an entrance + a loop. Switching poses tweens every layer
  from where it is to the new held position (0.42 s, power2.inOut), so any pose follows any other without
  a jump. Principles used: squash & stretch (jump, landing, bark), anticipation (crouch before the jump,
  flinch before the alert), follow-through (ears, cheeks, tag on elastic eases after the body stops),
  secondary action (tag swings, tail lags), easing everywhere (no linear tweens), timing (held poses,
  quick transitions). Idle life is random: blink every 3–6 s (sometimes double), and every 7–16 s an ear
  twitch, a look around, a yawn or a scratch, so the loop never visibly repeats.
- Only `transform` and `opacity` are animated (plus the mouth's path morph). The SVG is ~110 nodes.
- **Poses → app states**: up to date = sleep; checking = check (sniff, look left/right); teammates pushed =
  alert (startle, ears up, two barks, fast tail); pulling = merge (two-colour rope tied into a knot);
  merged = success (crouch, jump-spin, land, stars); conflict = conflict (slow head tilt, frown, "?");
  error = fail; conflicts fixed = pass; GitHub Actions finished: pass (nod + paw up) or fail (ears droop,
  sad eyes, sits lower, tail stops); no repo / wizard welcome = welcome (runs in, brakes with dust, sits,
  waves). Click = belly-up for a rub, legs kicking, then back to what it was doing.
- **Reduced motion**: no movement at all; a pose change is a 0.35 s cross-fade to the held picture.
- **Tooling**: `docs/mascot/sheet.html` (turnaround, poses, small sizes, palette) and
  `docs/mascot/playground.html` (every pose, dark/light, 0.25× speed). `scripts/mascot-render.mjs` renders
  them with Playwright (`playwright-core` 1.64.0 driving the installed Chrome; no browser download) and
  records frame-exact GIFs with ffmpeg. Design rounds are in `docs/mascot/ITERATIONS.md`.

## 14. Pal, round two: a flat graphic head (2026-10-22)

- The user found the section-13 drawing unnatural and asked for a more graphic look, then for **only the
  face**, with expressions instead of body poses. Section 13's GSAP, licence, tooling and reduced-motion
  decisions still apply; the drawing and the pose list changed.
- **Reference images** the user found online were used only to agree on a style. They aren't licensed
  for use as a mascot (one carries a stock-site watermark), so nothing was traced or copied; Pal is an
  original drawing.
- **Style**: one ink colour `#3b2230`, one stroke width (3.6 in a 200-unit viewBox) everywhere, two flat
  tones per material (fur, eye patch, muzzle), no gradients. Blush is clipped inside the head outline.
- **Expressions** (`FACES` in `media/mascot.js`): sit, sleep, check, alert, merge, success, conflict,
  fail, pass, welcome, love. Old names (idle, chill, wave, point, cheer, worry, busy, belly) map onto them.
  **Poking** Pal with the mouse: squash while pressed, then a springy jiggle (tilt back and forth, ears and
  muzzle wobble) and a quick funny face (giggle, surprised, tongue out or wink) before its own face returns.
  Five pokes within 2 s show "love" (heart eyes, hearts) for 2.4 s. Hovering makes the ears perk. This runs
  on its own `p-poke` layer so it never fights the pose's loops; with reduced motion only the face changes.
- **Switching**: ears, brows and the mouth line morph (MorphSVG; all variants share one command
  structure so the morphs are clean); eyes and open mouths cross-fade with a small scale pop; the head
  settles back to rest in 0.3 s before the new pose's entrance, so any pose can follow any other.
- **Brows**: line brows made Pal look human (user feedback). Replaced with dog-style brow spots (small dark
  ovals above the eyes, like tan points); they move up, together or apart with the mood. Chosen by the user
  over a no-brow, forehead-wrinkle version.
- **Icon**: `PushPalIconHead` draws the same head with brows, blush and mouth dropped at ≤ 20 px.

## 15. Profile pictures in the timeline (2026-10-22)

- Authors with a GitHub noreply address (`123+login@users.noreply.github.com`) get their avatar URL without any
  request. For everyone else, **one** `GET /repos/{owner}/{repo}/commits?sha=<upstream>&per_page=50` per new upstream
  commit returns each commit's `author.avatar_url`; results are cached in `globalState`, so normal checks never call
  the API. Uses VS Code's GitHub sign-in when present (private repos), otherwise the public API.
- The webview loads the images from `avatars.githubusercontent.com` / `github.com` (added to `img-src` in the CSP).
  The coloured initials stay underneath and remain if the picture can't load (offline, blocked, no GitHub account).
- This is a second kind of traffic to GitHub besides `git fetch` (after the Actions watcher), so it's a setting
  (`pushpal.avatars`, on by default, also on the settings page) and the README's privacy answer says so.
- The team view now reports back whether GSAP loaded and any script errors (PushPal output + a hidden
  `pushpal._diag` command the smoke test checks). Found while debugging: a webview page from before a reload keeps
  running the old scripts — "Developer: Reload Window" after installing a new build.

## 16. GitHub checks (2026-10-22)

- **What is read:** check runs (`/commits/{sha}/check-runs`, GitHub Actions and other apps) **and** classic
  commit statuses (`/commits/{sha}/status`) — together they are what GitHub's "Some checks were not successful"
  box shows. Re-runs: the newest run per name wins. `skipped`, `neutral`, `stale` don't count as failures;
  `cancelled` doesn't either (it's almost always a superseded run), shown grey. `timed_out`,
  `action_required`, `startup_failure` and status `error` count as failures.
- Replaces the earlier Actions-runs watcher (section 12): one model for badges, alerts, status bar and mascot.
- **Logic is pure and tested** (`src/core/checks.ts`, `src/core/checksTracker.ts`) against a fake GitHub:
  running→passed, running→failed, skipped only, failed→fixed, not signed in, token rejected, rate limit, no
  checks yet, non-GitHub remote.
- **Polling:** only while something is pending, at the Actions interval but never faster than 20 s (default
  20 s; battery rules slow it like everything else), stops when done. Finished results are cached for good.
  Commits with no checks yet are asked about for 3 minutes (runs appear a few seconds after a push).
  **Rate limit:** `x-ratelimit-remaining` < 50 → 4× slower; 0 / 403 → wait until `x-ratelimit-reset`.
- **Which commits:** the tip of each branch (alerts, status bar, mascot) and the newest 8 timeline rows
  (badges) — about 2 requests per commit, once.
- **Mine vs teammate:** the commit author's e-mail compared with `git config user.email`. Scope setting
  `actions.notifyFor` (all / mine / team), `actions.notifyOnPass`. Failures are always reported (prominent:
  warning + desktop when VS Code isn't focused); passes are a light VS Code pop-up only, and only if we saw the
  checks running (no stale "passed" on startup). A teammate's result is only announced while their push isn't
  pulled yet; failure → See what broke / Pull anyway / Later; later fix → "Fixed: checks pass again — safe to pull".
- **The push alert itself** waits up to 3 s for one quick look so it can say "⏳ checks still running" / "❌ …";
  when the checks finish, the desktop notification is replaced in place (same group / toast tag).
- **Sign-in:** `vscode.authentication.getSession('github', ['repo'])` — silent first; when checks are needed
  and there's no session, PushPal asks **once**; "No thanks" turns the feature off (setting), nothing else is
  affected. The token lives in memory only. The extension-wide anonymous fallback of section 12 is gone (logs
  need auth anyway, and 60 requests/hour isn't enough).
- **Why it failed:** for GitHub Actions jobs (check run id = job id) PushPal reads the job's steps (failed
  step name) and its log (`/actions/jobs/{id}/logs`), strips timestamps / colour codes and shows the last 30
  lines, plus a hint when it recognises the case: failing tests, dependency install, lint, timeout, build/type
  errors. Loaded only when the user clicks "Why did it fail?".
- **Background (VS Code closed):** if `gh` is installed and `gh auth status` succeeds, the worker adds the
  check state to the push alert via `gh api`. Otherwise checks are only reported while VS Code is open; the
  wizard says which applies.
- Only github.com remotes; anything else hides the feature silently.

## 17. Safety nets (2026-10-22)

- **Push (check first)** (`src/git/safety.ts → safePush`): fetch, then if `HEAD..@{u}` isn't empty don't push;
  offer "Merge, then push for me" (= PushPal's pull, then push). VS Code's own Push/Sync can't be intercepted
  *before* pushing (no API for that), so PushPal registers the Git extension's `registerPushErrorHandler`: a
  rejected push from VS Code's buttons is explained with the same offer. The command is also in the Source
  Control title bar.
- **Undo the last merge** (10 minutes): before pulling, `git stash create` records uncommitted work without
  touching it (kept reachable via `refs/pushpal/undo-stash`), plus HEAD. After a successful pull PushPal stores
  HEAD and a fingerprint of the working copy (HEAD, index tree, working-tree tree, untracked file names and
  contents). Undo = `git reset --hard <before>` + `git stash apply --index <stash>`. It refuses — with the reason —
  if HEAD moved (new commits) or the fingerprint changed (edits, staging, new files), or after 10 minutes.
  Tested with real repos: clean, staged + unstaged + untracked work, refused cases.
- **Git errors explained** (`src/core/gitErrors.ts`): rejected, auth, repository not found, no upstream,
  detached HEAD, merge / rebase in progress, local changes / untracked files in the way, unrelated histories,
  divergent branches, identity, index.lock, network, not a repo. Each has a plain title and the fix in Thai and
  English; "Show full message" shows git's original text in a modal.
- **Do not disturb**: hours (can cross midnight) and "Mute 1 hour" (button on alerts, command). Applies to
  pop-ups and desktop notifications only; the status bar keeps updating. Push alerts during quiet time aren't
  *claimed*, so they're announced once the quiet time is over. The snooze is a shared file, so every window and
  the background worker respect it.

## 18. README (2026-10-22)

- English only, as asked (the bilingual README is gone; the extension itself stays Thai/English). Structure:
  value in one line → features with screenshots → Pal → install (Marketplace / Open VSX / .vsix) with macOS,
  Windows and Linux setup → quick start → how-to for every everyday task → settings → privacy → troubleshooting.
- **README images are English and follow the reader's theme** (user feedback: Thai UI in the pictures, and
  pictures with their own background colour). `npm run screenshots` also renders English copies of the
  README screens into `docs/screenshots/en/`, with English sample data. Every screenshot and the demo GIF has
  a light and a dark version, picked with `<picture>` + `prefers-color-scheme`, so the page stays one colour
  in GitHub's light and dark themes. Pal's animations for the README are transparent animated PNGs
  (`docs/mascot/anim/*.png`, APNG — GIF has no real transparency and this ffmpeg has no WebP encoder).
  Steps are grouped as Getting started (Step 1 install → Step 2 set up the computer → Step 3 wizard →
  Step 4 open the project) and Everyday use.
- The GitHub repository is now `Pug-03/PushPug`; links in README and `package.json` point there.

