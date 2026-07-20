// WE Time Tracker Clients and Projects Management Module
import { store } from './store.js';
import { t } from './i18n.js';

let editingClientId = null;
let editingProjectId = null;

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
    
    card.innerHTML = `
      <div>
        <div class="entity-name">${client.name}</div>
        <div class="entity-meta">ID: ${client.id.substring(7, 15)}...</div>
      </div>
      <div class="entity-rate">${client.defaultRate} € / ${isRu ? 'час' : 'hour'}</div>
      <div class="entity-actions">
        <button class="btn btn-secondary btn-sm edit-client-btn" data-id="${client.id}">
          <i data-lucide="edit-2"></i> ${t('edit')}
        </button>
        <button class="btn btn-danger btn-sm delete-client-btn" data-id="${client.id}">
          <i data-lucide="trash-2"></i> ${t('delete')}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
  
  // Attach card actions
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
    const clientName = client ? client.name : (store.getSettings().language === 'ru' ? 'Неизвестный клиент' : 'Unknown Client');
    
    const isRu = store.getSettings().language === 'ru';
    const rateText = proj.rate > 0 
      ? `${proj.rate} € / ${isRu ? 'час' : 'hour'}`
      : `${t('edit')} (0) ➔ ${store.getRate(proj.clientId, null)} € (${isRu ? 'наследует' : 'inherits'})`;
    
    card.innerHTML = `
      <div>
        <div class="entity-name">${proj.name}</div>
        <div class="entity-meta" style="color: var(--accent-indigo); font-weight: 500;">
          <i data-lucide="building" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:3px;"></i> ${clientName}
        </div>
      </div>
      <div class="entity-rate">${rateText}</div>
      <div class="entity-actions">
        <button class="btn btn-secondary btn-sm edit-project-btn" data-id="${proj.id}">
          <i data-lucide="edit-2"></i> ${t('edit')}
        </button>
        <button class="btn btn-danger btn-sm delete-project-btn" data-id="${proj.id}">
          <i data-lucide="trash-2"></i> ${t('delete')}
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
  const clientSelect = document.getElementById('project-modal-client');
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
      alert(store.getSettings().language === 'ru' ? 'Введите название клиента!' : 'Enter client name!');
      return;
    }
    
    if (editingClientId) {
      store.updateClient(editingClientId, name, rate);
    } else {
      store.addClient(name, rate);
    }
    
    closeClientModal();
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
      alert(store.getSettings().language === 'ru' ? 'Введите название проекта!' : 'Enter project name!');
      return;
    }
    
    if (editingProjectId) {
      store.updateProject(editingProjectId, name, clientId, rate);
    } else {
      store.addProject(name, clientId, rate);
    }
    
    closeProjectModal();
    renderProjects();
  });
}
