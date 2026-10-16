import { describe, it, expect } from 'vitest';
import { tagStats } from '../src/tags.js';
import { goalProgress } from '../src/goals.js';
import { buildClientReportHtml } from '../src/client-report.js';

// Amounts of clients in different currencies are never added together by the
// features that came with budgets, tags, goals and the client report.
const hour = (id, clientId, rate, tagIds = []) => ({
  id, clientId, description: id, billable: true, rateAtTime: rate, tagIds,
  startTime: new Date(Date.now() - 2 * 3600e3).toISOString(),
  endTime: new Date(Date.now() - 1 * 3600e3).toISOString()
});
const currencyOf = log => (log.clientId === 'usd' ? 'USD' : 'EUR');

describe('amounts by currency', () => {
  it('splits tag amounts by the currency of each entry', () => {
    const stats = tagStats([hour('a', 'eur', 40, ['t']), hour('b', 'usd', 50, ['t'])], [{ id: 't', name: 'T' }], null, currencyOf);
    expect(stats[0].amounts).toEqual({ EUR: 40, USD: 50 });
  });

  it('counts only entries in the default currency towards amount goals', () => {
    const goals = { weekAmount: 1000 };
    const all = goalProgress([hour('a', 'eur', 40), hour('b', 'usd', 50)], goals);
    const eurOnly = goalProgress([hour('a', 'eur', 40), hour('b', 'usd', 50)], goals, new Date(), log => currencyOf(log) === 'EUR');
    expect(all[0].value).toBe(90);
    expect(eurOnly[0].value).toBe(40);
  });

  it('writes the client report in the client currency', () => {
    const html = buildClientReportHtml({
      logs: [hour('a', 'usd', 50)], client: { id: 'usd', name: 'US Client' }, projects: [],
      lang: 'en', currency: 'USD', t: key => key
    });
    expect(html).toContain('50.00 $');
    expect(html).not.toContain('€');
  });
});
