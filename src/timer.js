// WE Time Tracker Timer Module
import { store } from './store.js';
import { t } from './i18n.js';

let timerInterval = null;

// Helper to populate select element
function fillSelect(element, items, placeholderText, selectedId = null) {
  if (!element) return;
  element.innerHTML = '';
  
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = placeholderText;
  element.appendChild(placeholder);
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    if (selectedId && item.id === selectedId) {
      opt.selected = true;
    }
    element.appendChild(opt);
  });
}

// Format milliseconds into HH:MM:SS
function formatTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  
  return [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');
}

// Set manual inputs default times
function setDefaultManualTimes() {
  const startEl = document.getElementById('manual-start');
  const endEl = document.getElementById('manual-end');
  
  if (startEl && endEl) {
    const now = new Date();
    // Round to nearest minute
    now.setSeconds(0, 0);
    const endStr = new Date(now).toISOString().slice(0, 16);
    
    // Default start is 1 hour ago
    now.setHours(now.getHours() - 1);
    const startStr = now.toISOString().slice(0, 16);
    
    startEl.value = startStr;
    endEl.value = endStr;
  }
}

// Update all client/project dropdown selections in the timer view
export function updateTimerDropdowns() {
  const timerClient = document.getElementById('timer-client-select');
  const manualClient = document.getElementById('manual-client-select');
  const clients = store.getClients();
  
  const currentLang = store.getSettings().language;
  const clientPlaceholder = currentLang === 'ru' ? 'Выберите клиента' : 'Select client';
  
  // Save currently selected values
  const activeTimer = store.getActiveTimer();
  const selectedTimerClient = activeTimer ? activeTimer.clientId : timerClient.value;
  const selectedManualClient = manualClient.value;
  
  fillSelect(timerClient, clients, clientPlaceholder, selectedTimerClient);
  fillSelect(manualClient, clients, clientPlaceholder, selectedManualClient);
  
  // Trigger project updates if client was selected
  updateProjectDropdown('timer');
  updateProjectDropdown('manual');
}

function updateProjectDropdown(prefix) {
  const clientSelect = document.getElementById(`${prefix}-client-select`);
  const projSelect = document.getElementById(`${prefix}-project-select`);
  if (!clientSelect || !projSelect) return;
  
  const clientId = clientSelect.value;
  const currentLang = store.getSettings().language;
  const projPlaceholder = currentLang === 'ru' ? 'Выберите проект (опционально)' : 'Select project (optional)';
  
  if (clientId) {
    const projects = store.getProjects(clientId);
    fillSelect(projSelect, projects, projPlaceholder);
    projSelect.disabled = false;
  } else {
    projSelect.innerHTML = `<option value="">${projPlaceholder}</option>`;
    projSelect.disabled = true;
  }
}

// Timer tick action
function tick() {
  const timer = store.getActiveTimer();
  if (!timer) {
    stopTimerTicking();
    return;
  }
  
  const clockEl = document.getElementById('timer-clock');
  if (clockEl) {
    const elapsed = Date.now() - new Date(timer.startTime).getTime();
    clockEl.textContent = formatTime(elapsed);
  }
}

function startTimerTicking() {
  if (timerInterval) clearInterval(timerInterval);
  tick(); // immediate call
  timerInterval = setInterval(tick, 500);
  
  const clockEl = document.getElementById('timer-clock');
  if (clockEl) clockEl.classList.add('running');
}

function stopTimerTicking() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const clockEl = document.getElementById('timer-clock');
  if (clockEl) {
    clockEl.textContent = '00:00:00';
    clockEl.classList.remove('running');
  }
}

// Update the look of the start/stop button based on active timer status
function refreshTimerUI() {
  const activeTimer = store.getActiveTimer();
  const toggleBtn = document.getElementById('timer-toggle-btn');
  const cancelBtn = document.getElementById('timer-cancel-btn');
  
  const descInput = document.getElementById('timer-desc');
  const clientSelect = document.getElementById('timer-client-select');
  const projSelect = document.getElementById('timer-project-select');
  const billableCheck = document.getElementById('timer-billable');
  
  const currentLang = store.getSettings().language;
  
  if (activeTimer) {
    // Timer is running
    toggleBtn.textContent = currentLang === 'ru' ? 'Стоп' : 'Stop';
    toggleBtn.className = 'btn btn-timer btn-timer-stop';
    cancelBtn.style.display = 'inline-flex';
    
    // Sync values with active timer state
    descInput.value = activeTimer.description;
    
    // Disable inputs while running to protect tracking integrity
    descInput.disabled = true;
    clientSelect.disabled = true;
    projSelect.disabled = true;
    billableCheck.disabled = true;
    
    // Update selected client and projects dropdown
    fillSelect(clientSelect, store.getClients(), currentLang === 'ru' ? 'Выберите клиента' : 'Select client', activeTimer.clientId);
    if (activeTimer.clientId) {
      fillSelect(projSelect, store.getProjects(activeTimer.clientId), currentLang === 'ru' ? 'Выберите проект (опционально)' : 'Select project (optional)', activeTimer.projectId);
      projSelect.disabled = true;
    }
    billableCheck.checked = activeTimer.billable;
    
    startTimerTicking();
  } else {
    // Timer is stopped
    toggleBtn.textContent = currentLang === 'ru' ? 'Старт' : 'Start';
    toggleBtn.className = 'btn btn-timer btn-timer-start';
    cancelBtn.style.display = 'none';
    
    // Enable inputs
    descInput.disabled = false;
    clientSelect.disabled = false;
    // project select will be enabled based on whether client is selected
    if (clientSelect.value) {
      projSelect.disabled = false;
    } else {
      projSelect.disabled = true;
    }
    billableCheck.disabled = false;
    
    stopTimerTicking();
  }
}

