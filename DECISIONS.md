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
