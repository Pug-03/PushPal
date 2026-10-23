<p align="center">
  <img src="docs/mascot/still/success.png" width="150" alt="Pal the pug, smiling">
</p>

<h1 align="center">PushPal</h1>

<p align="center">
  <b>Know the moment a teammate pushes. Pull their code in with one click. Never lose your work.</b>
</p>

<p align="center">
  <a href="https://github.com/Pug-03/PushPug/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pug-03/PushPug/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="VS Code 1.90+" src="https://img.shields.io/badge/VS%20Code-1.90%2B-0b7a6b">
  <img alt="macOS · Windows · Linux" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-supported-1f9e89">
  <img alt="MIT" src="https://img.shields.io/badge/license-MIT-ff7a59">
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#what-youll-see-and-what-to-do">What you'll see</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#troubleshooting">Troubleshooting</a>
</p>

---

## What it does

You're building something with friends on GitHub. Someone pushes, you don't notice, you keep working on old
code — and when you finally push, everything conflicts.

**PushPal watches the remote for you.** The moment a teammate pushes, it tells you who pushed what, warns you
if they touched a file you're editing, and pulls their code in with one click — your uncommitted work is set
aside and put back afterwards. When something does go wrong, it explains it in plain words and shows you how
to fix it. It's made for people who are new to Git, and for everyone who'd rather not think about it.

- 🔔 **Know the moment they push** — in VS Code or as a desktop notification, even when VS Code is closed
- ⬇️ **Pull in one click, lose nothing** — and **undo** the merge for 10 minutes if you change your mind
- 🧭 **Conflicts and Git errors explained** — in plain words, with the fix
- ✅ **GitHub test results for every commit** — yours and your teammates'
- 🛡️ **Push without surprises** — PushPal checks the remote first
- 🔋 **Fast or frugal** — from every 10 s to battery saver, plus do-not-disturb hours

---

## Getting started

### Step 1 — Install PushPal

**From the Marketplace** *(recommended — updates install automatically)*

1. Open VS Code → **Extensions** (`⇧⌘X` on macOS, `Ctrl+Shift+X` on Windows / Linux).
2. Search for **PushPal** → **Install**.

*Cursor, VSCodium or Windsurf?* PushPal is on **Open VSX** too — search the same way in their Extensions view.

**From a `.vsix` file**

