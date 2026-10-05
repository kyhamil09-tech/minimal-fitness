// Builds the desktop viewer into ONE html file that opens straight from disk and works offline.
// Run: npm run viewer   ->   dist-viewer/ky-fitness-viewer.html
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'dist-viewer');
mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [resolve(here, 'main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  logLevel: 'warning',
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(here, 'viewer.css'), 'utf8');

// The policy forbids every network connection, so the page cannot send your file anywhere even by mistake.
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Minimal Fitness viewer</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`;
const file = resolve(out, 'ky-fitness-viewer.html');
writeFileSync(file, html);
console.log(`Wrote ${file} (${Math.round(html.length / 1024)} KB)`);
