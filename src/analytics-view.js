// WE Time Tracker: dashboard analytics cards (below the existing cards).
// The numbers come from the pure functions in analytics.js; amounts are shown
// one line per currency.
import { store } from './store.js';
import { t } from './i18n.js';
import { escapeHtml, formatMoney, formatMoneyTotals, formatDurationShort } from './utils.js';
import { currencyOfClient, defaultCurrency } from './currency.js';
import {
  periodRange, previousRange, logsInRange, periodStats, comparePeriods,
  monthForecast, debtAging, AGING_BUCKETS
} from './analytics.js';

const logCurrency = log => currencyOfClient(log.clientId);

// Sorted currency keys of a map, the default currency first.
function currencyKeys(map) {
  const def = defaultCurrency();
  return Object.keys(map).sort((a, b) => (a === def ? -1 : b === def ? 1 : a.localeCompare(b)));
}

function setLines(id, lines) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = lines.length ? lines.join('\n') : '-';
  el.classList.add('money-lines');
}

function formatChange(change) {
  if (change === null) return '';
  const rounded = Math.round(change);
  const cls = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  return `<span class="analytics-change ${cls}">${rounded > 0 ? '+' : ''}${rounded}%</span>`;
}

function renderCompare(comparison, lang) {
  const el = document.getElementById('dash-compare-val');
  if (!el) return;
  const rows = [
    `<div class="analytics-compare-row">
      <span class="analytics-compare-label">${t('analytics-compare-hours')}</span>
      <span>${formatDurationShort(comparison.hours.current, lang)} <span class="analytics-prev">/ ${formatDurationShort(comparison.hours.previous, lang)}</span></span>
      ${formatChange(comparison.hours.change)}
    </div>`
  ];
  currencyKeys(comparison.amounts).forEach(cur => {
    const a = comparison.amounts[cur];
    rows.push(`<div class="analytics-compare-row">
      <span class="analytics-compare-label">${cur}</span>
      <span>${formatMoney(a.current, cur)} <span class="analytics-prev">/ ${formatMoney(a.previous, cur)}</span></span>
      ${formatChange(a.change)}
    </div>`);
  });
  el.innerHTML = rows.join('');
}

function renderAging(aging) {
  const el = document.getElementById('dash-aging');
  if (!el) return;
  if (aging.rows.length === 0) {
    el.innerHTML = `<div class="payments-empty">${t('analytics-aging-empty')}</div>`;
    return;
  }
  const clients = store.getClients();
  const cell = (value, cur) => `<td class="num">${value > 0.005 ? formatMoney(value, cur) : '-'}</td>`;
  const head = `<tr><th>${t('analytics-aging-client')}</th>${AGING_BUCKETS.map(b => `<th class="num">${t('analytics-aging-days', { range: b })}</th>`).join('')}<th class="num">${t('analytics-aging-total')}</th></tr>`;
  const body = aging.rows.map(row => {
    const client = clients.find(c => c.id === row.clientId);
    return `<tr><td>${escapeHtml(client ? client.name : t('deleted-client'))}</td>${row.buckets.map(v => cell(v, row.currency)).join('')}${cell(row.total, row.currency)}</tr>`;
  }).join('');
  const foot = currencyKeys(aging.totals).map(cur => {
    const buckets = aging.totals[cur];
    const total = buckets.reduce((s, v) => s + v, 0);
    return `<tr class="total"><td>${t('analytics-aging-total')} (${cur})</td>${buckets.map(v => cell(v, cur)).join('')}${cell(total, cur)}</tr>`;
  }).join('');
  el.innerHTML = `<div class="analytics-table-wrap"><table class="analytics-table"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>`;
}

export function renderAnalytics(period) {
  const lang = store.getSettings().language;
  const logs = store.getTimeLogs();
  const now = new Date();

  const range = periodRange(period, now);
  const current = periodStats(logsInRange(logs, range), logCurrency);
  const previous = periodStats(logsInRange(logs, previousRange(range)), logCurrency);

  // Effective hourly rate, per currency
  setLines('dash-eff-rate-val', currencyKeys(current.effectiveRate).map(cur => `${formatMoney(current.effectiveRate[cur], cur)} / ${t('per-hour')}`));

  // Billable share of hours
  const shareEl = document.getElementById('dash-billable-share-val');
  if (shareEl) shareEl.textContent = current.billableShare === null ? '-' : `${Math.round(current.billableShare * 100)}%`;
  const shareDesc = document.getElementById('dash-billable-share-desc');
  if (shareDesc) {
    shareDesc.textContent = current.hours > 0
      ? t('analytics-billable-share-desc', { billable: formatDurationShort(current.billableHours, lang), total: formatDurationShort(current.hours, lang) })
      : t('analytics-no-data');
  }

  renderCompare(comparePeriods(current, previous), lang);

  // Monthly forecast (always the current month)
  const fc = monthForecast(logs, logCurrency, now);
  const fcKeys = currencyKeys(fc.soFar);
  setLines('dash-forecast-val', fcKeys.map(cur => formatMoney(fc.forecast[cur] === null ? fc.soFar[cur] : fc.forecast[cur], cur)));
  const fcDesc = document.getElementById('dash-forecast-desc');
  if (fcDesc) {
    const soFar = formatMoneyTotals(fc.soFar, defaultCurrency()).join(', ');
    fcDesc.textContent = t('analytics-forecast-desc', { elapsed: fc.elapsed, total: fc.total })
      + (soFar ? ` · ${t('analytics-forecast-sofar', { amount: soFar })}` : '');
  }

  renderAging(debtAging(logs, id => store.getClientBalance(id).balance, currencyOfClient, now));
}
