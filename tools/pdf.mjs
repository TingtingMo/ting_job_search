#!/usr/bin/env node
// Markdown CV or cover letter → clean A4 PDF next to it.
// Usage: node tools/pdf.mjs data/drafts/2026-11-25-flatpay-cv.md [--out cv/2026-11-25-flatpay-cv.pdf]
// Default output: cv/<same name>.pdf. Only the PDF goes in cv/; drafts stay in data/drafts/.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { CAREER_OPS } from './lib.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');

export function mdToHtml(md) {
  const out = [];
  let list = false;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (!bullet && list) { out.push('</ul>'); list = false; }
    if (bullet) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(bullet[1])}</li>`); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 16mm 14mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 10pt; line-height: 1.38; color: #1d1d1f; }
  h1 { font-size: 19pt; margin: 0 0 2pt; letter-spacing: -0.2pt; }
  h1 + p { color: #555; margin-top: 0; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.6pt; color: #1f3a5f; border-bottom: 1px solid #c9d3df; padding-bottom: 2pt; margin: 12pt 0 5pt; }
  h3 { font-size: 10.5pt; margin: 8pt 0 1pt; }
  p { margin: 2pt 0 4pt; }
  ul { margin: 2pt 0 4pt 14pt; padding: 0; }
  li { margin: 0 0 2pt; }
  a { color: #1f3a5f; text-decoration: none; }
  h2, h3 { break-after: avoid; } li { break-inside: avoid; }
</style></head><body>${out.join('\n')}</body></html>`;
}

async function main() {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) { console.error('Usage: node tools/pdf.mjs <file.md>'); process.exit(1); }
  const html = mdToHtml(fs.readFileSync(src, 'utf8'));
  const require = createRequire(path.join(CAREER_OPS, 'package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const i = process.argv.indexOf('--out');
  const outFile = i > 0 ? process.argv[i + 1] : path.join(path.dirname(path.dirname(path.dirname(path.resolve(src)))), 'cv', path.basename(src).replace(/\.md$/, '.pdf'));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await page.pdf({ path: outFile, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log(`PDF saved: ${outFile}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
