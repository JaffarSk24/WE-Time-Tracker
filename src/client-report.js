// Client report (PDF): a clean document of the work done for one client.
// Not an invoice: no payments, no balance, no internal notes. Pure functions
// only, so the HTML can be tested; the UI glue is in client-report-ui.js.

import { escapeHtml, logDurationMs, billableHours, localDayKey, dayKeyToLocalDate } from './utils.js';

export const SENDER_FIELDS = ['company', 'address', 'ico', 'dic', 'email', 'phone'];

// Settings value -> object with every sender field as a trimmed string.
export function normalizeSender(sender) {
  const out = {};
  SENDER_FIELDS.forEach(key => {
    out[key] = String((sender && sender[key]) || '').trim();
  });
  return out;
}

// Entries that go into the report for the given payment-status filter value
// of Reports ('all' | 'unpaid' | 'paid' | 'free'). Non-billable entries are
// included only when that filter explicitly asks for them ('free').
export function selectReportLogs(logs, statusFilter) {
  const includeFree = statusFilter === 'free';
  return (logs || [])
    .filter(l => l.billable || includeFree)
    .slice()
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

// Billed minutes of an entry: the same rounding as billableHours, so the
// shown durations always add up to the shown amounts.
export function reportMinutes(log) {
  return Math.round(billableHours(logDurationMs(log)) * 60);
}

export function formatHM(minutes) {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function formatMoney(amount) {
  return `${(Number(amount) || 0).toFixed(2)} €`;
}

export function entryAmount(log) {
  if (!log.billable) return 0;
  return billableHours(logDurationMs(log)) * (Number(log.rateAtTime) || 0);
}

// The rate to show once in the totals, or null when entries differ.
export function sharedRate(logs) {
  const rates = new Set(logs.filter(l => l.billable).map(l => Number(l.rateAtTime) || 0));
  return rates.size === 1 ? [...rates][0] : null;
}

// First and last local day of the entries: { from, to } as YYYY-MM-DD.
export function reportPeriod(logs) {
  if (!logs.length) return { from: '', to: '' };
  const keys = logs.map(l => localDayKey(l.startTime)).sort();
  return { from: keys[0], to: keys[keys.length - 1] };
}

// "Report Client 2026-10-01 - 2026-10-31.pdf", safe for every file system.
export function clientReportFileName(prefix, clientName, period) {
  const clean = s => String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
  const range = period.from === period.to ? period.from : `${period.from} - ${period.to}`;
  return `${[clean(prefix), clean(clientName), range].filter(Boolean).join(' ')}.pdf`;
}

function formatDay(dayKey, locale) {
  if (!dayKey) return '';
  try {
    return dayKeyToLocalDate(dayKey).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (e) {
    return dayKey;
  }
}

// Builds the whole report as a standalone HTML document.
// opts: { logs (already selected and sorted), client, projects, sender, lang,
//         t (i18n function), generatedAt (Date, optional) }
export function buildClientReportHtml(opts) {
  const { logs, client, projects = [], lang = 'en', t } = opts;
  const sender = normalizeSender(opts.sender);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const generatedAt = opts.generatedAt || new Date();
  const projectName = id => {
    const p = projects.find(x => x.id === id);
    return p ? p.name : t('creport-no-project');
  };

  const period = reportPeriod(logs);
  let totalMinutes = 0;
  let totalAmount = 0;
  const byProject = new Map();

  const rows = logs.map(log => {
    const minutes = reportMinutes(log);
    const amount = entryAmount(log);
    totalMinutes += minutes;
    totalAmount += amount;
    const key = log.projectId || '';
    const agg = byProject.get(key) || { name: projectName(log.projectId), minutes: 0, amount: 0 };
    agg.minutes += minutes;
    agg.amount += amount;
    byProject.set(key, agg);
    return `<tr>
        <td class="nowrap">${escapeHtml(formatDay(localDayKey(log.startTime), locale))}</td>
        <td>${escapeHtml(log.description || '')}</td>
        <td>${escapeHtml(projectName(log.projectId))}</td>
        <td class="num">${formatHM(minutes)}</td>
        <td class="num">${log.billable ? escapeHtml(formatMoney(amount)) : ''}</td>
      </tr>`;
  }).join('');

  const senderLines = [];
  if (sender.company) senderLines.push(`<div class="sender-name">${escapeHtml(sender.company)}</div>`);
  if (sender.address) senderLines.push(`<div>${escapeHtml(sender.address).replace(/\r?\n/g, '<br>')}</div>`);
  if (sender.ico) senderLines.push(`<div>${escapeHtml(t('creport-ico'))}: ${escapeHtml(sender.ico)}</div>`);
  if (sender.dic) senderLines.push(`<div>${escapeHtml(t('creport-dic'))}: ${escapeHtml(sender.dic)}</div>`);
  if (sender.email) senderLines.push(`<div>${escapeHtml(sender.email)}</div>`);
  if (sender.phone) senderLines.push(`<div>${escapeHtml(sender.phone)}</div>`);

  const projectTable = byProject.size > 1 ? `
    <h2>${escapeHtml(t('creport-by-project'))}</h2>
    <table class="entries projects">
      <thead><tr>
        <th>${escapeHtml(t('creport-col-project'))}</th>
        <th class="num">${escapeHtml(t('creport-col-duration'))}</th>
        <th class="num">${escapeHtml(t('creport-col-amount'))}</th>
      </tr></thead>
      <tbody>${[...byProject.values()].map(p => `<tr>
        <td>${escapeHtml(p.name)}</td>
        <td class="num">${formatHM(p.minutes)}</td>
        <td class="num">${escapeHtml(formatMoney(p.amount))}</td>
      </tr>`).join('')}</tbody>
    </table>` : '';

  const rate = sharedRate(logs);
  const rateLine = rate !== null
    ? `<tr><td>${escapeHtml(t('creport-rate'))}</td><td class="num">${escapeHtml(formatMoney(rate))}${escapeHtml(t('creport-per-hour'))}</td></tr>`
    : '';

  const periodText = period.from === period.to
    ? formatDay(period.from, locale)
    : `${formatDay(period.from, locale)} - ${formatDay(period.to, locale)}`;

  return `<!doctype html>
<html lang="${lang === 'ru' ? 'ru' : 'en'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t('creport-title'))} - ${escapeHtml(client ? client.name : '')}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1f2937; font-size: 10.5pt; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 22px; }
  .sender { font-size: 9.5pt; color: #4b5563; line-height: 1.45; }
  .sender-name { font-size: 11pt; font-weight: 600; color: #111827; }
  h1 { font-size: 20pt; margin: 0 0 4px; color: #111827; text-align: right; }
  .meta { text-align: right; font-size: 9.5pt; color: #4b5563; line-height: 1.5; }
  .meta strong { color: #111827; }
  h2 { font-size: 11pt; margin: 22px 0 8px; color: #111827; }
  table.entries { width: 100%; border-collapse: collapse; }
  table.entries th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; border-bottom: 1.5px solid #d1d5db; padding: 6px 6px; }
  table.entries td { padding: 6px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.entries tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  th.num { text-align: right; }
  .nowrap { white-space: nowrap; }
  table.totals { margin: 18px 0 0 auto; border-collapse: collapse; min-width: 45%; }
  table.totals td { padding: 5px 6px; }
  table.totals tr.grand td { font-weight: 700; font-size: 12pt; border-top: 1.5px solid #111827; padding-top: 8px; }
  .generated { margin-top: 28px; font-size: 8.5pt; color: #9ca3af; }
</style>
</head>
<body>
  <div class="head">
    <div class="sender">${senderLines.join('')}</div>
    <div>
      <h1>${escapeHtml(t('creport-title'))}</h1>
      <div class="meta">
        <div>${escapeHtml(t('creport-client'))}: <strong>${escapeHtml(client ? client.name : '')}</strong></div>
        <div>${escapeHtml(t('creport-period'))}: ${escapeHtml(periodText)}</div>
      </div>
    </div>
  </div>
  <table class="entries">
    <thead><tr>
      <th>${escapeHtml(t('creport-col-date'))}</th>
      <th>${escapeHtml(t('creport-col-desc'))}</th>
      <th>${escapeHtml(t('creport-col-project'))}</th>
      <th class="num">${escapeHtml(t('creport-col-duration'))}</th>
      <th class="num">${escapeHtml(t('creport-col-amount'))}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${projectTable}
  <table class="totals">
    <tr><td>${escapeHtml(t('creport-total-hours'))}</td><td class="num">${formatHM(totalMinutes)}</td></tr>
    ${rateLine}
    <tr class="grand"><td>${escapeHtml(t('creport-total-amount'))}</td><td class="num">${escapeHtml(formatMoney(totalAmount))}</td></tr>
  </table>
  <div class="generated">${escapeHtml(t('creport-generated', { date: generatedAt.toLocaleDateString(locale) }))}</div>
</body>
</html>`;
}
