// Builds the public privacy policy page (store/privacy-site/index.html) from PRIVACY.md, so there is one text to keep up to date.
//   node tools/build-privacy-page.mjs
// Publish the contents of store/privacy-site (for example with GitHub Pages) and put its address in the Play Console. It understands only
// the few Markdown pieces PRIVACY.md uses: headings, paragraphs, bullet and numbered lists, tables, **bold**, *italic*, `code`, [links](url).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const md = readFileSync(resolve(root, 'PRIVACY.md'), 'utf8').replace(/\r\n/g, '\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (raw) => {
  let s = esc(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s;
};
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const lines = md.split('\n');
const out = [];
let title = 'Privacy';
let i = 0;
const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  let m;
  if ((m = line.match(/^# (.+)/))) {
    title = m[1];
    out.push(`<h1>${inline(m[1])}</h1>`);
    i++;
  } else if ((m = line.match(/^## (.+)/))) {
    out.push(`<h2 id="${slug(m[1])}">${inline(m[1])}</h2>`);
    i++;
  } else if ((m = line.match(/^### (.+)/))) {
    out.push(`<h3>${inline(m[1])}</h3>`);
    i++;
  } else if (isTableRow(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    const head = cells(line);
    i += 2;
    const rows = [];
    while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
    out.push('<div class="table-wrap"><table><thead><tr>' + head.map((h) => `<th scope="col">${inline(h)}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + r.map((c, k) => (k === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('') + '</tr>').join('') + '</tbody></table></div>');
  } else if (/^\s*[-*] /.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
      let text = lines[i].replace(/^\s*[-*] /, '');
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*] /.test(lines[i])) text += ' ' + lines[i++].trim();
      items.push(text);
    }
    out.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
  } else if (/^\s*\d+\. /.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*\d+\. /.test(lines[i])) {
      let text = lines[i].replace(/^\s*\d+\. /, '');
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+\. /.test(lines[i])) text += ' ' + lines[i++].trim();
      items.push(text);
    }
    out.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
  } else {
    let text = line.trim();
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#|\s*[-*] |\s*\d+\. |\s*\|)/.test(lines[i])) text += ' ' + lines[i++].trim();
    out.push(`<p>${inline(text)}</p>`);
  }
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Minimal Fitness privacy policy</title>
<meta name="description" content="What Minimal Fitness does with your data: it stays on your phone.">
<style>
  :root { --bg: #ffffff; --ink: #202124; --dim: #5f6368; --line: #dadce0; --card: #f8f9fa; --accent: #1a5fd0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #17181c; --ink: #e8eaed; --dim: #9aa0a6; --line: #3c4043; --card: #202124; --accent: #8ab4f8; } }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
  h1 { font-size: 1.7rem; line-height: 1.25; margin: 0.5rem 0 1rem; }
  h2 { font-size: 1.2rem; margin: 2rem 0 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--line); }
  p, li { max-width: 42rem; }
  a { color: var(--accent); }
  code { font: 0.9em ui-monospace, Consolas, monospace; background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 0 0.25em; word-break: break-word; }
  .table-wrap { overflow-x: auto; margin: 1rem 0; border: 1px solid var(--line); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; min-width: 34rem; font-size: 0.92rem; }
  th, td { text-align: left; vertical-align: top; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--line); }
  thead th { background: var(--card); }
  tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
  tbody th { font-weight: 600; }
  footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--dim); font-size: 0.85rem; }
</style>
</head>
<body>
<main>
${out.join('\n')}
<footer>Minimal Fitness is an independent app and is not affiliated with or endorsed by Google. Android and Google Play are trademarks of Google LLC.</footer>
</main>
</body>
</html>
`;

const dir = resolve(root, 'store', 'privacy-site');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'index.html'), page, 'utf8');
// GitHub Pages would otherwise run this folder through Jekyll; it is plain HTML.
writeFileSync(resolve(dir, '.nojekyll'), '', 'utf8');
console.log(`Wrote store/privacy-site/index.html (${out.length} blocks, title "${title}")`);
if (md.includes('[CONTACT EMAIL]')) console.warn('\nNOTE: PRIVACY.md still contains [CONTACT EMAIL]. Put a real address there before publishing.');
