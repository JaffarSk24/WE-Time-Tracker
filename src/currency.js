// WE Time Tracker: per-client currency helpers bound to the store.
// A client's currency only labels its amounts; changing it never converts.
import { store } from './store.js';
import { clientCurrency, formatMoney, formatMoneyTotals, DEFAULT_CURRENCY } from './utils.js';

export function defaultCurrency() {
  return clientCurrency(null, store.getSettings());
}

export function currencyOfClient(clientId) {
  const client = clientId ? store.getClients().find(c => c.id === clientId) : null;
  return clientCurrency(client, store.getSettings());
}

export function moneyForClient(amount, clientId) {
  return formatMoney(amount, currencyOfClient(clientId));
}

// Adds an amount to a { currency: total } map.
export function addToTotals(totals, currency, amount) {
  totals[currency || DEFAULT_CURRENCY] = (totals[currency || DEFAULT_CURRENCY] || 0) + amount;
  return totals;
}

// Formatted lines of a { currency: total } map; a single "0.00" line in the
// default currency when the map is empty, so empty totals look as before.
export function totalsLines(totals) {
  const lines = formatMoneyTotals(totals, defaultCurrency());
  return lines.length ? lines : [formatMoney(0, defaultCurrency())];
}

// Currencies with a non-zero total (used where zero totals are hidden).
export function nonZeroTotals(totals) {
  const out = {};
  Object.keys(totals).forEach(cur => { if (Math.abs(totals[cur]) > 0.005) out[cur] = totals[cur]; });
  return out;
}
