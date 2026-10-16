// WE Time Tracker: dashboard analytics. Pure functions only (no store, no
// DOM), so every number can be tested. Amounts are always kept per currency:
// { EUR: 120, USD: 40 }, never added across currencies. All dates are local.
import { billableHours, logDurationMs } from './utils.js';

const DAY_MS = 86400000;

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Whole local days between two dates (DST safe).
function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

function add(map, key, value) {
  map[key] = (map[key] || 0) + value;
}

function logAmount(log) {
  if (!log.billable) return 0;
  return billableHours(logDurationMs(log)) * (log.rateAtTime || 0);
}

// Date range [start, end) of a dashboard period (values of the
// dash-activity-period select). Periods that include today end now.
export function periodRange(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const end = new Date(now.getTime());
  switch (period) {
    case '7':
    case '14':
    case '30':
      return { start: new Date(y, m, now.getDate() - (Number(period) - 1)), end };
    case 'current-month':
      return { start: new Date(y, m, 1), end };
    case 'last-month':
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
    case '3-months':
      return { start: new Date(y, m - 2, 1), end };
    case '6-months':
      return { start: new Date(y, m - 5, 1), end };
    case '12-months':
      return { start: new Date(y, m - 11, 1), end };
    case 'current-year':
      return { start: new Date(y, 0, 1), end };
    case 'last-year':
      return { start: new Date(y - 1, 0, 1), end: new Date(y, 0, 1) };
    default:
      return { start: new Date(y, m, now.getDate() - 6), end };
  }
}

// The period of the same length right before the given one.
export function previousRange(range) {
  const length = range.end - range.start;
  return { start: new Date(range.start.getTime() - length), end: new Date(range.start.getTime()) };
}

export function logsInRange(logs, range) {
  return logs.filter(l => {
    const s = new Date(l.startTime);
    return s >= range.start && s < range.end;
  });
}

// Hours and money of a set of logs. currencyOf(log) names the log's currency.
// effectiveRate[cur] = billable amount / all tracked hours in that currency.
export function periodStats(logs, currencyOf) {
  let hours = 0;
  let billableHrs = 0;
  const amounts = {};
  const hoursByCurrency = {};
  logs.forEach(log => {
    const h = logDurationMs(log) / 3600000;
    if (h <= 0) return;
    const cur = currencyOf(log);
    hours += h;
    add(hoursByCurrency, cur, h);
    if (log.billable) {
      billableHrs += h;
      add(amounts, cur, logAmount(log));
    }
  });
  const effectiveRate = {};
  Object.keys(amounts).forEach(cur => {
    if (hoursByCurrency[cur] > 0) effectiveRate[cur] = amounts[cur] / hoursByCurrency[cur];
  });
  return {
    hours,
    billableHours: billableHrs,
    billableShare: hours > 0 ? billableHrs / hours : null,
    amounts,
    effectiveRate
  };
}

// Change in percent, null when there is nothing to compare with.
export function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// Current period against the previous one of the same length.
export function comparePeriods(current, previous) {
  const amounts = {};
  const currencies = new Set([...Object.keys(current.amounts), ...Object.keys(previous.amounts)]);
  currencies.forEach(cur => {
    const c = current.amounts[cur] || 0;
    const p = previous.amounts[cur] || 0;
    amounts[cur] = { current: c, previous: p, change: percentChange(c, p) };
  });
  return {
    hours: { current: current.hours, previous: previous.hours, change: percentChange(current.hours, previous.hours) },
    amounts
  };
}

function isWorkingDay(d) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

// Mon-Fri days of the current month: elapsed (1st up to today, inclusive)
// and total.
export function workingDays(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  let elapsed = 0;
  let total = 0;
  for (let day = 1; day <= last; day++) {
    if (!isWorkingDay(new Date(y, m, day))) continue;
    total++;
    if (day <= now.getDate()) elapsed++;
  }
  return { elapsed, total };
}

// Income forecast for the current month: billable amount so far divided by
// working days elapsed, times working days in the month. forecast is null
// while no working day has passed yet.
export function monthForecast(logs, currencyOf, now = new Date()) {
  const range = { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getTime() + 1) };
  const { amounts } = periodStats(logsInRange(logs, range), currencyOf);
  const { elapsed, total } = workingDays(now);
  const forecast = {};
  Object.keys(amounts).forEach(cur => {
    forecast[cur] = elapsed > 0 ? (amounts[cur] / elapsed) * total : null;
  });
  return { soFar: amounts, forecast, elapsed, total };
}

export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'];

function bucketIndex(days) {
  if (days <= 30) return 0;
  if (days <= 60) return 1;
  if (days <= 90) return 2;
  return 3;
}

// Debt aging: unpaid billable logs per client grouped by age in days.
// A client's total is capped by its debt (-balance from getClientBalance):
// a non-negative balance means no debt at all. Money already received is
// taken to pay the oldest work first, so the cap trims the oldest buckets.
// balanceOf(clientId) returns the balance, currencyOfClient(clientId) the
// currency. Returns rows sorted by total (largest first) and per-currency
// bucket totals.
export function debtAging(logs, balanceOf, currencyOfClient, now = new Date()) {
  const byClient = new Map();
  logs.forEach(log => {
    if (!log.clientId || !log.billable || log.paid) return;
    const amount = logAmount(log);
    if (amount <= 0) return;
    if (!byClient.has(log.clientId)) byClient.set(log.clientId, [0, 0, 0, 0]);
    const age = Math.max(0, daysBetween(new Date(log.startTime), now));
    byClient.get(log.clientId)[bucketIndex(age)] += amount;
  });

  const rows = [];
  const totals = {};
  byClient.forEach((buckets, clientId) => {
    const debt = Math.max(0, -balanceOf(clientId));
    let excess = buckets.reduce((s, v) => s + v, 0) - debt;
    for (let i = buckets.length - 1; i >= 0 && excess > 0; i--) {
      const cut = Math.min(buckets[i], excess);
      buckets[i] -= cut;
      excess -= cut;
    }
    const total = buckets.reduce((s, v) => s + v, 0);
    if (total <= 0.005) return;
    const currency = currencyOfClient(clientId);
    rows.push({ clientId, currency, buckets, total });
    if (!totals[currency]) totals[currency] = [0, 0, 0, 0];
    buckets.forEach((v, i) => { totals[currency][i] += v; });
  });
  rows.sort((a, b) => b.total - a.total);
  return { rows, totals };
}
