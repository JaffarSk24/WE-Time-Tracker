// WE Time Tracker: client expenses (money spent on the client's behalf, e.g.
// an ad budget). Records live in the top-level "expenses" collection:
// { id, clientId, projectId|null, date (local YYYY-MM-DD), amount, note, billable }.
// Billable expenses are added to what the client owes (store.getClientBalance);
// they are never linked to the automatic payments created from paid logs.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { escapeHtml, csvCell, localDayKey, dayKeyToLocalDate, fillSelect, formatMoney, currencySymbol } from './utils.js';
import { currencyOfClient } from './currency.js';

export const EXPENSES = 'expenses';

// Validates form input and builds a record (without id). Returns null when
// the input is not a valid expense.
export function buildExpense({ clientId, projectId, date, amount, note, billable }) {
  const value = Number(amount);
  if (!clientId || !amount || isNaN(value) || value <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  return {
    clientId,
    projectId: projectId || null,
    date,
    amount: value,
    note: (note || '').trim(),
    billable: billable !== false
  };
}

// Expenses of a client, newest first.
export function clientExpenses(expenses, clientId) {
  return expenses
    .filter(e => e.clientId === clientId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// CSV text (no BOM) of the given expenses.
export function expensesCsv(expenses, { clientName, projectName, currency, lang }) {
  const isRu = lang === 'ru';
  const header = isRu
    ? ['Дата', 'Клиент', 'Проект', 'Комментарий', 'Сумма', 'Валюта', 'Выставляется клиенту']
    : ['Date', 'Client', 'Project', 'Note', 'Amount', 'Currency', 'Billable'];
  const yes = isRu ? 'Да' : 'Yes';
  const no = isRu ? 'Нет' : 'No';
  const rows = expenses.map(e => [
    csvCell(e.date),
    csvCell(clientName(e.clientId)),
    csvCell(e.projectId ? projectName(e.projectId) : ''),
    csvCell(e.note || ''),
    (Number(e.amount) || 0).toFixed(2),
    csvCell(currency(e.clientId)),
    csvCell(e.billable ? yes : no)
  ].join(','));
  return [header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n';
}

// ---------------- Payments modal section ----------------
let currentClientId = null;
let onChanged = () => {};

function exportClientExpenses() {
  if (!currentClientId) return;
  const list = clientExpenses(store.getCollection(EXPENSES), currentClientId);
  if (list.length === 0) {
    showToast(t('expenses-export-empty'), { type: 'info' });
    return;
  }
  const clients = store.getClients();
  const projects = store.getProjects();
  const csv = expensesCsv(list, {
    clientName: id => (clients.find(c => c.id === id) || {}).name || '',
    projectName: id => (projects.find(p => p.id === id) || {}).name || '',
    currency: id => currencyOfClient(id),
    lang: store.getSettings().language
  });
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `we_time_tracker_expenses_${localDayKey(new Date())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function deleteExpense(id) {
  const saved = store.getCollection(EXPENSES).find(e => e.id === id);
  if (!saved) return;
  store.deleteRecord(EXPENSES, id);
  onChanged();
  showToast(t('expense-deleted'), {
    type: 'info',
    actionLabel: t('toast-undo'),
    onAction: () => {
      store.upsertRecord(EXPENSES, saved);
      onChanged();
    }
  });
}

// Resets the form and draws the list for the client the modal shows.
export function openExpensesSection(clientId) {
  currentClientId = clientId;
  document.getElementById('expense-date').value = localDayKey(new Date());
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-note').value = '';
  document.getElementById('expense-billable').checked = true;
  fillSelect(document.getElementById('expense-project'), store.getProjects(clientId), t('expense-no-project'));
  renderExpensesSection();
}

export function closeExpensesSection() {
  currentClientId = null;
}

export function renderExpensesSection() {
  if (!currentClientId) return;
  const currency = currencyOfClient(currentClientId);
  document.getElementById('expense-amount-suffix').textContent = currencySymbol(currency);

  const lang = store.getSettings().language;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const projects = store.getProjects();
  const listEl = document.getElementById('expenses-list');
  const list = clientExpenses(store.getCollection(EXPENSES), currentClientId);

  if (list.length === 0) {
    listEl.innerHTML = `<div class="payments-empty">${t('expenses-empty')}</div>`;
    return;
  }
  listEl.innerHTML = '';
  list.forEach(e => {
    const row = document.createElement('div');
    row.className = 'payment-row';
    const dateStr = dayKeyToLocalDate(e.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const proj = e.projectId ? projects.find(p => p.id === e.projectId) : null;
    row.innerHTML = `
      <div class="payment-info">
        <span class="payment-amount expense-amount">${formatMoney(e.amount, currency)}</span>
        <span class="payment-date">${dateStr}</span>
        ${e.billable ? '' : `<span class="payment-auto-tag">${t('expense-not-billable')}</span>`}
        ${proj ? `<span class="payment-note">${escapeHtml(proj.name)}</span>` : ''}
        ${e.note ? `<span class="payment-note">${escapeHtml(e.note)}</span>` : ''}
      </div>
      <button class="btn-icon delete delete-expense-btn" data-id="${escapeHtml(e.id)}" title="${t('delete')}"><i data-lucide="x"></i></button>
    `;
    listEl.appendChild(row);
  });
  listEl.querySelectorAll('.delete-expense-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteExpense(btn.getAttribute('data-id')));
  });
  if (window.lucide) window.lucide.createIcons();
}

// changed() redraws whatever shows the client's balance.
export function initExpenses(changed) {
  onChanged = changed;
  document.getElementById('expense-add-btn').addEventListener('click', () => {
    if (!currentClientId) return;
    const record = buildExpense({
      clientId: currentClientId,
      projectId: document.getElementById('expense-project').value,
      date: document.getElementById('expense-date').value,
      amount: document.getElementById('expense-amount').value,
      note: document.getElementById('expense-note').value,
      billable: document.getElementById('expense-billable').checked
    });
    if (!record) {
      showToast(t('expense-invalid'), { type: 'error' });
      return;
    }
    store.upsertRecord(EXPENSES, record);
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-note').value = '';
    onChanged();
    showToast(t('expense-added'), { type: 'success' });
  });
  document.getElementById('expenses-export-btn').addEventListener('click', exportClientExpenses);
}
