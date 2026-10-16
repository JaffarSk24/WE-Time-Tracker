// WE Time Tracker - tags (pure helpers). Tags are a top-level collection
// tags: [{ id, name, color }]; entries carry tagIds: [].
import { logDurationMs, billableHours } from './utils.js';

// Small palette that reads well on both themes.
export const TAG_COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#f43f5e', '#a855f7'
];

export function tagColor(color) {
  return TAG_COLORS.includes(color) ? color : TAG_COLORS[0];
}

export function logTagIds(log) {
  return log && Array.isArray(log.tagIds) ? log.tagIds : [];
}

// Only ids of tags that still exist, without duplicates.
export function validTagIds(ids, tags) {
  const known = new Set((tags || []).map(tag => tag.id));
  return [...new Set(ids || [])].filter(id => known.has(id));
}

export function filterLogsByTag(logs, tagId) {
  if (!tagId) return logs;
  return logs.filter(log => logTagIds(log).includes(tagId));
}

// Patches ({ id, tagIds }) that remove a tag from every entry carrying it.
export function tagRemovalPatches(logs, tagId) {
  return (logs || [])
    .filter(log => logTagIds(log).includes(tagId))
    .map(log => ({ id: log.id, tagIds: logTagIds(log).filter(id => id !== tagId) }));
}

export function tagNamesOf(log, tags) {
  const byId = new Map((tags || []).map(tag => [tag.id, tag]));
  return logTagIds(log).map(id => byId.get(id)).filter(Boolean).map(tag => tag.name);
}

// Hours and billable amount per tag for entries starting inside range
// ({ start, end } local dates, end exclusive; null = all time). An entry with
// several tags counts for each of them. Sorted by hours, most first; tags
// without time in the range are left out.
// currencyOf(log), optional, splits the amounts by currency (amounts).
export function tagStats(logs, tags, range = null, currencyOf = null) {
  const stats = new Map((tags || []).map(tag => [tag.id, { tag, ms: 0, amount: 0, amounts: {} }]));
  (logs || []).forEach(log => {
    if (range) {
      const start = new Date(log.startTime);
      if (start < range.start || start >= range.end) return;
    }
    const ids = [...new Set(logTagIds(log))];
    if (ids.length === 0) return;
    const ms = logDurationMs(log);
    if (ms <= 0) return;
    const amount = log.billable ? billableHours(ms) * (log.rateAtTime || 0) : 0;
    ids.forEach(id => {
      const entry = stats.get(id);
      if (!entry) return;
      entry.ms += ms;
      entry.amount += amount;
      if (amount && currencyOf) {
        const cur = currencyOf(log);
        entry.amounts[cur] = (entry.amounts[cur] || 0) + amount;
      }
    });
  });
  return [...stats.values()]
    .filter(entry => entry.ms > 0)
    .map(entry => ({
      id: entry.tag.id,
      name: entry.tag.name,
      color: tagColor(entry.tag.color),
      hours: entry.ms / 3600000,
      amount: entry.amount,
      amounts: entry.amounts
    }))
    .sort((a, b) => b.hours - a.hours);
}

// Local range of a Dashboard period value (the activity period select).
export function dashboardPeriodRange(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const tomorrow = new Date(y, m, now.getDate() + 1);
  switch (period) {
    case '7':
    case '14':
    case '30':
      return { start: new Date(y, m, now.getDate() - Number(period) + 1), end: tomorrow };
    case 'current-month':
      return { start: new Date(y, m, 1), end: tomorrow };
    case 'last-month':
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
    case '3-months':
      return { start: new Date(y, m - 2, 1), end: tomorrow };
    case '6-months':
      return { start: new Date(y, m - 5, 1), end: tomorrow };
    case '12-months':
      return { start: new Date(y, m - 11, 1), end: tomorrow };
    case 'current-year':
      return { start: new Date(y, 0, 1), end: tomorrow };
    case 'last-year':
      return { start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1) };
    default:
      return null;
  }
}
