import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { webviewStrings, type Lang } from '../i18n';
import type { ThemeSetting } from './settings';

export interface PageOptions {
  title: string;
  lang: Lang;
  theme: ThemeSetting;
  /** "panel" for editor-area pages (wizard), "sidebar" for the view. */
  surface: 'panel' | 'sidebar';
  styles: string[];
  scripts: string[];
  init: unknown;
}

export function themeClasses(theme: ThemeSetting, surface: 'panel' | 'sidebar'): string {
  return `theme-${theme} surface-${surface}`;
}

/** JSON that is safe inside a <script type="application/json"> block. */
function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Page shell with a strict Content Security Policy: no inline styles or
 * scripts except our nonce'd ones, no remote content, images only from the
 * extension folder or data: URIs.
 */
export function renderPage(webview: vscode.Webview, extensionUri: vscode.Uri, o: PageOptions): string {
  const nonce = randomBytes(16).toString('base64');
  const media = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', f)).toString();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="${o.lang}" class="${themeClasses(o.theme, o.surface)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
${['base.css', ...o.styles].map((s) => `<link rel="stylesheet" href="${media(s)}">`).join('\n')}
</head>
<body>
<div id="app"></div>
<script type="application/json" id="pp-init" nonce="${nonce}">${safeJson(o.init)}</script>
${['mascot.js', ...o.scripts].map((s) => `<script nonce="${nonce}" src="${media(s)}"></script>`).join('\n')}
</body>
</html>`;
}

export function stringsFor(lang: Lang): Record<string, string> {
  return webviewStrings(lang);
}
