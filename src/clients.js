// WE Time Tracker Clients and Projects Management Module
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { escapeHtml } from './utils.js';

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
    
    const isRu = store.getSettings().language === 'ru';

    // Баланс клиента: получено − наработано. >0 аванс, <0 долг, ~0 закрыт.
    const { balance } = store.getClientBalance(client.id);
    let balanceText, balanceColor;
    if (balance < -0.005) {
      balanceText = `${t('client-debt')}<span style="font-weight: 700;">${Math.abs(balance).toFixed(2)} €</span>`;
      balanceColor = 'var(--debt-color)';
    } else if (balance > 0.005) {
      balanceText = `${t('client-advance')}<span style="font-weight: 700;">${balance.toFixed(2)} €</span>`;
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
        <div class="entity-rate">${client.defaultRate} € / ${isRu ? 'час' : 'hour'}</div>
        <div style="font-size: 0.8rem; font-weight: 600; color: ${balanceColor}; margin-top: 4px;">
          ${balanceText}
        </div>
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
    
    const isRu = store.getSettings().language === 'ru';
    const rateText = proj.rate > 0 
      ? `${proj.rate} € / ${isRu ? 'час' : 'hour'}`
      : `${t('edit')} (0) ➔ ${store.getRate(proj.clientId, null)} € (${isRu ? 'наследует' : 'inherits'})`;
    
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
  
  const isRu = store.getSettings().language === 'ru';
  
  if (id) {
    title.textContent = isRu ? 'Редактировать клиента' : 'Edit Client';
    const client = store.getClients().find(c => c.id === id);
    if (client) {
      nameInput.value = client.name;
      rateInput.value = client.defaultRate;
    }
  } else {
    title.textContent = isRu ? 'Добавить клиента' : 'Add Client';
    nameInput.value = '';
    rateInput.value = '0';
  }
  
  modal.classList.add('active');
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
  editingClientId = null;
}

function openProjectModal(id = null) {
  const clients = store.getClients();
  const isRu = store.getSettings().language === 'ru';
  
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
    title.textContent = isRu ? 'Редактировать проект' : 'Edit Project';
    const proj = store.getProjects().find(p => p.id === id);
    if (proj) {
      nameInput.value = proj.name;
      populateProjectModalClients(proj.clientId);
      rateInput.value = proj.rate;
    }
  } else {
    title.textContent = isRu ? 'Добавить проект' : 'Add Project';
    nameInput.value = '';
    populateProjectModalClients();
    rateInput.value = '0';
  }
  
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

  renderPaymentsModal();
  modal.classList.add('active');
}

function renderPaymentsModal() {
  if (!paymentsClientId) return;
  const lang = store.getSettings().language;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const { billed, paid, balance } = store.getClientBalance(paymentsClientId);

  // Сводка баланса
  document.getElementById('payments-billed').textContent = `${billed.toFixed(2)} €`;
  document.getElementById('payments-paid').textContent = `${paid.toFixed(2)} €`;

  const balanceEl = document.getElementById('payments-balance');
  if (balance < -0.005) {
    balanceEl.textContent = `${t('client-debt')}${Math.abs(balance).toFixed(2)} €`;
    balanceEl.style.color = 'var(--debt-color)';
  } else if (balance > 0.005) {
    balanceEl.textContent = `${t('client-advance')}${balance.toFixed(2)} €`;
    balanceEl.style.color = 'var(--deposit-color)';
  } else {
    balanceEl.textContent = t('settled-up');
    balanceEl.style.color = 'var(--settled-color)';
  }

  // Список платежей (свежие сверху)
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
          <span class="payment-amount">+${Number(p.amount).toFixed(2)} €</span>
          <span class="payment-date">${dateStr}</span>
          ${p.note ? `<span class="payment-note">${escapeHtml(p.note)}</span>` : ''}
        </div>
        <button class="btn-icon delete delete-payment-btn" data-id="${p.id}" title="${t('delete')}"><i data-lucide="x"></i></button>
      `;
      listEl.appendChild(row);
    });

    listEl.querySelectorAll('.delete-payment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        store.deletePayment(paymentsClientId, btn.getAttribute('data-id'));
        renderPaymentsModal();
        renderClients();
      });
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

function closePaymentsModal() {
  document.getElementById('payments-modal').classList.remove('active');
  paymentsClientId = null;
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
      showToast(store.getSettings().language === 'ru' ? 'Введите название клиента!' : 'Enter client name!', { type: 'error' });
      return;
    }

    if (editingClientId) {
      store.updateClient(editingClientId, name, rate);
    } else {
      store.addClient(name, rate);
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
      showToast(store.getSettings().language === 'ru' ? 'Введите название проекта!' : 'Enter project name!', { type: 'error' });
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

  // Payments Modal
  document.getElementById('payments-modal-close').addEventListener('click', closePaymentsModal);
  document.getElementById('payments-modal-done').addEventListener('click', closePaymentsModal);

  document.getElementById('payment-add-btn').addEventListener('click', () => {
    if (!paymentsClientId) return;
    const amountVal = document.getElementById('payment-amount').value;
    const amount = Number(amountVal);
    const note = document.getElementById('payment-note').value;
    const isRu = store.getSettings().language === 'ru';

    if (!amountVal || isNaN(amount) || amount <= 0) {
      showToast(isRu ? 'Введите сумму больше нуля!' : 'Enter an amount greater than zero!', { type: 'error' });
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
