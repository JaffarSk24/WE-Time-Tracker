import { describe, it, expect } from 'vitest';
import {
  normalizeSender,
  selectReportLogs,
  reportMinutes,
  formatHM,
  sharedRate,
  reportPeriod,
  clientReportFileName,
  buildClientReportHtml
} from '../src/client-report.js';
import { translations } from '../src/i18n.js';

// Real dictionaries, without the store-dependent t().
const tr = lang => (key, params) => {
  const text = translations[lang][key] || key;
  return params ? text.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : text;
};

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const log = (id, d, h, minutes, extra = {}) => ({
  id,
  description: `work ${id}`,
  clientId: 'c1',
  projectId: 'p1',
  startTime: at(d, h),
  endTime: new Date(new Date(at(d, h)).getTime() + minutes * 60000).toISOString(),
  billable: true,
  paid: false,
  rateAtTime: 50,
  ...extra
});

const client = { id: 'c1', name: 'Biliardovna.sk' };
const projects = [{ id: 'p1', name: 'Website' }, { id: 'p2', name: 'Shop' }];

describe('client report helpers', () => {
  it('normalizes the sender with every field as a string', () => {
    expect(normalizeSender(undefined)).toEqual({ company: '', address: '', ico: '', dic: '', email: '', phone: '' });
    expect(normalizeSender({ company: '  WE s.r.o. ' }).company).toBe('WE s.r.o.');
  });

  it('includes non-billable entries only when the status filter asks for them', () => {
    const logs = [log('b', 2, 10, 60), log('a', 1, 10, 60), log('f', 3, 10, 60, { billable: false })];
    expect(selectReportLogs(logs, 'all').map(l => l.id)).toEqual(['a', 'b']);
    expect(selectReportLogs(logs, 'unpaid').map(l => l.id)).toEqual(['a', 'b']);
    expect(selectReportLogs(logs, 'free').map(l => l.id)).toEqual(['a', 'b', 'f']);
  });

  it('counts minutes like billing does (nearest minute, at least one)', () => {
    expect(reportMinutes(log('a', 1, 10, 52))).toBe(52);
    expect(reportMinutes({ ...log('a', 1, 10, 0), durationMs: 10000 })).toBe(1);
    expect(formatHM(125)).toBe('2:05');
    expect(formatHM(0)).toBe('0:00');
  });

  it('finds a shared rate only when all billable entries agree', () => {
    expect(sharedRate([log('a', 1, 10, 60), log('b', 1, 12, 60)])).toBe(50);
    expect(sharedRate([log('a', 1, 10, 60), log('b', 1, 12, 60, { rateAtTime: 60 })])).toBeNull();
    expect(sharedRate([log('a', 1, 10, 60), log('b', 1, 12, 60, { billable: false, rateAtTime: 0 })])).toBe(50);
  });

  it('takes the period from local days of the entries', () => {
    expect(reportPeriod([log('a', 1, 0, 30), log('b', 31, 23, 30)])).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(reportPeriod([])).toEqual({ from: '', to: '' });
  });

  it('builds a safe default file name', () => {
    expect(clientReportFileName('Report', 'Biliardovna.sk', { from: '2026-10-01', to: '2026-10-31' }))
      .toBe('Report Biliardovna.sk 2026-10-01 - 2026-10-31.pdf');
    expect(clientReportFileName('Report', 'A/B: "C"', { from: '2026-10-01', to: '2026-10-01' }))
      .toBe('Report A B C 2026-10-01.pdf');
  });
});

describe('buildClientReportHtml', () => {
  it('lists entries in time order with amounts and totals', () => {
    const logs = selectReportLogs([log('b', 2, 10, 90), log('a', 1, 10, 30)], 'all');
    const html = buildClientReportHtml({ logs, client, projects, sender: { company: 'WE s.r.o.', ico: '123' }, lang: 'en', t: tr('en') });
    expect(html.indexOf('work a')).toBeLessThan(html.indexOf('work b'));
    expect(html).toContain('25.00 €');
    expect(html).toContain('75.00 €');
    expect(html).toContain('100.00 €');
    expect(html).toContain('2:00');
    expect(html).toContain('Biliardovna.sk');
    expect(html).toContain('WE s.r.o.');
    expect(html).toContain('Company ID (IČO): 123');
    // Shared rate is shown once in the totals.
    expect(html).toContain('50.00 €/h');
    // Single project: no per-project table.
    expect(html).not.toContain('By project');
  });

  it('adds per-project subtotals when there is more than one project and hides the rate when rates differ', () => {
    const logs = selectReportLogs([log('a', 1, 10, 60), log('b', 2, 10, 60, { projectId: 'p2', rateAtTime: 80 })], 'all');
    const html = buildClientReportHtml({ logs, client, projects, sender: {}, lang: 'en', t: tr('en') });
    expect(html).toContain('By project');
    expect(html).toContain('Shop');
    expect(html).toContain('80.00 €');
    expect(html).toContain('130.00 €');
    expect(html).not.toContain('€/h');
  });

  it('leaves the amount empty for non-billable entries', () => {
    const logs = selectReportLogs([log('a', 1, 10, 60), log('f', 2, 10, 60, { billable: false })], 'free');
    const html = buildClientReportHtml({ logs, client, projects, sender: {}, lang: 'en', t: tr('en') });
    const row = html.slice(html.indexOf('work f'));
    expect(row.slice(0, row.indexOf('</tr>'))).toMatch(/<td class="num"><\/td>/);
    expect(html).toContain('2:00'); // total hours count both entries
    expect(html).toContain('50.00 €');
  });

  it('never shows internal data: payments, balance, paid status', () => {
    const logs = selectReportLogs([log('a', 1, 10, 60, { paid: true })], 'all');
    const html = buildClientReportHtml({ logs, client, projects, sender: {}, lang: 'en', t: tr('en') }).toLowerCase();
    expect(html).not.toContain('paid');
    expect(html).not.toContain('balance');
    expect(html).not.toContain('payment');
  });

  it('escapes all user text', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const logs = [log('a', 1, 10, 60, { description: evil })];
    const html = buildClientReportHtml({
      logs,
      client: { id: 'c1', name: evil },
      projects: [{ id: 'p1', name: evil }],
      sender: { company: evil, address: `line1\n${evil}`, email: evil },
      lang: 'en',
      t: tr('en')
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('line1<br>');
  });

  it('follows the app language', () => {
    const logs = [log('a', 1, 10, 60)];
    const html = buildClientReportHtml({ logs, client, projects, sender: {}, lang: 'ru', t: tr('ru') });
    expect(html).toContain('Отчёт о работе');
    expect(html).toContain('lang="ru"');
    expect(html).toContain('01.10.2026');
  });
});
