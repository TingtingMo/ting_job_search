// Shared helpers for ting_job_search. Plain Node, no AI calls.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Career-Ops location: CAREER_OPS_DIR, else a sibling folder, else ~/career-ops.
const careerOpsCandidates = [process.env.CAREER_OPS_DIR, path.join(ROOT, '..', 'career-ops'), path.join(os.homedir(), 'career-ops'), path.join(os.homedir(), 'mnt', 'career-ops')].filter(Boolean);
export const CAREER_OPS = path.resolve(careerOpsCandidates.find(d => fs.existsSync(path.join(d, 'scan.mjs'))) || careerOpsCandidates.at(-1));
export const P = {
  targets: path.join(ROOT, 'profile', 'target-positions.md'),
  sites: path.join(ROOT, 'my-sites.md'),
  scanRoot: path.join(ROOT, 'data', 'scan'),
  portals: path.join(ROOT, 'data', 'scan', 'portals.yml'),
  history: path.join(ROOT, 'data', 'scan', 'data', 'scan-history.tsv'),
  seen: path.join(ROOT, 'data', 'seen.csv'),
  jds: path.join(ROOT, 'data', 'jds'),
  candidates: path.join(ROOT, 'data', 'candidates.json'),
  scores: path.join(ROOT, 'data', 'scores.json'),
  shortlist: path.join(ROOT, 'shortlist.xlsx'),
  applications: path.join(ROOT, 'applications.xlsx'),
};

export const careerOps = (rel) => import(pathToFileURL(path.join(CAREER_OPS, rel)).href);

