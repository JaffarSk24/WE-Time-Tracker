// WE Time Tracker: pure helpers for the weekly timesheet, the day timeline
// and splitting / merging entries. No DOM and no store access here, so
// everything is covered by tests/timesheet.test.js.
import { localDayKey, logDurationMs, billableHours } from './utils.js';

// Same tolerance as store.addTimeLog: a durationMs this close to the span
// means there was no pause, so it is not stored.
const SPAN_TOLERANCE_MS = 1000;

const ms = (iso) => new Date(iso).getTime();

// ---------------- WEEK ----------------

// Local midnight of the Monday of the week containing the date.
export function startOfWeek(date) {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

// The week shifted by a number of weeks (local calendar, DST safe).
export function addWeeks(weekStart, count) {
  const d = new Date(weekStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + count * 7);
}

// Seven local midnights, Monday to Sunday.
export function weekDays(weekStart) {
  const d = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
}

function logAmount(log) {
  if (!log.billable) return 0;
  return billableHours(logDurationMs(log)) * (Number(log.rateAtTime) || 0);
}

// Row key: client and project (an entry without a project goes to the
// client's own row).
export function rowKeyOf(log) {
  return `${log.clientId || ''}|${log.projectId || ''}`;
}

// Grid of a week: rows = client / project, columns = local days (by the
// entry's start, the same grouping as Reports).
// Returns { days: [dayKey x7], rows: [{ key, clientId, projectId, cells:
// { dayKey: { ms, logs } }, totalMs, amount }], dayTotals: { dayKey: ms },
// totalMs, amount }.
export function buildWeekGrid(logs, weekStart) {
  const days = weekDays(weekStart).map(d => localDayKey(d));
  const daySet = new Set(days);
  const rowsByKey = new Map();
  const dayTotals = Object.fromEntries(days.map(k => [k, 0]));
  let totalMs = 0;
  let amount = 0;

  const sorted = [...logs].sort((a, b) => ms(a.startTime) - ms(b.startTime));
  sorted.forEach(log => {
    const dayKey = localDayKey(log.startTime);
    if (!daySet.has(dayKey)) return;
    const key = rowKeyOf(log);
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        key,
        clientId: log.clientId || null,
        projectId: log.projectId || null,
        cells: Object.fromEntries(days.map(k => [k, { ms: 0, logs: [] }])),
        totalMs: 0,
        amount: 0
      });
    }
    const row = rowsByKey.get(key);
    const dur = logDurationMs(log);
    const money = logAmount(log);
    row.cells[dayKey].ms += dur;
    row.cells[dayKey].logs.push(log);
    row.totalMs += dur;
    row.amount += money;
    dayTotals[dayKey] += dur;
    totalMs += dur;
    amount += money;
  });

  return { days, rows: [...rowsByKey.values()], dayTotals, totalMs, amount };
}

// Where a quick manual entry on a day starts: right after that day's last
// entry, or at 09:00 local time when the day is empty.
export function nextManualStart(logs, dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  let latest = null;
  logs.forEach(log => {
    if (localDayKey(log.startTime) !== dayKey) return;
    const end = ms(log.endTime);
    if (latest === null || end > latest) latest = end;
  });
  return latest === null ? new Date(y, m - 1, d, 9, 0, 0, 0) : new Date(latest);
}

// ---------------- TIMELINE / OVERLAPS ----------------

// Pairs of entries whose time ranges overlap. Touching entries (one ends
// exactly when the next starts) do not overlap.
// Returns [{ a, b, start, end }] with the overlapping range in ms, sorted.
export function findOverlaps(logs) {
  const sorted = [...logs]
    .filter(l => l.startTime && l.endTime && ms(l.endTime) > ms(l.startTime))
    .sort((a, b) => ms(a.startTime) - ms(b.startTime) || ms(a.endTime) - ms(b.endTime));
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aEnd = ms(a.endTime);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const bStart = ms(b.startTime);
      if (bStart >= aEnd) break; // sorted by start: nothing later overlaps a
      result.push({ a, b, start: bStart, end: Math.min(aEnd, ms(b.endTime)) });
    }
  }
  return result.sort((x, y) => x.start - y.start || x.end - y.end);
}

// Entries among `logs` that overlap the given one (itself excluded).
export function overlapsWith(log, logs) {
  return findOverlaps([log, ...logs.filter(l => l.id !== log.id)])
    .filter(o => o.a.id === log.id || o.b.id === log.id)
    .map(o => (o.a.id === log.id ? o.b : o.a));
}

