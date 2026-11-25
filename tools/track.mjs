#!/usr/bin/env node
// Application tracker (applications.xlsx).
//   node tools/track.mjs applied <#> [--cv cv/file.pdf]   add row # of the "To review" sheet as applied
//   node tools/track.mjs add --company X --role Y [--url U] [--location L] [--cv F] [--date D] [--status S] [--note N]
//   node tools/track.mjs update <app#> [--status S] [--next "..."] [--note "..."]
//   node tools/track.mjs list
import { P, readSeen, writeSeen, today } from './lib.mjs';
import { readShortlistRow, addApplication, updateApplication, listApplications, STATUSES } from './xlsx.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };

async function main() {
  if (cmd === 'applied') {
    const n = rest.find(a => /^\d+$/.test(a));
    const r = await readShortlistRow(P.shortlist, n);
    const num = await addApplication(P.applications, { applied: today(), company: r.company, title: r.title, location: r.location, url: r.url, match: r.match, cv: opt('cv') || '', status: 'Applied', updated: today() });
    const seen = readSeen(); seen.set(r.url, { date: today(), status: 'applied' }); writeSeen(seen);
    console.log(`Added application #${num}: ${r.company} — ${r.title}`);
  } else if (cmd === 'add') {
    const num = await addApplication(P.applications, { applied: opt('date') || today(), company: opt('company'), title: opt('role') || '', location: opt('location') || '', url: opt('url') || '', match: '', cv: opt('cv') || '', status: opt('status') || 'Applied', updated: today(), notes: opt('note') || '' });
    console.log(`Added application #${num}`);
  } else if (cmd === 'update') {
    const status = opt('status');
    if (status && !STATUSES.includes(status)) throw new Error(`Status must be one of: ${STATUSES.join(', ')}`);
    await updateApplication(P.applications, rest[0], { status, next: opt('next'), note: opt('note'), date: today() });
    console.log(`Updated application #${rest[0]}`);
  } else if (cmd === 'list') {
    for (const a of await listApplications(P.applications)) console.log(`#${a.n} ${a.company} — ${a.title} | ${a.status} | ${a.updated || ''} | ${a.next || ''}`);
  } else {
    console.log('Commands: applied <#> [--cv F] | add --company X --role Y --url U | update <#> [--status S] [--next T] [--note T] | list');
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