export function today(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

// ── target-positions.md ────────────────────────────────────────────
/** Parse the four lists out of target-positions.md. */
export function parseTargets(text) {
  const out = { main: [], ok: [], skipTitles: [], locations: [], skipLocations: [] };
  let section = '', sub = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^##\s/.test(line)) { section = line.replace(/^##\s+/, '').trim().toLowerCase(); sub = ''; continue; }
    if (/^###\s/.test(line)) { sub = line.replace(/^###\s+/, '').trim().toLowerCase(); continue; }
    const m = line.match(/^-\s+(.*)$/);
    if (!m) continue;
    const item = m[1].replace(/\s+$/, (s) => (section.startsWith('titles to skip') ? s.replace(/[^ ]/g, '') : ''));
    if (!item.trim()) continue;
    if (section.startsWith('titles to include')) (sub.startsWith('main') ? out.main : out.ok).push(item.trim());
    else if (section.startsWith('titles to skip')) out.skipTitles.push(item.replace(/\s{2,}$/, ' '));
    else if (section.startsWith('locations to skip')) out.skipLocations.push(item.trim());
    else if (section.startsWith('locations')) out.locations.push(item.split('/').map(s => s.trim()).filter(Boolean));
  }
  return out;
}

// ── my-sites.md ────────────────────────────────────────────────────
function tableRows(text, heading) {
  const start = text.toLowerCase().indexOf(`## ${heading}`);
  if (start < 0) return [];
  const rest = text.slice(start).split('\n').slice(1);
  const rows = [];
  for (const line of rest) {
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (cells.every(c => /^-*$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // drop header row
}
const on = (v) => /^(yes|y|on|true|1)$/i.test(String(v || '').trim());

export function parseSites(text) {
  const boards = tableRows(text, 'job boards').map(([name, scan]) => ({ name, scan: on(scan) }));
  const companies = tableRows(text, 'company career pages')
    .filter(c => c[0] && c[1])
    .map(([name, url, scan, provider, notes]) => ({ name, url, scan: on(scan), provider: provider || '', notes: notes || '' }));
  return { boards, companies };
}

// ── board definitions (fixed; switched on/off from my-sites.md) ─────
const REMOTE = ['workingnomads', 'remoteok', 'weworkremotely', 'remotive', 'jobicy', 'himalayas', 'arbeitnow', 'jobspresso', 'nodesk'];
export const BOARDS = {
  'the hub — denmark': [{ name: 'The Hub — Denmark', provider: 'thehub', max_pages: 5, thehub: { countryCode: 'DK' } }],
  'the hub — sweden': [{ name: 'The Hub — Sweden', provider: 'thehub', max_pages: 5, thehub: { countryCode: 'SE' } }],
  'platsbanken': [{
    name: 'Platsbanken', provider: 'platsbanken',
    platsbanken: { keywords: ['data analyst', 'business analyst', 'BI analyst', 'business intelligence', 'Power BI', 'product analyst', 'marketing analyst', 'growth analyst', 'operations analyst', 'data operations', 'analytics consultant', 'analytics engineer', 'data scientist'] },
  }],
  'work in sweden': [{
    name: 'Work in Sweden', careers_url: 'https://jobs.workinsweden.com/jobs/?job_category=business-operations',
    scan_method: 'local_parser',
    parser: { command: 'node', script: 'local/workinsweden-jobs.mjs', args: ['{careers_url}'], format: 'jobs-json-v1' },
  }],
  'remote boards': REMOTE.map(p => ({ name: p, provider: p })),
};

/** Build the scanner's portals.yml object from the two files you edit. */
export function buildPortals(targets, sites) {
  const boards = [];
  for (const b of sites.boards) {
    const defs = BOARDS[b.name.toLowerCase()];
    if (defs && b.scan) boards.push(...defs.map(d => ({ ...d, enabled: true })));
  }
  const companies = sites.companies.filter(c => c.scan).map(c => {
    const e = { name: c.name, careers_url: c.url, enabled: true };
    if (c.provider) e.provider = c.provider;
    if (c.provider && /\/api\/|api\./.test(c.url)) e.api = c.url;
    return e;
  });
  const places = targets.locations.flat();
  return {
    title_filter: { positive: [...targets.main, ...targets.ok], negative: targets.skipTitles },
    location_filter: {
      always_allow: places.filter(p => !/^remote$/i.test(p)),
      block: targets.skipLocations,
      allow: places,
    },
    max_posting_age_days: 14,
    job_boards: boards,
    tracked_companies: companies,
  };
}

// ── ranking (free, before any AI reads a job ad) ───────────────────
const wordRe = (t) => new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
export function locationRank(location, targets) {
  for (let i = 0; i < targets.locations.length; i++) {
    if (targets.locations[i].some(n => wordRe(n).test(location || ''))) return i + 1;
  }
  return targets.locations.length + 1;
}
export function titleTier(title, targets) {
  const t = (title || '').toLowerCase();
  if (targets.main.some(k => t.includes(k.toLowerCase()))) return 2;
  if (targets.ok.some(k => t.includes(k.toLowerCase()))) return 1;
  return 0;
}
export function preScore(job, targets, now = new Date()) {
  const tier = titleTier(job.title, targets);
  const loc = locationRank(job.location, targets);
  const posted = Date.parse(job.posted || job.found || '');
  const ageDays = Number.isNaN(posted) ? 3 : (now - posted) / 864e5;
  const fresh = ageDays <= 1 ? 2 : ageDays <= 3 ? 1 : 0;
  const junior = /\bjunior\b|\bgraduate\b|\btrainee\b/i.test(job.title || '') ? 3 : 0;
  return tier * 10 + (8 - loc) + fresh - junior;
}

// ── seen list (so a job is shown once) ─────────────────────────────
export function readSeen() {
  if (!fs.existsSync(P.seen)) return new Map();
  const m = new Map();
  for (const line of fs.readFileSync(P.seen, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [url, date, status] = line.split('\t');
    m.set(url, { date, status });
  }
  return m;
}
export function writeSeen(map) {
  const lines = ['url\tdate\tstatus', ...[...map].map(([u, v]) => `${u}\t${v.date}\t${v.status}`)];
  fs.mkdirSync(path.dirname(P.seen), { recursive: true });
  fs.writeFileSync(P.seen, lines.join('\n') + '\n');
}

export function readHistoryAdded() {
  if (!fs.existsSync(P.history)) return [];
  const lines = fs.readFileSync(P.history, 'utf8').split('\n');
  const head = lines[0].split('\t');
  const col = (r, n) => r[head.indexOf(n)] || '';
  return lines.slice(1).filter(Boolean).map(l => l.split('\t'))
    .filter(r => col(r, 'status') === 'added')
    .map(r => ({ url: col(r, 'url'), found: col(r, 'first_seen'), source: col(r, 'portal'), title: col(r, 'title'), company: col(r, 'company'), location: col(r, 'location'), posted: col(r, 'posted_at') }));
}

/** Turn job-ad HTML into plain text (fallback for boards with no API). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
