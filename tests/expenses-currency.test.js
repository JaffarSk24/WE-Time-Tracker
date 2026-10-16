import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../src/store.js';
import { formatMoney, formatMoneyTotals, clientCurrency, currencySymbol } from '../src/utils.js';
import { buildExpense, clientExpenses, expensesCsv, EXPENSES } from '../src/expenses.js';
import { currencyOfClient, addToTotals } from '../src/currency.js';

beforeEach(() => {
  store.clearAllData();
});

const hour = (day) => ({ startTime: `2026-07-${day}T10:00:00Z`, endTime: `2026-07-${day}T11:00:00Z` });

describe('client balance with expenses', () => {
  it('without expenses keeps billed = work and reports zero expenses', () => {
    const c = store.addClient('Acme', 50);
    store.addTimeLog({ clientId: c.id, ...hour('01') });
    store.addPayment(c.id, 20);
    expect(store.getClientBalance(c.id)).toEqual({ billed: 50, paid: 20, balance: -30, expenses: 0 });
  });

  it('adds billable expenses to billed, ignores non-billable ones', () => {
    const c = store.addClient('Acme', 50);
    store.addTimeLog({ clientId: c.id, ...hour('01') });
    store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, date: '2026-07-02', amount: '30', note: 'Ads', billable: true }));
    store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, date: '2026-07-03', amount: '99', billable: false }));
    const other = store.addClient('Other', 10);
    store.upsertRecord(EXPENSES, buildExpense({ clientId: other.id, date: '2026-07-03', amount: '5' }));
    expect(store.getClientBalance(c.id)).toEqual({ billed: 80, paid: 0, balance: -80, expenses: 30 });
  });

  it('marking logs paid covers only the logs, never the expense', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, ...hour('01') });
    store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, date: '2026-07-02', amount: '30' }));
    store.setLogsPaid([log.id], true);
    const autos = store.getPayments(c.id).filter(p => p.auto);
    expect(autos).toHaveLength(1);
    expect(autos[0].amount).toBe(50);
    expect(Object.keys(autos[0].logAmounts)).toEqual([log.id]);
    expect(store.getClientBalance(c.id).balance).toBe(-30);
  });

  it('a payment entered for the expense does not shrink the paid-log payment', () => {
    const c = store.addClient('Acme', 50);
    const log = store.addTimeLog({ clientId: c.id, ...hour('01') });
    store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, date: '2026-07-02', amount: '30' }));
    store.addPayment(c.id, 30, 'ads');
    store.setLogsPaid([log.id], true);
    expect(store.getClientBalance(c.id).balance).toBeCloseTo(0);
  });

  it('deleting an expense records a tombstone, undo removes it', () => {
    const c = store.addClient('Acme', 50);
    const e = store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, date: '2026-07-02', amount: '30' }));
    expect(e.id).toMatch(/^expense_/);
    store.deleteRecord(EXPENSES, e.id);
    expect(store.getCollection(EXPENSES)).toHaveLength(0);
    expect(store.state.deleted[e.id]).toBeTruthy();
    expect(store.getClientBalance(c.id).expenses).toBe(0);
    store.upsertRecord(EXPENSES, e);
    expect(store.state.deleted[e.id]).toBeUndefined();
    expect(store.getClientBalance(c.id).expenses).toBe(30);
  });

  it('deleting the client removes its expenses with tombstones', () => {
    const c = store.addClient('Acme', 50);
    const e = store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, date: '2026-07-02', amount: '30' }));
    store.deleteClient(c.id);
    expect(store.getCollection(EXPENSES)).toHaveLength(0);
    expect(store.state.deleted[e.id]).toBeTruthy();
  });

  it('deleting a project keeps its expenses without the project', () => {
    const c = store.addClient('Acme', 50);
    const p = store.addProject('Site', c.id, 0);
    store.upsertRecord(EXPENSES, buildExpense({ clientId: c.id, projectId: p.id, date: '2026-07-02', amount: '30' }));
    store.deleteProject(p.id);
    expect(store.getCollection(EXPENSES)[0].projectId).toBeNull();
    expect(store.getClientBalance(c.id).expenses).toBe(30);
  });
});

describe('expense helpers', () => {
  it('buildExpense validates and normalizes input', () => {
    expect(buildExpense({ clientId: 'c', date: '2026-07-02', amount: '0' })).toBeNull();
    expect(buildExpense({ clientId: 'c', date: '', amount: '5' })).toBeNull();
    expect(buildExpense({ clientId: '', date: '2026-07-02', amount: '5' })).toBeNull();
    expect(buildExpense({ clientId: 'c', projectId: '', date: '2026-07-02', amount: '5.5', note: ' x ', billable: false }))
      .toEqual({ clientId: 'c', projectId: null, date: '2026-07-02', amount: 5.5, note: 'x', billable: false });
  });

  it('clientExpenses filters and sorts newest first', () => {
    const list = [
      { id: 'a', clientId: 'c', date: '2026-07-01' },
      { id: 'b', clientId: 'x', date: '2026-07-05' },
      { id: 'c', clientId: 'c', date: '2026-07-03' }
    ];
    expect(clientExpenses(list, 'c').map(e => e.id)).toEqual(['c', 'a']);
  });

  it('expensesCsv escapes cells and names the currency', () => {
    const csv = expensesCsv([{ id: 'a', clientId: 'c', projectId: null, date: '2026-07-01', amount: 12.5, note: '=SUM', billable: true }], {
      clientName: () => 'Acme', projectName: () => '', currency: () => 'USD', lang: 'en'
    });
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('"Date","Client","Project","Note","Amount","Currency","Billable"');
    expect(lines[1]).toBe('"2026-07-01","Acme","","\'=SUM",12.50,"USD","Yes"');
  });
});

describe('currency', () => {
  it('formatMoney keeps the EUR format exactly and follows it for others', () => {
    expect(formatMoney(12.5, 'EUR')).toBe('12.50 €');
    expect(formatMoney(12.5)).toBe('12.50 €');
    expect(formatMoney(12.5, 'USD')).toBe('12.50 $');
    expect(formatMoney(12.5, 'GBP')).toBe('12.50 £');
    expect(formatMoney(12.5, 'CHF')).toBe('12.50 CHF');
    expect(formatMoney(12.5, 'CZK')).toBe('12.50 Kč');
    expect(formatMoney(12.5, 'PLN')).toBe('12.50 zł');
    expect(currencySymbol('XYZ')).toBe('€');
  });

  it('client currency falls back to settings, then EUR', () => {
    expect(clientCurrency({ currency: 'USD' }, { currency: 'GBP' })).toBe('USD');
    expect(clientCurrency({}, { currency: 'GBP' })).toBe('GBP');
    expect(clientCurrency(null, {})).toBe('EUR');
    const c = store.addClient('Acme', 50);
    expect(currencyOfClient(c.id)).toBe('EUR');
    store.updateSettings({ currency: 'CZK' });
    expect(currencyOfClient(c.id)).toBe('CZK');
    store.patchRecord('clients', c.id, { currency: 'PLN' });
    expect(currencyOfClient(c.id)).toBe('PLN');
  });

  it('totals stay per currency, default currency first', () => {
    const totals = {};
    addToTotals(totals, 'USD', 5);
    addToTotals(totals, 'EUR', 10);
    addToTotals(totals, 'EUR', 2.5);
    expect(formatMoneyTotals(totals, 'EUR')).toEqual(['12.50 €', '5.00 $']);
    expect(formatMoneyTotals(totals, 'USD')).toEqual(['5.00 $', '12.50 €']);
  });
});
