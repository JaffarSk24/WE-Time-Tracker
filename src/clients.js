// WE Time Tracker Clients and Projects Management Module
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { escapeHtml, formatMoney, currencySymbol } from './utils.js';
import { currencyOfClient, defaultCurrency } from './currency.js';
import { initExpenses, openExpensesSection, closeExpensesSection, renderExpensesSection } from './expenses.js';

let editingClientId = null;
let editingProjectId = null;
let paymentsClientId = null;

// Populate project modal client select
function populateProjectModalClients(selectedId = null) {
  const select = document.getElementById('project-modal-client');
  if (!select) return;
  
  select.innerHTML = '';
  const clients = store.getClients();
  
  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (selectedId && c.id === selectedId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

// ---------------- CLIENTS TAB ----------------
export function renderClients() {
  const grid = document.getElementById('clients-grid');
  const searchVal = document.getElementById('search-clients').value.toLowerCase();
  if (!grid) return;
  
  grid.innerHTML = '';
  
  const clients = store.getClients().filter(c => 
    c.name.toLowerCase().includes(searchVal)
  );
  
  clients.forEach(client => {
    const card = document.createElement('div');
    card.className = 'entity-card';
    

    // Client balance: received − billed. >0 advance, <0 debt, ~0 settled.
    const { balance, expenses } = store.getClientBalance(client.id);
    const currency = currencyOfClient(client.id);
    let balanceText, balanceColor;
    if (balance < -0.005) {
      balanceText = `${t('client-debt')}<span style="font-weight: 700;">${formatMoney(Math.abs(balance), currency)}</span>`;
      balanceColor = 'var(--debt-color)';
    } else if (balance > 0.005) {
      balanceText = `${t('client-advance')}<span style="font-weight: 700;">${formatMoney(balance, currency)}</span>`;
      balanceColor = 'var(--deposit-color)';
    } else {
      balanceText = t('settled-up');
      balanceColor = 'var(--settled-color)';
    }

    card.innerHTML = `
      <div>
        <div class="entity-name">${escapeHtml(client.name)}</div>
        <div class="entity-meta">ID: ${client.id.substring(7, 15)}...</div>
      </div>
      <div>
        <div class="entity-rate">${client.defaultRate} ${currencySymbol(currency)} / ${t('per-hour')}</div>
        <div style="font-size: 0.8rem; font-weight: 600; color: ${balanceColor}; margin-top: 4px;">
          ${balanceText}
        </div>
        ${expenses > 0.005 ? `<div class="entity-expenses">${t('expenses-included', { amount: formatMoney(expenses, currency) })}</div>` : ''}
      </div>
      <div class="entity-actions">
        <button class="btn-icon payments-client-btn" data-id="${client.id}" title="${t('payments-title')}">
          <i data-lucide="wallet"></i>
        </button>
        <button class="btn-icon edit-client-btn" data-id="${client.id}" title="${t('edit')}">
          <i data-lucide="edit-2"></i>
        </button>
        <button class="btn-icon delete delete-client-btn" data-id="${client.id}" title="${t('delete')}">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  // Attach card actions
  document.querySelectorAll('.payments-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openPaymentsModal(btn.getAttribute('data-id'));
    });
  });

  document.querySelectorAll('.edit-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openClientModal(btn.getAttribute('data-id'));
    });
  });
  
  document.querySelectorAll('.delete-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm(t('confirm-delete-client'))) {
        store.deleteClient(id);
        renderClients();
      }
    });
  });
  
  if (window.lucide) window.lucide.createIcons();
}

// ---------------- PROJECTS TAB ----------------
export function renderProjects() {
  const grid = document.getElementById('projects-grid');
  const searchVal = document.getElementById('search-projects').value.toLowerCase();
  if (!grid) return;
  
  grid.innerHTML = '';
  
  const projects = store.getProjects().filter(p => 
    p.name.toLowerCase().includes(searchVal)
  );
  
  const clients = store.getClients();
  
  projects.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'entity-card';
    
    const client = clients.find(c => c.id === proj.clientId);
    const clientName = client ? client.name : t('unknown-client');
    
    const symbol = currencySymbol(currencyOfClient(proj.clientId));
    const rateText = proj.rate > 0 
      ? `${proj.rate} ${symbol} / ${t('per-hour')}`
      : `${t('edit')} (0) ➔ ${store.getRate(proj.clientId, null)} ${symbol} (${t('inherits')})`;
    
    card.innerHTML = `
      <div>
        <div class="entity-name">${escapeHtml(proj.name)}</div>
        <div class="entity-meta" style="color: var(--accent-indigo); font-weight: 500;">
          <i data-lucide="building" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:3px;"></i> ${escapeHtml(clientName)}
        </div>
      </div>
      <div class="entity-rate">${rateText}</div>
      <div class="entity-actions">
        <button class="btn-icon edit-project-btn" data-id="${proj.id}" title="${t('edit')}">
          <i data-lucide="edit-2"></i>
        </button>
        <button class="btn-icon delete delete-project-btn" data-id="${proj.id}" title="${t('delete')}">
          <i data-lucide="x"></i>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
  
  // Attach card actions
  document.querySelectorAll('.edit-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openProjectModal(btn.getAttribute('data-id'));
    });
  });
  
  document.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (confirm(t('confirm-delete-project'))) {
        store.deleteProject(id);
        renderProjects();
      }
    });
  });
  
  if (window.lucide) window.lucide.createIcons();
}

