// Facts about the running VS Code installation: where its Electron binary
// (usable as Node via ELECTRON_RUN_AS_NODE=1) and its CLI live.
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

interface Product {
  nameShort?: string;
  darwinBundleIdentifier?: string;
  win32AppUserModelId?: string;
}

let product: Product | undefined;
export function productJson(): Product {
  if (!product) {
    try {
      product = JSON.parse(readFileSync(join(vscode.env.appRoot, 'product.json'), 'utf8')) as Product;
    } catch {
      product = {};
    }
  }
  return product;
}

/** The Electron executable that can run plain Node scripts. */
export function electronNodePath(): string {
  if (process.platform === 'darwin') {
    // appRoot = <App>.app/Contents/Resources/app; the extension host's own
    // execPath is a "Helper (Plugin)" binary, so use the main executable.
    const macOsDir = join(vscode.env.appRoot, '..', '..', 'MacOS');
    try {
      const names = readdirSync(macOsDir);
      const main = names.find((n) => n === (productJson().nameShort ?? 'Code')) ?? names[0];
      if (main) return join(macOsDir, main);
    } catch {
      /* fall back */
    }
  }
  return process.execPath;
}

export function cliScript(): string {
  return join(vscode.env.appRoot, 'out', 'cli.js');
}

/** The .app bundle on macOS, e.g. /Applications/Visual Studio Code.app */
export function macAppBundle(): string {
  return dirname(dirname(dirname(vscode.env.appRoot)));
}

/**
 * Bring this window to the front. Opening the window's own folder (or
 * .code-workspace) through the VS Code CLI focuses the existing window.
 */
export function focusThisWindow(): void {
  const target = vscode.workspace.workspaceFile?.scheme === 'file'
    ? vscode.workspace.workspaceFile.fsPath
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!target) {
    if (process.platform === 'darwin') execFile('open', ['-a', macAppBundle()], () => undefined);
    return;
  }
  execFile(electronNodePath(), [cliScript(), target], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true }, () => undefined);
}
