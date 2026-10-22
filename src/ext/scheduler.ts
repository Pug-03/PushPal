import * as vscode from 'vscode';
import { effectiveInterval, msUntilActive, needsPowerState, type Effective, type PowerState } from '../core/frequency';
import { probePower } from '../core/power';
import type { ModeController } from './modes';
import type { RepoManager } from './repoManager';

const POWER_TTL_MS = 60_000;

/**
 * Runs the periodic checks. The interval is re-evaluated whenever settings,
 * power state or user activity change, so slowing down for a low battery or
 * speeding back up when the user returns happens without waiting a full cycle.
 */
export class Scheduler implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private powerTimer: NodeJS.Timeout | undefined;
  private lastCheckAt = Date.now();
  private lastActivity = Date.now();
  private power: PowerState = {};
  private powerAt = 0;
  private current: Effective | undefined;
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private activityThrottle = 0;

  constructor(
    private readonly repos: RepoManager,
    private readonly modes: ModeController,
    private readonly log: vscode.OutputChannel,
  ) {
    const active = () => this.markActive();
    this.disposables.push(
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused || s.active) active();
      }),
      vscode.window.onDidChangeTextEditorSelection(active),
      vscode.window.onDidChangeActiveTextEditor(active),
      vscode.workspace.onDidChangeTextDocument(active),
      vscode.window.onDidChangeActiveTerminal(active),
      modes.onDidChange(() => void this.reevaluate(true)),
    );
  }

  start(): void {
    this.lastCheckAt = Date.now();
    void this.reevaluate(true);
  }

  /** Current interval and why. */
  get effective(): Effective | undefined {
    return this.current;
  }

  get paused(): boolean {
    return this.current?.seconds === null;
  }

  /** Interval for GitHub Actions polling, slowed down by the same rules. */
  actionsSeconds(): number | null {
    const c = this.modes.config;
    return effectiveInterval(c, c.actionsSeconds, { ...this.power, idleSeconds: this.idleSeconds() }, new Date()).seconds;
  }

  noteCheck(): void {
    this.lastCheckAt = Date.now();
  }

  private markActive(): void {
    this.lastActivity = Date.now();
    const now = Date.now();
    if (now - this.activityThrottle < 2000) return;
    this.activityThrottle = now;
    // Coming back from idle: the idle rule may no longer apply.
    if (this.current?.reason === 'idle') void this.reevaluate(false);
  }

  private idleSeconds(): number {
    const vscodeIdle = (Date.now() - this.lastActivity) / 1000;
    // The OS idle time covers other apps too; VS Code activity is fresher.
    return Math.floor(this.power.idleSeconds !== undefined ? Math.min(this.power.idleSeconds, vscodeIdle) : vscodeIdle);
  }

  private async refreshPower(force: boolean): Promise<void> {
    const c = this.modes.config;
    if (!needsPowerState(c)) {
      this.power = {};
      return;
    }
    if (!force && Date.now() - this.powerAt < POWER_TTL_MS) return;
    try {
      this.power = await probePower();
    } catch (e) {
      this.log.appendLine(`[power] ${e}`);
      this.power = {};
    }
    this.powerAt = Date.now();
  }

  /** Recompute the interval and re-arm the timer from the last check. */
  async reevaluate(forcePower: boolean): Promise<void> {
    await this.refreshPower(forcePower);
    const c = this.modes.config;
    const now = new Date();
    const next = effectiveInterval(c, c.checkSeconds, { ...this.power, idleSeconds: this.idleSeconds() }, now);
    const changed = !this.current || next.seconds !== this.current.seconds || next.reason !== this.current.reason || next.percent !== this.current.percent;
    this.current = next;
    if (changed) {
      this.log.appendLine(`[schedule] every ${next.seconds ?? '—'} s (${next.reason})`);
      this.emitter.fire();
    }
    this.arm();
    this.armPowerRefresh();
  }

  private arm(): void {
    clearTimeout(this.timer);
    const e = this.current;
    if (!e) return;
    if (e.seconds === null) {
      // Paused: wake up when the active window opens (re-check at least every 15 min).
      const wait = Math.min(msUntilActive(this.modes.config.activeHours, new Date()) + 1000, 15 * 60_000);
      this.timer = setTimeout(() => void this.reevaluate(false), wait);
      return;
    }
    const due = this.lastCheckAt + e.seconds * 1000 - Date.now();
    this.timer = setTimeout(() => void this.tick(), Math.max(0, due));
  }

  private armPowerRefresh(): void {
    clearTimeout(this.powerTimer);
    const c = this.modes.config;
    if (!needsPowerState(c)) return;
    this.powerTimer = setTimeout(() => void this.reevaluate(true), POWER_TTL_MS);
  }

  private async tick(): Promise<void> {
    this.lastCheckAt = Date.now();
    try {
      await this.repos.refreshAll({ fetch: true });
    } finally {
      await this.reevaluate(false);
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    clearTimeout(this.powerTimer);
    for (const d of this.disposables) d.dispose();
    this.emitter.dispose();
  }
}