// ---------------- MODALS OPERATIONS ----------------
function openClientModal(id = null) {
  editingClientId = id;
  const modal = document.getElementById('client-modal');
  const title = document.getElementById('client-modal-title');
  const nameInput = document.getElementById('client-modal-name');
  const rateInput = document.getElementById('client-modal-rate');
  const currencySelect = document.getElementById('client-modal-currency');
  
  
  if (id) {
    title.textContent = t('edit-client-title');
    const client = store.getClients().find(c => c.id === id);
    if (client) {
      nameInput.value = client.name;
      rateInput.value = client.defaultRate;
    }
    currencySelect.value = currencyOfClient(id);
  } else {
    title.textContent = t('add-client-title');
    nameInput.value = '';
    rateInput.value = '0';
    currencySelect.value = defaultCurrency();
  }
  setRateLabelCurrency('client-modal-rate-label', 'client-rate-label-cur', currencySelect.value);
  
  modal.classList.add('active');
}

// Rate labels name the currency, e.g. "(USD/hour)". The params attribute
// keeps the label right when the page is translated again.
function setRateLabelCurrency(labelId, key, currency) {
  const label = document.getElementById(labelId);
  if (!label) return;
  const params = { currency };
  label.dataset.i18nParams = JSON.stringify(params);
  label.textContent = t(key, params);
}

function updateProjectRateLabel() {
  const clientId = document.getElementById('project-modal-client').value;
  setRateLabelCurrency('project-modal-rate-label', 'project-rate-label-cur', currencyOfClient(clientId));
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
  editingClientId = null;
}

function openProjectModal(id = null) {
  const clients = store.getClients();
  
  if (clients.length === 0) {
    alert(t('no-clients-warning'));
    return;
  }
  
  editingProjectId = id;
  const modal = document.getElementById('project-modal');
  const title = document.getElementById('project-modal-title');
  const nameInput = document.getElementById('project-modal-name');
  const rateInput = document.getElementById('project-modal-rate');
  
  if (id) {
    title.textContent = t('edit-project-title');
    const proj = store.getProjects().find(p => p.id === id);
    if (proj) {
      nameInput.value = proj.name;
      populateProjectModalClients(proj.clientId);
      rateInput.value = proj.rate;
    }
  } else {
    title.textContent = t('add-project-title');
    nameInput.value = '';
    populateProjectModalClients();
    rateInput.value = '0';
  }
  updateProjectRateLabel();
  
  modal.classList.add('active');
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('active');
  editingProjectId = null;
}

// ---------------- PAYMENTS / DEPOSITS MODAL ----------------
function openPaymentsModal(clientId) {
  paymentsClientId = clientId;
  const modal = document.getElementById('payments-modal');
  const client = store.getClients().find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('payments-modal-client-name').textContent = client.name;
  document.getElementById('payment-amount').value = '';
  document.getElementById('payment-note').value = '';

  openExpensesSection(clientId);
  renderPaymentsModal();
  modal.classList.add('active');
}

