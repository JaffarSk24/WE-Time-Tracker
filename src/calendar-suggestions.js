// Pure rules of the "From calendar" suggestions on the Timer view (no DOM,
// no store), covered by tests/calendar-suggestions.test.js.

export const HIDDEN_KEEP_DAYS = 30;

const ms = (iso) => new Date(iso).getTime();

// An event counts as recorded when one entry overlaps at least half of it.
export function isCovered(event, logs) {
  const start = ms(event.startTime);
  const end = ms(event.endTime);
  const half = (end - start) / 2;
  return (logs || []).some(log => {
    if (!log || !log.startTime || !log.endTime) return false;
    const overlap = Math.min(end, ms(log.endTime)) - Math.max(start, ms(log.startTime));
    return overlap > 0 && overlap >= half;
  });
}

// Events still worth offering: already over at `now`, not hidden and not
// covered by an entry. Keeps the calendar order.
export function uncoveredEvents(events, logs, hidden = {}, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : ms(now);
  return (events || []).filter(ev =>
    ms(ev.endTime) <= nowMs && !(hidden && hidden[ev.id]) && !isCovered(ev, logs)
  );
}

// The range of the suggestions: from the start of yesterday (local time) to now.
export function suggestionRange(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

// Hidden events are kept as { eventId: event end time }. Entries older than
// HIDDEN_KEEP_DAYS are dropped, so the list never grows without bound.
export function pruneHidden(hidden, now = new Date(), days = HIDDEN_KEEP_DAYS) {
  const limit = (now instanceof Date ? now.getTime() : ms(now)) - days * 86400000;
  const out = {};
  Object.keys(hidden || {}).forEach(id => {
    const at = ms(hidden[id]);
    if (!isNaN(at) && at >= limit) out[id] = hidden[id];
  });
  return out;
}

// Key under which the last client chosen for an event title is remembered.
export function titleKey(title) {
  return String(title || '').trim().toLowerCase();
}

// The remembered client for an event, if that client still exists.
export function rememberedClient(map, title, clients) {
  const id = map && map[titleKey(title)];
  return id && (clients || []).some(c => c.id === id) ? id : '';
}
