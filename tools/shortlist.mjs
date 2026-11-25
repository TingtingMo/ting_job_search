#!/usr/bin/env node
// Updates shortlist.xlsx: new jobs go to the top of "To review"; applied, skipped and expired rows move to "Done".
// Usage: node tools/shortlist.mjs [--max 20] [--min 3] [--refresh]   (--refresh: only tidy, add no new jobs)
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { P, readSeen, writeSeen, today } from './lib.mjs';
import { writeShortlist, appliedKeys } from './xlsx.mjs';

const argv = process.argv.slice(2);
const MAX = Number(argv[argv.indexOf('--max') + 1]) || 20;
const MIN = Number(argv[argv.indexOf('--min') + 1]) || 3;

export function pick(candidates, scores, max = MAX, min = MIN) {
  return candidates
    .filter(c => c.open !== 'Closed')
    .map(c => ({ ...c, match: Number(scores[c.id]?.match) || 0, why: scores[c.id]?.why || '' }))
    .filter(c => c.match >= min)
    .sort((a, b) => b.match - a.match || b.preScore - a.preScore)
    .slice(0, max);
}

async function main() {
  const refresh = argv.includes('--refresh');
  let date = today(), rows = [], candidates = [];
  if (!refresh) {
    const data = JSON.parse(fs.readFileSync(P.candidates, 'utf8'));
    date = data.date || today(); candidates = data.candidates;
    const scores = JSON.parse(fs.readFileSync(P.scores, 'utf8') || '{}');
    const unscored = candidates.filter(c => c.open !== 'Closed' && !scores[c.id]);
    if (unscored.length) console.log(`Note: ${unscored.length} jobs have no score yet and are left out: ${unscored.map(c => c.id).join(', ')}`);
    rows = pick(candidates, scores).map(r => ({ ...r, found: date }));
  }
  const res = await writeShortlist(P.shortlist, date, rows, await appliedKeys(P.applications));
  if (!refresh) {
    const seen = readSeen();
    const shown = new Set(rows.map(r => r.url));
    for (const c of candidates) if (!seen.has(c.url)) seen.set(c.url, { date, status: shown.has(c.url) ? 'shortlisted' : 'not shown' });
    writeSeen(seen);
  }
  console.log(`shortlist.xlsx: ${res.added} new (match ${MIN}+) at the top of "To review", ${res.review} rows to review, ${res.moved} moved to "Done".`);
  if (res.waiting.length) console.log(`Marked to apply, not applied yet: ${res.waiting.map(r => `${r.company} (${r.title})`).join('; ')}`);
  if (process.platform === 'darwin' && !argv.includes('--no-open')) spawn('open', [P.shortlist], { detached: true, stdio: 'ignore' }).unref();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
