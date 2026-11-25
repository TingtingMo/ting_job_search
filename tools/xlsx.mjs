// Excel helpers: the shortlist (To review / Done) and the application tracker.
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
const HEAD_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
export const DECISIONS = ['Tailor CV', 'Apply as is', 'Skip'];
export const STATUSES = ['Applied', 'Initial call', 'Interview', 'Offer', 'Rejected', 'No response', 'Withdrawn'];

export async function openBook(file) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(file)) await wb.xlsx.readFile(file);
  return wb;
}

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.eachCell(c => { c.fill = HEAD_FILL; c.font = HEAD_FONT; c.alignment = { vertical: 'middle', wrapText: true }; });
  row.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
function dropdown(ws, col, from, to, list) {
  for (let r = from; r <= to; r++) {
    ws.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${list.join(',')}"`] };
  }
}
function link(cell, url, text = 'Open') {
  cell.value = { text, hyperlink: url };
  cell.font = { color: { argb: 'FF0563C1' }, underline: true };
}

export const REVIEW = 'To review';
export const DONE = 'Done';
const EXPIRE_DAYS = 14;
const SL_COLS = [
  { header: '#', key: 'n', width: 4 },
  { header: 'Found', key: 'found', width: 11 },
  { header: 'Company', key: 'company', width: 22 },
  { header: 'Role', key: 'title', width: 38 },
  { header: 'Location', key: 'location', width: 22 },
  { header: 'Link', key: 'url', width: 8 },
  { header: 'Match (1–5)', key: 'match', width: 11 },
  { header: 'Why', key: 'why', width: 48 },
  { header: 'Open?', key: 'open', width: 13 },
  { header: 'My decision', key: 'decision', width: 14 },
  { header: 'Remark', key: 'remark', width: 30 },
  { header: 'ID', key: 'id', width: 13 },
];
const DONE_COLS = [...SL_COLS.slice(1), { header: 'Outcome', key: 'outcome', width: 10 }, { header: 'Moved on', key: 'moved', width: 11 }];
const HEAD_KEYS = { '#': 'n', found: 'found', company: 'company', role: 'title', location: 'location', link: 'url', 'match (1–5)': 'match', match: 'match', why: 'why', 'open?': 'open', 'my decision': 'decision', remark: 'remark', id: 'id', outcome: 'outcome', 'moved on': 'moved' };

const cellVal = (c) => {
  const v = c.value;
  if (v && typeof v === 'object') { if ('hyperlink' in v) return v.hyperlink; if (v instanceof Date) return v.toISOString().slice(0, 10); if ('text' in v) return v.text; if ('result' in v) return v.result; }
  return v ?? '';
};
function readRows(ws) {
  if (!ws) return [];
  const keys = [];
  ws.getRow(1).eachCell((c, i) => { keys[i] = HEAD_KEYS[String(c.value || '').trim().toLowerCase()]; });
  const out = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const o = {};
    keys.forEach((k, i) => { if (k) o[k] = cellVal(row.getCell(i)); });
    if (o.company) out.push(o);
  });
  return out;
}
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
export const appKey = (company, title) => `${String(company || '').toLowerCase().trim()}|${String(title || '').toLowerCase().trim()}`;

function fillSheet(ws, cols, rows, withDropdown) {
  ws.columns = cols;
  rows.forEach((r, i) => {
    const row = ws.addRow({ ...r, n: i + 1, url: '' });
    if (r.url) link(row.getCell('url'), r.url);
    row.getCell('why').alignment = { wrapText: true, vertical: 'top' };
    const m = row.getCell('match');
    m.alignment = { horizontal: 'center' };
    if (Number(r.match) >= 4) m.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5F4E4' } };
  });
  styleHeader(ws);
  if (withDropdown) dropdown(ws, 'J', 2, Math.max(rows.length + 1, 2), DECISIONS);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

/**
 * Two sheets: "To review" (new jobs at the top, plus anything still waiting on the user)
 * and "Done" (applied, skipped, or no decision after 14 days). Old per-day sheets are merged in.
 * applied: Set of job URLs and appKey(company, title) already in applications.xlsx.
 */
export async function writeShortlist(file, date, newRows, applied = new Set()) {
  const wb = await openBook(file);
  let review = readRows(wb.getWorksheet(REVIEW));
  const done = readRows(wb.getWorksheet(DONE));
  for (const ws of wb.worksheets.slice()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(ws.name)) review.push(...readRows(ws));
  }
  const known = new Set([...review, ...done].map(r => r.url));
  const added = newRows.filter(r => !known.has(r.url)).map(r => ({ ...r, found: r.found || date }));
  const seenUrl = new Set();
  review = [...added, ...review].filter(r => (seenUrl.has(r.url) ? false : seenUrl.add(r.url)));

  const keep = [], moved = [];
  for (const r of review) {
    const outcome = applied.has(r.url) || applied.has(appKey(r.company, r.title)) ? 'Applied'
      : r.decision === 'Skip' ? 'Skipped'
      : !r.decision && r.found && daysBetween(r.found, date) > EXPIRE_DAYS ? 'Expired' : '';
    if (outcome) moved.push({ ...r, outcome, moved: date }); else keep.push(r);
  }
  keep.sort((a, b) => String(b.found).localeCompare(String(a.found)) || Number(b.match) - Number(a.match));
  const allDone = [...moved, ...done].sort((a, b) => String(b.moved).localeCompare(String(a.moved)));

  for (const ws of wb.worksheets.slice()) wb.removeWorksheet(ws.id);
  fillSheet(wb.addWorksheet(REVIEW), SL_COLS, keep, true);
  fillSheet(wb.addWorksheet(DONE), DONE_COLS, allDone, false);
  await wb.xlsx.writeFile(file);
  return {
    added: added.length,
    review: keep.length,
    moved: moved.length,
    waiting: keep.filter(r => r.decision === 'Tailor CV' || r.decision === 'Apply as is'),
  };
}