// Visible range of the day timeline: the hours that have entries plus one
// hour on each side. Returns { start, end } in ms, or null for no entries.
export function timelineRange(logs) {
  if (logs.length === 0) return null;
  const first = Math.min(...logs.map(l => ms(l.startTime)));
  const last = Math.max(...logs.map(l => ms(l.endTime)));
  const s = new Date(first);
  const start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours() - 1).getTime();
  const e = new Date(last);
  const endHour = e.getMinutes() || e.getSeconds() || e.getMilliseconds() ? e.getHours() + 1 : e.getHours();
  const end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), endHour + 1).getTime();
  return { start, end };
}

// Gaps between entries of a day (only real holes, overlaps merged).
export function findGaps(logs) {
  const sorted = [...logs].sort((a, b) => ms(a.startTime) - ms(b.startTime));
  const gaps = [];
  let coveredUntil = null;
  sorted.forEach(l => {
    const s = ms(l.startTime);
    const e = ms(l.endTime);
    if (coveredUntil !== null && s > coveredUntil) gaps.push({ start: coveredUntil, end: s });
    coveredUntil = coveredUntil === null ? e : Math.max(coveredUntil, e);
  });
  return gaps;
}

// Stable colour hue (0..359) for a client id.
export function clientHue(clientId) {
  const s = String(clientId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ---------------- SPLIT / MERGE ----------------

function withWorked(record, workedMs) {
  const out = { ...record };
  const span = ms(out.endTime) - ms(out.startTime);
  if (workedMs === undefined || Math.abs(span - workedMs) <= SPAN_TOLERANCE_MS) {
    delete out.durationMs;
  } else {
    out.durationMs = workedMs;
  }
  return out;
}

// Splits an entry at a moment strictly inside it. Both parts keep every
// field (client, project, billable, rate, tags...) except the id: the first
// part keeps the original id, the second gets newId. When the entry has a
// durationMs (pauses), the worked time is split in proportion to the span.
// Returns [first, second] or null when the moment is not inside the entry.
export function splitLog(log, splitAt, newId) {
  const start = ms(log.startTime);
  const end = ms(log.endTime);
  const at = splitAt instanceof Date ? splitAt.getTime() : ms(splitAt);
  if (!(at > start && at < end)) return null;
  const atIso = new Date(at).toISOString();

  let firstWorked;
  let secondWorked;
  if (log.durationMs !== undefined && log.durationMs !== null) {
    firstWorked = Math.round(log.durationMs * (at - start) / (end - start));
    secondWorked = log.durationMs - firstWorked;
  }
  const first = withWorked({ ...log, endTime: atIso }, firstWorked);
  const second = withWorked({ ...log, id: newId, startTime: atIso }, secondWorked);
  return [first, second];
}

// Why a set of entries cannot be merged: 'count' (fewer than two),
// 'paid' (paid entries are never merged), 'mismatch' (different client,
// project, billable or paid state), or null when they can.
export function mergeBlocker(logs) {
  if (!logs || logs.length < 2) return 'count';
  if (logs.some(l => l.paid)) return 'paid';
  const sig = l => `${l.clientId || ''}|${l.projectId || ''}|${!!l.billable}|${!!l.paid}`;
  const first = sig(logs[0]);
  if (logs.some(l => sig(l) !== first)) return 'mismatch';
  return null;
}

// Merges entries into one: earliest start to latest end, worked time = the
// sum of worked times (durationMs only when it differs from the span),
// description = unique descriptions joined with "; ", every other field
// (id included) from the earliest entry. Returns null when not mergeable.
export function mergeLogs(logs) {
  if (mergeBlocker(logs) !== null) return null;
  const sorted = [...logs].sort((a, b) => ms(a.startTime) - ms(b.startTime) || ms(a.endTime) - ms(b.endTime));
  const earliest = sorted[0];
  const start = ms(earliest.startTime);
  const end = Math.max(...sorted.map(l => ms(l.endTime)));
  const worked = sorted.reduce((sum, l) => sum + logDurationMs(l), 0);
  const descriptions = [];
  sorted.forEach(l => {
    const d = (l.description || '').trim();
    if (d && !descriptions.includes(d)) descriptions.push(d);
  });
  return withWorked({
    ...earliest,
    description: descriptions.join('; '),
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString()
  }, worked);
}