export function initTimer() {
  const toggleBtn = document.getElementById('timer-toggle-btn');
  const cancelBtn = document.getElementById('timer-cancel-btn');
  
  const timerClientSelect = document.getElementById('timer-client-select');
  const manualClientSelect = document.getElementById('manual-client-select');
  
  const manualAddBtn = document.getElementById('manual-add-btn');
  
  // Set dropdowns
  updateTimerDropdowns();
  setDefaultManualTimes();
  
  // Client selection changes filter project dropdowns
  timerClientSelect.addEventListener('change', () => {
    updateProjectDropdown('timer');
  });
  
  manualClientSelect.addEventListener('change', () => {
    updateProjectDropdown('manual');
  });
  
  // Start / Stop Toggle Button
  toggleBtn.addEventListener('click', () => {
    const activeTimer = store.getActiveTimer();
    
    if (activeTimer) {
      // STOP TIMER
      store.stopTimer();
      // Clear description
      document.getElementById('timer-desc').value = '';
    } else {
      // START TIMER
      const desc = document.getElementById('timer-desc').value;
      const clientId = timerClientSelect.value;
      const projectId = document.getElementById('timer-project-select').value;
      const billable = document.getElementById('timer-billable').checked;
      
      // Validation: Must select client
      if (!clientId) {
        alert(store.getSettings().language === 'ru' 
          ? 'Пожалуйста, выберите клиента для запуска таймера.' 
          : 'Please select a client to start the timer.');
        return;
      }
      
      store.startTimer(desc, clientId, projectId, billable);
    }
    
    refreshTimerUI();
  });
  
  // Cancel Timer Button
  cancelBtn.addEventListener('click', () => {
    if (confirm(store.getSettings().language === 'ru' 
      ? 'Вы уверены, что хотите отменить текущий таймер? Время не сохранится.' 
      : 'Are you sure you want to cancel the current timer? Time will not be saved.')) {
      store.cancelTimer();
      document.getElementById('timer-desc').value = '';
      refreshTimerUI();
    }
  });
  
  // Add Manual Entry
  manualAddBtn.addEventListener('click', () => {
    const desc = document.getElementById('manual-desc').value;
    const clientId = manualClientSelect.value;
    const projectId = document.getElementById('manual-project-select').value;
    const startVal = document.getElementById('manual-start').value;
    const endVal = document.getElementById('manual-end').value;
    const billable = document.getElementById('manual-billable').checked;
    
    const isRu = store.getSettings().language === 'ru';
    
    if (!clientId) {
      alert(isRu ? 'Выберите клиента!' : 'Select a client!');
      return;
    }
    if (!startVal || !endVal) {
      alert(isRu ? 'Укажите время начала и окончания!' : 'Specify start and end times!');
      return;
    }
    
    const startTime = new Date(startVal).toISOString();
    const endTime = new Date(endVal).toISOString();
    
    if (new Date(startTime) >= new Date(endTime)) {
      alert(isRu ? 'Время окончания должно быть позже времени начала!' : 'End time must be after start time!');
      return;
    }
    
    store.addTimeLog({
      description: desc,
      clientId,
      projectId,
      startTime,
      endTime,
      billable
    });
    
    // Clear inputs and reset times
    document.getElementById('manual-desc').value = '';
    manualClientSelect.value = '';
    const manualProjSelect = document.getElementById('manual-project-select');
    manualProjSelect.innerHTML = `<option value="">${isRu ? 'Выберите проект (опционально)' : 'Select project (optional)'}</option>`;
    manualProjSelect.disabled = true;
    setDefaultManualTimes();
    
    alert(isRu ? 'Запись времени успешно добавлена!' : 'Time log successfully added!');
  });
  
  // Check if a timer was already running on load
  refreshTimerUI();
}
