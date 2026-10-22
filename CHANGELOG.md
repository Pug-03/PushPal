# Changelog

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
