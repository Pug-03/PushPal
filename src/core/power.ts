// Reads battery level, charger, low-power mode and idle time from the OS.
// No `vscode` import: used by the extension and the background worker.
//   macOS    pmset -g batt, pmset -g (lowpowermode), ioreg HIDIdleTime
//   Windows  one PowerShell call: WinRT PowerManager + GetLastInputInfo
//   Linux    /sys/class/power_supply, powerprofilesctl, xprintidle (each optional)
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PowerState } from './frequency';

export type Exec = (file: string, args: string[]) => Promise<string | null>;

const realExec: Exec = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 8_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : String(stdout)));
  });

export function parsePmsetBatt(out: string): Pick<PowerState, 'onAC' | 'percent'> {
  const r: Pick<PowerState, 'onAC' | 'percent'> = {};
  if (/'AC Power'/.test(out)) r.onAC = true;
  else if (/'Battery Power'/.test(out)) r.onAC = false;
  const m = /(\d{1,3})%/.exec(out);
  if (m) r.percent = Number(m[1]);
  return r;
}

export function parsePmsetLowPower(out: string): boolean | undefined {
  const m = /^\s*lowpowermode\s+(\d)/m.exec(out);
  return m ? m[1] === '1' : undefined;
}

/** HIDIdleTime is in nanoseconds. */
export function parseIoregIdle(out: string): number | undefined {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(out);
  return m ? Math.floor(Number(m[1]) / 1e9) : undefined;
}

export const WINDOWS_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  '$p=[Windows.System.Power.PowerManager,Windows.System.Power,ContentType=WindowsRuntime]',
  '"pct=$($p::RemainingChargePercent)"',
  '"supply=$($p::PowerSupplyStatus)"',
  '"battery=$($p::BatteryStatus)"',
  '"saver=$($p::EnergySaverStatus)"',
  "Add-Type -Namespace PushPug -Name Idle -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct L { public uint s; public uint t; } [DllImport(\"user32.dll\")] public static extern bool GetLastInputInfo(ref L l);'",
  '$l=New-Object PushPug.Idle+L; $l.s=8',
  'if([PushPug.Idle]::GetLastInputInfo([ref]$l)){ $n=[BitConverter]::ToUInt32([BitConverter]::GetBytes([Environment]::TickCount),0); $d=[double]$n-[double]$l.t; if($d -lt 0){$d+=4294967296}; "idleMs=$d" }',
].join('\n');

export function parseWindows(out: string): PowerState {
  const kv: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const r: PowerState = {};
  if (kv.battery === 'NotPresent') r.onAC = true; // desktop PC
  else if (kv.supply === 'NotPresent') r.onAC = false;
  else if (kv.supply === 'Adequate' || kv.supply === 'Inadequate') r.onAC = true;
  if (kv.battery !== 'NotPresent' && kv.pct && /^\d+$/.test(kv.pct)) r.percent = Number(kv.pct);
  if (kv.saver === 'On') r.lowPowerMode = true;
  else if (kv.saver === 'Off' || kv.saver === 'Disabled') r.lowPowerMode = false;
  if (kv.idleMs && /^\d+(\.\d+)?$/.test(kv.idleMs)) r.idleSeconds = Math.floor(Number(kv.idleMs) / 1000);
  return r;
}

function readSys(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return undefined;
  }
}

export function readLinuxPowerSupply(base = '/sys/class/power_supply'): Pick<PowerState, 'onAC' | 'percent'> {
  let names: string[] = [];
  try {
    names = readdirSync(base);
  } catch {
    return {};
  }
  const r: Pick<PowerState, 'onAC' | 'percent'> = {};
  let hasBattery = false;
  for (const n of names) {
    const type = readSys(join(base, n, 'type'));
    if (type === 'Mains' && readSys(join(base, n, 'online')) === '1') r.onAC = true;
    if (type === 'Battery' && readSys(join(base, n, 'scope')) !== 'Device') {
      hasBattery = true;
      const cap = readSys(join(base, n, 'capacity'));
      if (cap && /^\d+$/.test(cap)) r.percent = Number(cap);
      if (readSys(join(base, n, 'status')) === 'Discharging') r.onAC = false;
    }
  }
  if (!hasBattery && r.onAC === undefined) r.onAC = true;
  if (hasBattery && r.onAC === undefined) r.onAC = false;
  return r;
}

/** Ask the OS. Anything it can't tell us stays undefined (the rule then doesn't apply). */
export async function probePower(platform: NodeJS.Platform = process.platform, exec: Exec = realExec): Promise<PowerState> {
  if (platform === 'darwin') {
    const [batt, pm, io] = await Promise.all([
      exec('pmset', ['-g', 'batt']),
      exec('pmset', ['-g']),
      exec('ioreg', ['-c', 'IOHIDSystem', '-d', '4']),
    ]);
    return {
      ...(batt ? parsePmsetBatt(batt) : {}),
      lowPowerMode: pm ? parsePmsetLowPower(pm) : undefined,
      idleSeconds: io ? parseIoregIdle(io) : undefined,
    };
  }
  if (platform === 'win32') {
    const out = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_SCRIPT]);
    return out ? parseWindows(out) : {};
  }
  const [profile, idle] = await Promise.all([exec('powerprofilesctl', ['get']), exec('xprintidle', [])]);
  return {
    ...readLinuxPowerSupply(),
    lowPowerMode: profile ? profile.trim() === 'power-saver' : undefined,
    idleSeconds: idle && /^\d+/.test(idle.trim()) ? Math.floor(Number(idle.trim()) / 1000) : undefined,
  };
}