1. Download `pushpal-x.y.z.vsix` from [Releases](https://github.com/Pug-03/PushPug/releases).
2. Command Palette (`⇧⌘P` / `Ctrl+Shift+P`) → **Extensions: Install from VSIX…** → pick the file.

A `.vsix` install doesn't update itself — install the newer file over it when a new version comes out.

### Step 2 — Set up your computer

<details>
<summary><b>🍎 macOS</b></summary>
<br>

1. **Notifications with buttons** (recommended): install [alerter](https://github.com/vjeantet/alerter) so
   alerts get a **Pull in changes** button and stay on screen until you click.
   ```bash
   brew install vjeantet/tap/alerter
   ```
   You can also do this from the setup wizard's *Test* step.
2. Open **System Settings → Notifications → alerter** (or **Visual Studio Code**) → set the alert style to
   **Persistent**.
3. *(Optional)* **GitHub test results while VS Code is closed** — install the GitHub CLI and sign in once:
   ```bash
   brew install gh && gh auth login
   ```

If you turn on **alerts while VS Code is closed**, macOS shows a one-time *“Background item added”* notice —
that's PushPal's small LaunchAgent. Turning the option off removes it.

</details>

<details>
<summary><b>🪟 Windows</b></summary>
<br>

1. **Notifications** work out of the box (Windows toasts with **Pull in changes** / **Later** buttons).
2. If you don't see them: **Settings → System → Notifications** → turn notifications on for
   **Visual Studio Code** (or **Windows PowerShell**), and turn off **Do not disturb / Focus**.
3. *(Optional)* **GitHub test results while VS Code is closed** — install the GitHub CLI and sign in once:
   ```powershell
   winget install --id GitHub.cli
   gh auth login
   ```

**Alerts while VS Code is closed** use a hidden Task Scheduler task (*PushPal Watcher*). No console window ever
pops up, and turning the option off deletes the task.

</details>

<details>
<summary><b>🐧 Linux</b></summary>
<br>

Desktop notifications use `notify-send` (package `libnotify-bin` or `libnotify`). Alerts while VS Code is
closed aren't available on Linux; everything else works.

</details>

### Step 3 — Run the setup wizard

The wizard opens by itself after installing (run it again any time with **PushPal: Run Setup Again**).
Every step can be skipped and changed later.

| Step | You choose |
|---|---|
| **Language & theme** | Thai or English; light, dark or match VS Code |
| **Notifications** | in VS Code, on your desktop, even when VS Code is closed; do-not-disturb hours |
| **How often to check** | ⚡ Fastest · ⚖️ Balanced · 🔋 Battery saver · 🛠 Custom |
| **GitHub** | sign in with VS Code's GitHub account to get test results |
| **Test** | send a test notification to see that it works |

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/wizard-1-welcome-dark.png">
    <img src="docs/screenshots/en/wizard-1-welcome-light.png" width="400" alt="Setup wizard: welcome">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/wizard-6-github-dark.png">
    <img src="docs/screenshots/en/wizard-6-github-light.png" width="400" alt="Setup wizard: GitHub test results">
  </picture>
</p>

### Step 4 — Open your project

Open a folder that's a git repository (cloned from GitHub or any remote). Look at the **status bar**, bottom
left, and click Pal in the **Activity Bar** to open **My Team**. That's all — the next section shows every
screen you'll meet there and what to do.

---

## What you'll see, and what to do

Every situation has its own screen in **My Team**, and Pal's face matches it.

<table>
<tr><td colspan="2"><h3>😴 You're up to date</h3></td></tr>
<tr>
<td width="240" valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-upToDate-dark.png">
  <img src="docs/screenshots/en/team-upToDate-light.png" width="230" alt="Up to date">
</picture>
</td>
<td valign="top">

**What it means:** you have everything your teammates pushed. The status bar shows **✓ Up to date**.

**What to do:** nothing — keep coding. PushPal keeps checking in the background.

</td>
</tr>

<tr><td colspan="2"><h3>🐶 A teammate pushed</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-behind-dark.png">
  <img src="docs/screenshots/en/team-behind-light.png" width="230" alt="A teammate pushed 3 commits">
</picture>
</td>
<td valign="top">

**What it means:** there are new commits on the remote. You get an alert, the status bar turns yellow
(**⬇ 3 new from your team**), and new commits are marked **New** in the timeline. **Same file as you** means
they changed a file you're editing too.

**What to do:** press **Pull in changes** (in the alert, the status bar or here). The sooner you pull, the
smaller any conflict will be.

</td>
</tr>

<tr><td colspan="2"><h3>🪢 Pulling in their code</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-pulling-dark.png">
  <img src="docs/screenshots/en/team-pulling-light.png" width="230" alt="Pulling">
</picture>
</td>
<td valign="top">

**What it means:** PushPal is merging their commits. Your uncommitted work is set aside safely while it runs.

**What to do:** wait a second.

</td>
</tr>

<tr><td colspan="2"><h3>🎉 Merged</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-success-dark.png">
  <img src="docs/screenshots/en/team-success-light.png" width="230" alt="Merged">
</picture>
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-undo-dark.png">
  <img src="docs/screenshots/en/team-undo-light.png" width="230" alt="Undo the last merge">
</picture>
</td>
<td valign="top">

**What it means:** their commits are in, and your own work is all still there.

**What to do:** carry on. Changed your mind? Press **Undo** on the card (or run **PushPal: Undo Last Merge**)
within 10 minutes: everything goes back exactly as it was — commits, staged and unstaged changes, new files.
If you've committed or edited since, PushPal won't undo and tells you why, so nothing of yours is lost.

</td>
</tr>

<tr><td colspan="2"><h3>❓ Conflict: your commits and theirs changed the same lines</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-conflictMerge-dark.png">
  <img src="docs/screenshots/en/team-conflictMerge-light.png" width="230" alt="Merge conflict">
</picture>
</td>
<td valign="top">

**What it means:** Git can't decide which version to keep. The status bar turns red (**Conflicts to fix**).

**What to do:**
1. Press **Fix** next to a file (or **Open Merge Editor**).
2. In each conflict choose **Accept Current** (*your* version), **Accept Incoming** (*your teammate's*) or
   **Accept Both** — the card under the files explains them.
3. Save every file, then press **Finish merge**.

</td>
</tr>

<tr><td colspan="2"><h3>❓ Conflict: their code overlaps work you haven't committed</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-conflictAutostash-dark.png">
  <img src="docs/screenshots/en/team-conflictAutostash-light.png" width="230" alt="Conflict with uncommitted work">
</picture>
</td>
<td valign="top">

**What it means:** their code is already in; putting your uncommitted work back on top of it clashed. A backup
of your work is kept until you're done.

**What to do:** fix each file the same way — but here **Current** is your teammate's code and **Incoming** is
*your* uncommitted work (PushPal's help card says so). Then **stage** the files (＋ in Source Control).
PushPal removes the backup by itself.

</td>
</tr>

<tr><td colspan="2"><h3>✅ Every conflict fixed</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-mergeReady-dark.png">
  <img src="docs/screenshots/en/team-mergeReady-light.png" width="230" alt="All conflicts fixed">
</picture>
</td>
<td valign="top">

**What it means:** all files are resolved, but the merge isn't saved yet.

**What to do:** press **Finish merge**.

</td>
</tr>

<tr><td colspan="2"><h3>🧪 Test results on GitHub</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-checks-dark.png">
  <img src="docs/screenshots/en/team-checks-light.png" width="230" alt="GitHub checks with the failing step and its log">
</picture>
</td>
<td valign="top">

**What it means:** each commit has a badge — **⏳** tests running, **✓ 4/4** all passed, **✗ 3/4** something
failed. The status bar shows the same for the latest commit. You're told when your push passes or fails, and
when a teammate's push fails you get *“maybe don't pull it yet”* with **See what broke · Pull anyway · Later**
(and a heads-up once it's fixed). Skipped, neutral and cancelled checks don't count as failures.

**What to do:** click a badge to see every check. On a failed one press **Why did it fail?** for the failing
step, the last 30 lines of its log, a hint in plain words (failing tests, install, lint, timeout, build) and
**Open on GitHub**.

*Needs a one-time sign-in to GitHub (wizard or **PushPal Settings → GitHub**). Only for github.com projects.*

</td>
</tr>

<tr><td colspan="2"><h3>📡 I couldn't check</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-error-dark.png">
  <img src="docs/screenshots/en/team-error-light.png" width="230" alt="Couldn't check">
</picture>
</td>
<td valign="top">

**What it means:** Git reported a problem — no internet, not signed in to the remote, another git command
running… PushPal says which in plain words and how to fix it.

**What to do:** follow the hint, then press **Try again**. *Show full message* shows Git's original text.

</td>
</tr>

<tr><td colspan="2"><h3>☁️ This branch isn't on GitHub yet</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-noUpstream-dark.png">
  <img src="docs/screenshots/en/team-noUpstream-light.png" width="230" alt="Branch not published">
</picture>
</td>
<td valign="top">

**What it means:** your branch only exists on your computer, so there's nothing to watch yet.

**What to do:** press **Publish branch** once. PushPal starts watching it right away.

</td>
</tr>

<tr><td colspan="2"><h3>📂 No project open</h3></td></tr>
<tr>
<td valign="top">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/team-noRepo-dark.png">
  <img src="docs/screenshots/en/team-noRepo-light.png" width="230" alt="No project open">
</picture>
</td>
<td valign="top">

**What it means:** the open folder isn't a git repository.

**What to do:** press **Open folder** for a project that uses git, or **Clone from GitHub**.

</td>
</tr>

<tr><td colspan="2"><h3>🚫 Your push was turned away</h3></td></tr>
<tr>
<td valign="top" align="center">
<img src="docs/mascot/still/alert.png" width="120" alt="">
</td>
<td valign="top">

**What it means:** someone pushed before you, so Git refuses your push until you have their commits.

**What to do:** press **Merge, then push for me** — PushPal pulls their code in and pushes yours. To avoid it
altogether, push with **PushPal: Push (Check First)** (also in the Source Control title bar), which checks the
remote before pushing. VS Code's own **Push** / **Sync** get the same help when they're rejected.

</td>
</tr>
</table>

---

## Settings

Everything is in **PushPal Settings** (gear icon in **My Team**, or **PushPal: Open Settings**) and mirrored in
VS Code's Settings — change either, the other follows instantly.

### How often PushPal checks

| Mode | Checks | Good for |
|---|---|---|
| ⚡ Fastest | every 10 s | teams pushing all day |
| ⚖️ Balanced *(default)* | every 30 s | most people |
| 🔋 Battery saver | every 60 s, slower when idle or on battery | laptops on the go |
| 🛠 Custom | your values | full control |

Each mode shows what it costs, e.g. *120 checks/hour · ≈ 655 KB/hour*, based on measured `git fetch` sizes.
Switch quickly with **PushPal: Switch Check Mode**.

### Not being disturbed

Set **do-not-disturb hours** (e.g. 22:00–08:00) or press **Mute 1 hour** on any alert. No pop-ups or desktop
notifications meanwhile; the status bar keeps updating and anything you missed is announced afterwards.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/settings-frequency-dark.png">
    <img src="docs/screenshots/en/settings-frequency-light.png" width="420" alt="PushPal Settings: frequency and battery">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/en/settings-notify-dark.png">
    <img src="docs/screenshots/en/settings-notify-light.png" width="420" alt="PushPal Settings: notifications and do not disturb">
  </picture>
</p>

### All settings

| Setting | Default | |
|---|---|---|
| `pushpal.mode` | `balanced` | `fast`, `balanced`, `batterySaver`, `custom` |
| `pushpal.checkIntervalSeconds` | `30` | while VS Code is open (10–300) |
| `pushpal.background.intervalSeconds` | `120` | while VS Code is closed (60–3600) |
| `pushpal.battery.*` | on | idle / low battery / Low Power Mode slow-downs; plugged in = normal |
| `pushpal.activeHours.*` | off | only check between two times |
| `pushpal.notify.inVSCode` / `.desktop` | on | where alerts appear |
| `pushpal.notify.background` | off | alerts while VS Code is closed (macOS, Windows) |
| `pushpal.notify.sameFileWarning` | on | extra warning for files you're also editing |
| `pushpal.quiet.enabled` / `.start` / `.end` | off · 22:00–08:00 | do-not-disturb hours |
| `pushpal.actions.enabled` | on | GitHub test results |
| `pushpal.actions.notifyOnPass` | on | also tell me when tests pass |
| `pushpal.actions.notifyFor` | `all` | `all`, `mine`, `team` |
| `pushpal.avatars` | on | commit authors' GitHub profile pictures |
| `pushpal.language` / `pushpal.theme` | auto · system | Thai or English; light, dark or match VS Code |

## Privacy

- **No telemetry.** Nothing about you or your code is collected.
- Your normal `git fetch` / `pull` / `push` go to your own remote.
- For **github.com** projects only, and only if enabled: test results and profile pictures are read from
  GitHub's API with **VS Code's built-in GitHub sign-in**. PushPal never asks you to paste a token and never
  saves one. While tests are running it asks every 20–30 s, stops when they're done, and slows down by itself
  near GitHub's rate limit.
- The optional background task only runs `git fetch` (and `gh api` for test results if you use the GitHub
  CLI). It never pulls or changes your files.

## Troubleshooting

<details>
<summary><b>I don't get desktop notifications</b></summary>
<br>

Send a test from the wizard (**PushPal: Run Setup Again** → *Test*). Then check your system's notification
settings (Step 2 above), and PushPal's own **do-not-disturb hours** and **Mute 1 hour**.

</details>

<details>
<summary><b>“Couldn't sign in to the remote”</b></summary>
<br>

PushPal uses the same git as your terminal. Press **Sync** once in Source Control to sign in, then PushPal can
check again. It never asks for passwords itself.

</details>

<details>
<summary><b>No test results show up</b></summary>
<br>

They appear for github.com projects that have checks (e.g. GitHub Actions), after you've signed in under
**PushPal Settings → GitHub**. If you chose *No thanks* earlier, turn **GitHub test results** back on there.

</details>

<details>
<summary><b>Pal doesn't move after an update</b></summary>
<br>

Run **Developer: Reload Window** once — open panels keep the old version until they're reloaded.

</details>

<details>
<summary><b>Removing PushPal</b></summary>
<br>

Uninstall it from the Extensions view. The background task (if you turned it on) is removed with it.

</details>

---

## Development

```bash
npm install
npm test            # real git repos (bare remote + two clones) and a mocked GitHub API
npm run build
npm run smoke       # runs the extension in your local VS Code with an isolated profile (macOS)
npm run screenshots # renders every screen into docs/screenshots/ (English copies in docs/screenshots/en/)
npm run package     # builds pushpal-<version>.vsix
node scripts/mascot-render.mjs stills # Pal's faces for this README (docs/mascot/still/)
```

Design decisions: [DECISIONS.md](DECISIONS.md) · Publishing: [PUBLISHING.md](PUBLISHING.md) ·
Releasing: `npm run release` (bumps the version and pushes a tag; CI tests, packages and publishes).

## License

[MIT](LICENSE) · Pal the pug is an original drawing made for PushPal.
