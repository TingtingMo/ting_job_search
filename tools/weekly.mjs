#!/usr/bin/env node
// Weekly report from applications.xlsx → weekly-reports/<date>.md (Obsidian-friendly Markdown).
// "This week" = Monday of the current week up to today.
// Usage: node tools/weekly.mjs [--date YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { P, ROOT, today } from './lib.mjs';
import { listApplications } from './xlsx.mjs';

const INTERVIEW = ['Initial call', 'Interview', 'Offer'];
const str = (v) => (v instanceof Date ? today(v) : String(v ?? '').trim());

export function weekStart(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function buildReport(apps, date) {
  const from = weekStart(date);
  const inWeek = (d) => { const s = str(d); return s >= from && s <= date; };
  const rows = apps.map(a => ({ ...a, applied: str(a.applied), updated: str(a.updated), status: str(a.status) }));
  const line = (a, extra = '') => `| ${a.company} | ${a.title || ''} | ${extra} |`;
  const table = (list, head, cell) => list.length
    ? [`| Company | Role | ${head} |`, '|---|---|---|', ...list.map(a => line(a, cell(a)))].join('\n')
    : '_None._';

  const applied = rows.filter(a => inWeek(a.applied));
  const rejected = rows.filter(a => a.status === 'Rejected' && inWeek(a.updated));
  const interviews = rows.filter(a => INTERVIEW.includes(a.status) && inWeek(a.updated));
  const waiting = rows.filter(a => a.status === 'Applied');
  const allInterviews = rows.filter(a => INTERVIEW.includes(a.status));

  return [
    `# Job search report ${date}`,
    '',
    `Week ${from} to ${date}.`,
    '',
    `## Applied this week (${applied.length})`, '', table(applied, 'Applied on', a => a.applied), '',
    `## Rejections this week (${rejected.length})`, '', table(rejected, 'Date', a => a.updated), '',
    `## Interviews and calls this week (${interviews.length})`, '', table(interviews, 'Next step', a => a.next || a.status), '',
    `## Still waiting (${waiting.length})`, '', table(waiting, 'Applied on', a => a.applied), '',
    '## Total so far', '',
    '| Applied | Rejected | Interviews and calls | Waiting |',
    '|---|---|---|---|',
    `| ${rows.length} | ${rows.filter(a => a.status === 'Rejected').length} | ${allInterviews.length} | ${waiting.length} |`,
    '',
    allInterviews.length ? `Interviews and calls so far: ${allInterviews.map(a => `${a.company} (${a.title})`).join(', ')}.` : 'No interviews or calls yet.',
    '',
  ].join('\n');
}

async function main() {
  const i = process.argv.indexOf('--date');
  const date = i > 0 ? process.argv[i + 1] : today();
  const md = buildReport(await listApplications(P.applications), date);
  const dir = path.join(ROOT, 'weekly-reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${date}.md`);
  fs.writeFileSync(file, md);
  console.log(`Saved weekly-reports/${date}.md`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
