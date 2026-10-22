import * as vscode from 'vscode';
import { LIMITS, clampConfig, presetConfig, reconcileMode, type Adjustment, type FrequencyConfig, type Mode } from '../core/frequency';
import { FREQUENCY_SETTING_IDS, readFrequency, readMode, readRawFrequency, setField, writeFrequency, writeMode, type FrequencyField } from './settings';
import { t } from './l10n';

/**
 * Keeps `pushpal.mode` and the individual values in step, in both directions:
 *  - picking a preset writes its values into the settings,
 *  - editing any value by hand (Settings UI, settings.json, the settings page)
 *    turns the mode into "custom",
 *  - values outside the allowed range are pulled back in and the user is told.
 */
export class ModeController implements vscode.Disposable {
  private applying = 0;
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private readonly sub: vscode.Disposable;

  constructor(private readonly log: vscode.OutputChannel) {
    this.sub = vscode.workspace.onDidChangeConfiguration((e) => void this.onConfig(e));
  }

  get mode(): Mode {
    return readMode();
  }

  get config(): FrequencyConfig {
    return readFrequency().config;
  }

  /** Run once on activation: fix out-of-range values and a stale mode. */
  async init(): Promise<void> {
    await this.normalize(true);
  }

  async setMode(mode: Mode): Promise<void> {
    await this.apply(async () => {
      await writeMode(mode);
      if (mode !== 'custom') await writeFrequency(presetConfig(mode, this.config.activeHours));
    });
  }

  /** Change some values (from the settings page). Returns what had to be clamped. */
  async setValues(patch: Partial<Record<FrequencyField, unknown>>): Promise<Adjustment[]> {
    const raw = readRawFrequency();
    for (const [f, v] of Object.entries(patch)) setField(raw, f as FrequencyField, v);
    const { config, adjustments } = clampConfig(raw);
    await this.apply(async () => {
      await writeFrequency(config);
      const next = reconcileMode(readMode(), config);
      if (next !== readMode()) await writeMode(next);
    });
    return adjustments;
  }

  private async apply(fn: () => Promise<void>): Promise<void> {
    this.applying++;
    try {
      await fn();
    } finally {
      this.applying--;
    }
    this.emitter.fire();
  }

  private async onConfig(e: vscode.ConfigurationChangeEvent): Promise<void> {
    const modeChanged = e.affectsConfiguration('pushpal.mode');
    const valuesChanged = FREQUENCY_SETTING_IDS.some((id) => e.affectsConfiguration(id));
    if (!modeChanged && !valuesChanged) return;
    if (this.applying > 0) return;
    if (modeChanged && readMode() !== 'custom') {
      // Mode picked in the Settings UI: bring the values along.
      await this.setMode(readMode());
      return;
    }
    await this.normalize(true);
  }

  private async normalize(announce: boolean): Promise<void> {
    const { config, adjustments } = readFrequency();
    const next = reconcileMode(readMode(), config);
    if (adjustments.length === 0 && next === readMode()) {
      this.emitter.fire();
      return;
    }
    await this.apply(async () => {
      if (adjustments.length) await writeFrequency(config);
      if (next !== readMode()) await writeMode(next);
    });
    if (adjustments.length) {
      this.log.appendLine(`[settings] clamped ${adjustments.map((a) => `${a.key}: ${a.from} → ${a.to}`).join(', ')}`);
      if (announce) void vscode.window.showWarningMessage(describeAdjustments(adjustments));
    }
  }

  dispose(): void {
    this.sub.dispose();
    this.emitter.dispose();
  }
}

export function describeAdjustments(adj: Adjustment[]): string {
  return adj
    .map((a) =>
      a.min !== undefined
        ? t('clamp.number', t(`field.${a.key}` as 'field.checkSeconds'), String(a.from), a.to, a.min, a.max ?? '')
        : t('clamp.time', t(`field.${a.key}` as 'field.checkSeconds'), String(a.from), a.to),
    )
    .join(' ');
}

export { LIMITS };
