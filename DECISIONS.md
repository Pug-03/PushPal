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
