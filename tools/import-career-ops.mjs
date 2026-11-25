#!/usr/bin/env node
// One-off: copy Career-Ops' data/applications.md into applications.xlsx.
// Skips rows already imported (same company + role). Usage: node tools/import-career-ops.mjs
import fs from 'node:fs';
import path from 'node:path';
import { P, CAREER_OPS, today } from './lib.mjs';
import { addApplication, listApplications } from './xlsx.mjs';

export function parseTracker(md) {
  return md.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l)).map(l => {
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
    const [n, date, company, title, score, status, , , notes = ''] = c;
    const applied = (notes.match(/Applied (\d{4}-\d{2}-\d{2})/) || [])[1] || date;
    const dates = [...notes.matchAll(/(?:Applied|received|marked \w+)\s+(\d{4}-\d{2}-\d{2})/g)].map(m => m[1]).sort();
    const cv = (notes.match(/output\/[\w.\-]+\.pdf/) || [])[0] || '';
    const fit = (score.match(/[\d.]+/) || notes.match(/fit ~([\d.]+)/) || [])[1] ?? (score.match(/[\d.]+/) || [])[0];
    return { n: Number(n), applied, company: company === '?' ? '(not named)' : company, title, status,
      updated: dates.filter(d => d <= today()).at(-1) || applied, match: fit ? Number(fit) : '', cv: cv ? `career-ops/${cv}` : '',
      notes: `From Career-Ops tracker #${n}. ${notes}` };
  });
}

async function main() {
  const rows = parseTracker(fs.readFileSync(path.join(CAREER_OPS, 'data', 'applications.md'), 'utf8'));
  const have = new Set((await listApplications(P.applications)).map(a => `${a.company}::${a.title}`));
  let added = 0;
  for (const r of rows.sort((a, b) => a.applied.localeCompare(b.applied) || a.n - b.n)) {
    if (have.has(`${r.company}::${r.title}`)) continue;
    await addApplication(P.applications, { applied: r.applied, company: r.company, title: r.title, location: '', url: '', match: r.match, cv: r.cv, status: r.status, updated: r.updated, next: '', notes: r.notes });
    added++;
  }
  console.log(`Imported ${added} of ${rows.length} applications from Career-Ops.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