function renderPaymentsModal() {
  if (!paymentsClientId) return;
  const lang = store.getSettings().language;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const { billed, paid, balance, expenses } = store.getClientBalance(paymentsClientId);
  const currency = currencyOfClient(paymentsClientId);

  // Balance summary
  document.getElementById('payments-billed').textContent = formatMoney(billed, currency);
  document.getElementById('payments-paid').textContent = formatMoney(paid, currency);
  document.getElementById('payments-expenses-included').textContent =
    expenses > 0.005 ? t('expenses-included', { amount: formatMoney(expenses, currency) }) : '';
  document.getElementById('payment-amount-suffix').textContent = currencySymbol(currency);

  const balanceEl = document.getElementById('payments-balance');
  if (balance < -0.005) {
    balanceEl.textContent = `${t('client-debt')}${formatMoney(Math.abs(balance), currency)}`;
    balanceEl.style.color = 'var(--debt-color)';
  } else if (balance > 0.005) {
    balanceEl.textContent = `${t('client-advance')}${formatMoney(balance, currency)}`;
    balanceEl.style.color = 'var(--deposit-color)';
  } else {
    balanceEl.textContent = t('settled-up');
    balanceEl.style.color = 'var(--settled-color)';
  }

  // Payments list (newest first)
  const listEl = document.getElementById('payments-list');
  const payments = [...store.getPayments(paymentsClientId)].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (payments.length === 0) {
    listEl.innerHTML = `<div class="payments-empty">${t('payments-empty')}</div>`;
  } else {
    listEl.innerHTML = '';
    payments.forEach(p => {
      const row = document.createElement('div');
      row.className = 'payment-row';
      const dateStr = new Date(p.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
      row.innerHTML = `
        <div class="payment-info">
          <span class="payment-amount">+${formatMoney(p.amount, currency)}</span>
          <span class="payment-date">${dateStr}</span>
          ${p.auto ? `<span class="payment-auto-tag">${t('payment-from-logs')}</span>` : ''}
          ${p.note ? `<span class="payment-note">${escapeHtml(p.note)}</span>` : ''}
        </div>
        <button class="btn-icon delete delete-payment-btn" data-id="${p.id}" title="${t('delete')}"><i data-lucide="x"></i></button>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.delete-payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const paymentId = btn.getAttribute('data-id');
        const payment = store.getPayments(paymentsClientId).find(p => p.id === paymentId);
        // Deleting a payment generated by "mark as paid" also un-marks those
        // logs, so the ledger and the entries never contradict each other.
        if (payment && payment.auto && payment.logAmounts) {
          store.setLogsPaid(Object.keys(payment.logAmounts), false);
        } else {
          store.deletePayment(paymentsClientId, paymentId);
        }
        renderPaymentsModal();
        renderClients();
      });
    });
  }

  renderExpensesSection();
  if (window.lucide) window.lucide.createIcons();
}

function closePaymentsModal() {
  document.getElementById('payments-modal').classList.remove('active');
  paymentsClientId = null;
  closeExpensesSection();
}

export function initClients() {
  // Tabs management
  const tabClients = document.getElementById('tab-clients');
  const tabProjects = document.getElementById('tab-projects');
  const panelClients = document.getElementById('panel-clients');
  const panelProjects = document.getElementById('panel-projects');
  
  tabClients.addEventListener('click', () => {
    tabClients.classList.add('active');
    tabProjects.classList.remove('active');
    panelClients.classList.add('active');
    panelProjects.classList.remove('active');
    renderClients();
  });
  
  tabProjects.addEventListener('click', () => {
    tabProjects.classList.add('active');
    tabClients.classList.remove('active');
    panelProjects.classList.add('active');
    panelClients.classList.remove('active');
    renderProjects();
  });
  
  // Search actions
  document.getElementById('search-clients').addEventListener('input', renderClients);
  document.getElementById('search-projects').addEventListener('input', renderProjects);
  
  // Client Modal open/close
  document.getElementById('add-client-btn').addEventListener('click', () => openClientModal());
  document.getElementById('client-modal-close').addEventListener('click', closeClientModal);
  document.getElementById('client-modal-cancel').addEventListener('click', closeClientModal);
  
  // Save Client
  document.getElementById('client-modal-save').addEventListener('click', () => {
    const name = document.getElementById('client-modal-name').value;
    const rate = document.getElementById('client-modal-rate').value;
    
    if (!name.trim()) {
      showToast(t('enter-client-name'), { type: 'error' });
      return;
    }

    const currency = document.getElementById('client-modal-currency').value;
    if (editingClientId) {
      store.updateClient(editingClientId, name, rate);
      store.patchRecord('clients', editingClientId, { currency });
    } else {
      const client = store.addClient(name, rate);
      store.patchRecord('clients', client.id, { currency });
    }

    closeClientModal();
    showToast(t('toast-saved'), { type: 'success' });
    renderClients();
  });
  
  // Project Modal open/close
  document.getElementById('add-project-btn').addEventListener('click', () => openProjectModal());
  document.getElementById('project-modal-close').addEventListener('click', closeProjectModal);
  document.getElementById('project-modal-cancel').addEventListener('click', closeProjectModal);
  
  // Save Project
  document.getElementById('project-modal-save').addEventListener('click', () => {
    const name = document.getElementById('project-modal-name').value;
    const clientId = document.getElementById('project-modal-client').value;
    const rate = document.getElementById('project-modal-rate').value;
    
    if (!name.trim()) {
      showToast(t('enter-project-name'), { type: 'error' });
      return;
    }

    if (editingProjectId) {
      store.updateProject(editingProjectId, name, clientId, rate);
    } else {
      store.addProject(name, clientId, rate);
    }

    closeProjectModal();
    showToast(t('toast-saved'), { type: 'success' });
    renderProjects();
  });

  document.getElementById('client-modal-currency').addEventListener('change', (e) => {
    setRateLabelCurrency('client-modal-rate-label', 'client-rate-label-cur', e.target.value);
  });
  document.getElementById('project-modal-client').addEventListener('change', updateProjectRateLabel);

  // Payments Modal
  initExpenses(() => {
    renderPaymentsModal();
    renderClients();
  });
  document.getElementById('payments-modal-close').addEventListener('click', closePaymentsModal);
  document.getElementById('payments-modal-done').addEventListener('click', closePaymentsModal);

  document.getElementById('payment-add-btn').addEventListener('click', () => {
    if (!paymentsClientId) return;
    const amountVal = document.getElementById('payment-amount').value;
    const amount = Number(amountVal);
    const note = document.getElementById('payment-note').value;

    if (!amountVal || isNaN(amount) || amount <= 0) {
      showToast(t('enter-positive-amount'), { type: 'error' });
      return;
    }

    store.addPayment(paymentsClientId, amount, note);
    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-note').value = '';
    renderPaymentsModal();
    renderClients();
    showToast(t('payment-added'), { type: 'success' });
  });
}
