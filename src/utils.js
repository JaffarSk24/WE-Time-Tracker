// WE Time Tracker — shared utilities (dates are always local; user input goes
// into the DOM only via escapeHtml/textContent).

// Billing granularity: amounts are computed from the hourly rate with
// minute precision (duration rounded to the nearest minute). No block
// rounding — a 52-minute entry bills exactly 52 minutes.
export const BILLING_GRANULARITY_MS = 60000;

// Actually worked duration of an entry in ms.
// If pauses make it shorter than the startTime..endTime span, use the stored
// durationMs; otherwise use the span.
export function logDurationMs(log) {
  if (log.durationMs !== undefined && log.durationMs !== null) {
    return log.durationMs;
  }
  return new Date(log.endTime) - new Date(log.startTime);
}

// Billable hours for money calculations: minute-precise, no block rounding.
export function billableHours(durationMs) {
  if (durationMs <= 0) return 0;
  const minutes = Math.round(durationMs / BILLING_GRANULARITY_MS);
  return minutes / 60;
}

// Escape user strings before inserting into innerHTML.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ISO string -> value for <input type="datetime-local"> in LOCAL time.
export function toLocalDatetimeString(isoOrDate) {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Local day key YYYY-MM-DD (NOT a UTC slice of the ISO string).
export function localDayKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Day key -> local midnight of that day (new Date('YYYY-MM-DD') would be UTC).
export function dayKeyToLocalDate(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Milliseconds -> "HH:MM:SS".
export function formatDurationHMS(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return [hrs, mins, secs].map(n => String(n).padStart(2, '0')).join(':');
}

// Decimal hours -> localized "2h 15m" form (RU variant included; no "1h 60m" rounding bug).
export function formatDurationShort(decimalHours, lang) {
  const totalMinutes = Math.round(decimalHours * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return lang === 'ru' ? `${hrs}ч ${mins}м` : `${hrs}h ${mins}m`;
}

// Fill a <select> with a {id, name} list plus a placeholder.
export function fillSelect(element, items, placeholderText, selectedId = null) {
  if (!element) return;
  element.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = placeholderText;
  element.appendChild(placeholder);

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    if (selectedId && item.id === selectedId) {
      opt.selected = true;
    }
    element.appendChild(opt);
  });
}

// Escape a CSV cell: quotes are doubled, values with formula prefixes
// (= + - @) get a leading apostrophe — protection against Excel CSV injection.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}
