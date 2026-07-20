// WE Time Tracker Dashboard Analytics Module
import { store } from './store.js';

let projectChartInstance = null;
let clientChartInstance = null;
let weeklyChartInstance = null;

// Color palette for charts (premium translucent neon colors)
const CHART_COLORS = [
  'rgba(99, 102, 241, 0.85)',   // Indigo
  'rgba(0, 242, 254, 0.85)',    // Cyan
  'rgba(16, 185, 129, 0.85)',   // Emerald Green
  'rgba(245, 158, 11, 0.85)',   // Amber
  'rgba(244, 63, 94, 0.85)',    // Rose Red
  'rgba(168, 85, 247, 0.85)',   // Purple
  'rgba(59, 130, 246, 0.85)'    // Blue
];

const CHART_BORDERS = [
  '#6366f1', '#00f2fe', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#3b82f6'
];

function formatDuration(decimalHours, lang) {
  const hrs = Math.floor(decimalHours);
  const mins = Math.round((decimalHours - hrs) * 60);
  return lang === 'ru' ? `${hrs}ч ${mins}м` : `${hrs}h ${mins}m`;
}

function calculateStats(logs) {
  let totalHours = 0;
  let totalEarnings = 0;
  
  logs.forEach(log => {
    const duration = (new Date(log.endTime) - new Date(log.startTime)) / 3600000; // hours
    totalHours += duration;
    
    if (log.billable) {
      totalEarnings += duration * (log.rateAtTime || 0);
    }
  });
  
  return { totalHours, totalEarnings };
}

export function initDashboard() {
  // Empty, renders dynamically on triggerViewRender
}

export function renderDashboard() {
  const logs = store.getTimeLogs();
  const clients = store.getClients();
  const projects = store.getProjects();
  const lang = store.getSettings().language;
  
  // 1. Calculate and update stats counters
  const { totalHours, totalEarnings } = calculateStats(logs);
  
  document.getElementById('dash-hours-val').textContent = formatDuration(totalHours, lang);
  document.getElementById('dash-earnings-val').textContent = `${totalEarnings.toFixed(2)} €`;
  document.getElementById('dash-projects-val').textContent = projects.length;
  document.getElementById('dash-clients-val').textContent = clients.length;
  
  // Check if we have logs to render charts
  if (logs.length === 0) {
    showEmptyState(true);
    return;
  }
  showEmptyState(false);
  
  // 2. Prepare Project Chart Data
  const projectTimes = {};
  logs.forEach(log => {
    const projId = log.projectId || 'none';
    const duration = (new Date(log.endTime) - new Date(log.startTime)) / 3600000;
    
    if (!projectTimes[projId]) projectTimes[projId] = 0;
    projectTimes[projId] += duration;
  });
  
  const projectLabels = [];
  const projectData = [];
  
  Object.keys(projectTimes).forEach(projId => {
    if (projId === 'none') {
      projectLabels.push(lang === 'ru' ? 'Без проекта' : 'No Project');
    } else {
      const proj = projects.find(p => p.id === projId);
      projectLabels.push(proj ? proj.name : (lang === 'ru' ? 'Удаленный проект' : 'Deleted Project'));
    }
    projectData.push(Number(projectTimes[projId].toFixed(2)));
  });
  
  // 3. Prepare Client Chart Data
  const clientTimes = {};
  logs.forEach(log => {
    const clientId = log.clientId || 'none';
    const duration = (new Date(log.endTime) - new Date(log.startTime)) / 3600000;
    
    if (!clientTimes[clientId]) clientTimes[clientId] = 0;
    clientTimes[clientId] += duration;
  });
  
  const clientLabels = [];
  const clientData = [];
  
  Object.keys(clientTimes).forEach(cId => {
    if (cId === 'none') {
      clientLabels.push(lang === 'ru' ? 'Без клиента' : 'No Client');
    } else {
      const client = clients.find(c => c.id === cId);
      clientLabels.push(client ? client.name : (lang === 'ru' ? 'Удаленный клиент' : 'Deleted Client'));
    }
    clientData.push(Number(clientTimes[cId].toFixed(2)));
  });
  
  // 4. Prepare Weekly Activity Chart Data (last 7 days)
  const weekdayNames = lang === 'ru' 
    ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
  const dailyHours = Array(7).fill(0);
  const dailyLabels = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dailyLabels.push(weekdayNames[date.getDay()]);
    
    // Sum hours for this specific day
    const dayStart = new Date(date.setHours(0, 0, 0, 0));
    const dayEnd = new Date(date.setHours(23, 59, 59, 999));
    
    logs.forEach(log => {
      const logStart = new Date(log.startTime);
      if (logStart >= dayStart && logStart <= dayEnd) {
        const duration = (new Date(log.endTime) - logStart) / 3600000;
        dailyHours[6 - i] += duration;
      }
    });
  }
  
  // Render Project Chart
  renderProjectChart(projectLabels, projectData);
  
  // Render Client Chart
  renderClientChart(clientLabels, clientData);
  
  // Render Weekly Chart
  renderWeeklyChart(dailyLabels, dailyHours.map(h => Number(h.toFixed(2))));
}

function showEmptyState(show) {
  const chartContainers = document.querySelectorAll('.chart-card');
  chartContainers.forEach(container => {
    let emptyEl = container.querySelector('.dash-empty-state');
    const canvas = container.querySelector('canvas');
    
    if (show) {
      if (canvas) canvas.style.display = 'none';
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.className = 'dash-empty-state';
        emptyEl.innerHTML = `
          <i data-lucide="inbox"></i>
          <span data-i18n="dash-no-data">Нет данных за выбранный период</span>
        `;
        container.appendChild(emptyEl);
        if (window.lucide) window.lucide.createIcons();
      } else {
        emptyEl.style.display = 'flex';
      }
    } else {
      if (canvas) canvas.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
    }
  });
}

function renderProjectChart(labels, data) {
  const ctx = document.getElementById('projectChart').getContext('2d');
  
  if (projectChartInstance) {
    projectChartInstance.destroy();
  }
  
  projectChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: CHART_BORDERS.slice(0, labels.length),
        borderWidth: 1.5,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const lang = store.getSettings().language;
              return ` ${formatDuration(val, lang)}`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

function renderClientChart(labels, data) {
  const ctx = document.getElementById('clientChart').getContext('2d');
  
  if (clientChartInstance) {
    clientChartInstance.destroy();
  }
  
  clientChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: CHART_BORDERS.slice(0, labels.length),
        borderWidth: 1.5,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const lang = store.getSettings().language;
              return ` ${formatDuration(val, lang)}`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

function renderWeeklyChart(labels, data) {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  
  if (weeklyChartInstance) {
    weeklyChartInstance.destroy();
  }
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.7)'); // indigo
  gradient.addColorStop(1, 'rgba(168, 85, 247, 0.1)'); // purple
  
  weeklyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: gradient,
        borderColor: '#6366f1',
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const lang = store.getSettings().language;
              return ` ${formatDuration(val, lang)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Inter' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter' } }
        }
      }
    }
  });
}