/** Row N of "To review". */
export async function readShortlistRow(file, n) {
  const wb = await openBook(file);
  const rows = readRows(wb.getWorksheet(REVIEW));
  const r = rows[Number(n) - 1];
  if (!r) throw new Error(`No row #${n} on "${REVIEW}"`);
  return r;
}

export async function appliedKeys(file) {
  const { ws } = await appSheet(file);
  const keys = new Set();
  ws.eachRow((row, i) => {
    if (i === 1 || !row.getCell(3).value) return;
    const url = cellVal(row.getCell(6));
    if (url) keys.add(url);
    keys.add(appKey(cellVal(row.getCell(3)), cellVal(row.getCell(4))));
  });
  return keys;
}

const APP_COLS = [
  { header: '#', key: 'n', width: 4 },
  { header: 'Applied on', key: 'applied', width: 11 },
  { header: 'Company', key: 'company', width: 22 },
  { header: 'Role', key: 'title', width: 38 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'Link', key: 'url', width: 8 },
  { header: 'Match', key: 'match', width: 7 },
  { header: 'CV used', key: 'cv', width: 30 },
  { header: 'Status', key: 'status', width: 13 },
  { header: 'Last update', key: 'updated', width: 11 },
  { header: 'Next step', key: 'next', width: 28 },
  { header: 'Notes', key: 'notes', width: 40 },
];

export async function appSheet(file) {
  const wb = await openBook(file);
  let ws = wb.getWorksheet('Applications');
  if (!ws) { ws = wb.addWorksheet('Applications'); ws.columns = APP_COLS; styleHeader(ws); }
  else ws.columns = APP_COLS.map((c, i) => ({ ...c, header: ws.getRow(1).getCell(i + 1).value || c.header }));
  return { wb, ws };
}

export async function addApplication(file, app) {
  const { wb, ws } = await appSheet(file);
  let last = 1; // header is row 1; dropdowns make rowCount larger than the data
  ws.eachRow((r, i) => { if (i > 1 && r.getCell(3).value) last = i; });
  const n = last; // application number = data rows so far + 1
  const row = ws.getRow(last + 1);
  const vals = { ...app, n, url: '' };
  APP_COLS.forEach((c, i) => { if (vals[c.key] !== undefined) row.getCell(i + 1).value = vals[c.key]; });
  if (app.url) link(row.getCell('url'), app.url);
  row.getCell(12).alignment = { wrapText: true, vertical: 'top' };
  row.commit();
  dropdown(ws, 'I', 2, Math.max(ws.rowCount, 200), STATUSES);
  await wb.xlsx.writeFile(file);
  return n;
}

export async function updateApplication(file, n, { status, next, note, date }) {
  const { wb, ws } = await appSheet(file);
  const row = ws.getRow(Number(n) + 1);
  if (!row.getCell(3).value) throw new Error(`No application #${n}`);
  if (status) row.getCell(9).value = status;
  if (next !== undefined) row.getCell(11).value = next;
  if (note) row.getCell(12).value = [row.getCell(12).value, `${date}: ${note}`].filter(Boolean).join('\n');
  row.getCell(10).value = date;
  await wb.xlsx.writeFile(file);
}

export async function listApplications(file) {
  const { ws } = await appSheet(file);
  const out = [];
  ws.eachRow((row, i) => { if (i > 1 && row.getCell(3).value) out.push({ n: row.getCell(1).value, applied: row.getCell(2).value, company: row.getCell(3).value, title: row.getCell(4).value, status: row.getCell(9).value, updated: row.getCell(10).value, next: row.getCell(11).value }); });
  return out;
}
