// Tests for ting_job_search. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { P, parseTargets, parseSites, buildPortals, preScore, locationRank } from './lib.mjs';
import { pick } from './shortlist.mjs';
import { readJob } from './scan.mjs';
import { writeShortlist, readShortlistRow, appliedKeys, addApplication, updateApplication, listApplications } from './xlsx.mjs';
import { mdToHtml } from './pdf.mjs';

const targets = parseTargets(fs.readFileSync(P.targets, 'utf8'));
const sites = parseSites(fs.readFileSync(P.sites, 'utf8'));

test('target-positions.md is read correctly', () => {
  assert.ok(targets.main.includes('Data Analyst'));
  assert.ok(targets.ok.includes('Data Scientist'));
  assert.ok(targets.skipTitles.includes('Java '), 'trailing space kept, so "JavaScript" is not skipped');
  assert.ok(!targets.skipTitles.includes('Junior'), 'junior roles reach scoring');
  assert.equal(targets.locations[0][0], 'Copenhagen');
  assert.equal(locationRank('Stockholm, Sweden', targets), 2);
  assert.equal(locationRank('København K', targets), 1);
  assert.equal(locationRank('Berlin', targets), 7);
});

test('my-sites.md turns into scanner config', () => {
  const cfg = buildPortals(targets, sites);
  assert.deepEqual(cfg.job_boards.slice(0, 4).map(b => b.name), ['The Hub — Denmark', 'The Hub — Sweden', 'Platsbanken', 'Work in Sweden']);
  assert.equal(cfg.job_boards.filter(b => b.provider === 'remotive').length, sites.boards.find(b => b.name === 'Remote boards')?.scan ? 1 : 0);
  assert.ok(cfg.tracked_companies.length > 50);
  assert.ok(!cfg.location_filter.always_allow.includes('Remote'), '"Remote - US" must not bypass the skip list');
  assert.equal(cfg.max_posting_age_days, 14);
  const off = buildPortals(targets, { boards: [{ name: 'Platsbanken', scan: false }], companies: [{ name: 'X', url: 'https://jobs.lever.co/x', scan: false }] });
  assert.equal(off.job_boards.length, 0);
  assert.equal(off.tracked_companies.length, 0);
});

test('free ranking puts best title + location first', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  const a = preScore({ title: 'Data Analyst', location: 'Copenhagen', posted: '2026-11-25' }, targets, now);
  const b = preScore({ title: 'Data Scientist', location: 'Malmö', posted: '2026-11-25' }, targets, now);
  const c = preScore({ title: 'Junior Data Analyst', location: 'Copenhagen', posted: '2026-11-25' }, targets, now);
  assert.ok(a > b && a > c);
});

test('shortlist keeps open jobs with match 3+, best first, max 20', () => {
  const cands = Array.from({ length: 30 }, (_, i) => ({ id: `d-${i}`, url: `u${i}`, open: i === 0 ? 'Closed' : 'Open', preScore: i }));
  const scores = Object.fromEntries(cands.map((c, i) => [c.id, { match: i % 5 + 1, why: 'x' }]));
  const rows = pick(cands, scores, 20, 3);
  assert.ok(rows.length <= 20);
  assert.ok(rows.every(r => r.match >= 3 && r.open !== 'Closed'));
  assert.ok(rows[0].match === 5);
});

test('job ad reading: closed, open via API', async () => {
  const closed = await readJob('https://job-boards.greenhouse.io/x/jobs/1', { checkLivenessViaApi: async () => ({ result: 'expired' }), fetchJdViaKnownApi: async () => null });
  assert.equal(closed.open, 'Closed');
  const open = await readJob('https://job-boards.greenhouse.io/x/jobs/2', { checkLivenessViaApi: async () => ({ result: 'active' }), fetchJdViaKnownApi: async () => ({ text: 'Data Analyst at X' }) });
  assert.equal(open.open, 'Open');
  assert.match(open.text, /Data Analyst/);
});

test('Excel: To review / Done, then applied, then status update', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ting-'));
  const sl = path.join(dir, 'shortlist.xlsx');
  const ap = path.join(dir, 'applications.xlsx');
  const job = (id, found, company, url, match) => ({ id, found, company, title: 'Data Analyst', location: 'Copenhagen', url, match, why: 'x', open: 'Open' });
  await writeShortlist(sl, '2026-11-11', [job('old', '2026-11-11', 'Oldco', 'https://jobs.example/0', 3)]);
  await writeShortlist(sl, '2026-11-25', [job('a', '2026-11-25', 'Flatpay', 'https://jobs.example/1', 5)]);
  let res = await writeShortlist(sl, '2026-11-26', [job('b', '2026-11-26', 'Klarna', 'https://jobs.example/2', 4), job('a', '2026-11-26', 'Flatpay', 'https://jobs.example/1', 5)]);
  assert.equal(res.added, 1);       // Flatpay is not added twice
  assert.equal(res.moved, 1);       // Oldco expired after 14 days with no decision
  const row = await readShortlistRow(sl, 1);
  assert.equal(row.company, 'Klarna'); // newest first
  const n = await addApplication(ap, { applied: '2026-11-26', company: row.company, title: row.title, location: row.location, url: row.url, match: row.match, cv: 'cv/x.pdf', status: 'Applied', updated: '2026-11-26' });
  assert.equal(n, 1);
  res = await writeShortlist(sl, '2026-11-27', [], await appliedKeys(ap));
  assert.equal(res.moved, 1);       // Klarna applied -> Done
  assert.equal((await readShortlistRow(sl, 1)).company, 'Flatpay');
  await updateApplication(ap, 1, { status: 'Initial call', next: 'Call Mon 10:00', note: 'Recruiter emailed', date: '2026-11-27' });
  const list = await listApplications(ap);
  assert.equal(list[0].status, 'Initial call');
  assert.equal(list[0].next, 'Call Mon 10:00');
});

test('CV markdown becomes HTML for the PDF', () => {
  const html = mdToHtml('# Tingting Mo\n\n## Experience\n- Cut cost by **14%**\n- Two\n\nText & more');
  assert.match(html, /<h1>Tingting Mo<\/h1>/);
  assert.match(html, /<ul>\n<li>Cut cost by <strong>14%<\/strong><\/li>/);
  assert.match(html, /Text &amp; more/);
});

test('weekly report counts this week and totals', async () => {
  const { buildReport, weekStart } = await import('./weekly.mjs');
  assert.equal(weekStart('2026-11-25'), '2026-11-23');
  assert.equal(weekStart('2026-11-29'), '2026-11-23');
  const md = buildReport([
    { company: 'A', title: 'Data Analyst', applied: '2026-11-24', status: 'Applied', updated: '2026-11-24' },
    { company: 'B', title: 'BI', applied: '2026-11-10', status: 'Rejected', updated: '2026-11-25' },
    { company: 'C', title: 'Growth', applied: '2026-11-12', status: 'Interview', updated: '2026-11-24', next: 'Call Fri' },
    { company: 'D', title: 'Old', applied: '2026-11-01', status: 'Rejected', updated: '2026-11-05' },
  ], '2026-11-25');
  assert.match(md, /## Applied this week \(1\)/);
  assert.match(md, /## Rejections this week \(1\)/);
  assert.match(md, /## Interviews and calls this week \(1\)/);
  assert.match(md, /\| 4 \| 2 \| 1 \| 1 \|/);
  assert.match(md, /Call Fri/);
});
