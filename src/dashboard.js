// WE Time Tracker Dashboard Analytics Module
import Chart from 'chart.js/auto';
import { store } from './store.js';

let projectChartInstance = null;
let clientChartInstance = null;
let weeklyChartInstance = null;
let selectedActivityPeriod = '7';

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
  const periodSelect = document.getElementById('dash-activity-period');
  if (periodSelect) {
    periodSelect.addEventListener('change', (e) => {
      selectedActivityPeriod = e.target.value;
      renderDashboard();
    });
  }
}

export function renderDashboard() {
  const logs = store.getTimeLogs();
  const clients = store.getClients();
  const projects = store.getProjects();
  const lang = store.getSettings().language;

  // Sync the period dropdown to current selected value
  const periodSelect = document.getElementById('dash-activity-period');
  if (periodSelect) {
    periodSelect.value = selectedActivityPeriod;
  }
  
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
  
  // 4. Prepare Activity Chart Data
  const activityLabels = [];
  const activityData = [];
  const now = new Date();
  const isDayGrouping = ['7', '14', '30', 'current-month', 'last-month'].includes(selectedActivityPeriod);

  if (isDayGrouping) {
    let daysList = [];
    if (selectedActivityPeriod === '7' || selectedActivityPeriod === '14' || selectedActivityPeriod === '30') {
      const daysCount = parseInt(selectedActivityPeriod, 10);
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        daysList.push(d);
      }
    } else if (selectedActivityPeriod === 'current-month') {
      const currentDay = now.getDate();
      for (let i = 0; i < currentDay; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), 1 + i);
        daysList.push(d);
      }
    } else if (selectedActivityPeriod === 'last-month') {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthYear = lastMonthDate.getFullYear();
      const lastMonthMonth = lastMonthDate.getMonth();
      const daysInLastMonth = new Date(lastMonthYear, lastMonthMonth + 1, 0).getDate();
      for (let i = 0; i < daysInLastMonth; i++) {
        const d = new Date(lastMonthYear, lastMonthMonth, 1 + i);
        daysList.push(d);
      }
    }

    daysList.forEach(date => {
      // Format label
      if (selectedActivityPeriod === '7') {
        const weekdayNames = lang === 'ru' 
          ? ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
          : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        activityLabels.push(weekdayNames[date.getDay()]);
      } else {
        activityLabels.push(new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }).format(date));
      }

      // Sum hours for this day
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      let daySum = 0;
      logs.forEach(log => {
        const logStart = new Date(log.startTime);
        if (logStart >= dayStart && logStart <= dayEnd) {
          const duration = (new Date(log.endTime) - logStart) / 3600000;
          daySum += duration;
        }
      });
      activityData.push(Number(daySum.toFixed(2)));
    });
  } else {
    // Month grouping
    let monthsList = [];
    if (selectedActivityPeriod === '3-months') {
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthsList.push({ year: d.getFullYear(), month: d.getMonth() });
      }
    } else if (selectedActivityPeriod === '6-months') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthsList.push({ year: d.getFullYear(), month: d.getMonth() });
      }
    } else if (selectedActivityPeriod === '12-months') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthsList.push({ year: d.getFullYear(), month: d.getMonth() });
      }
    } else if (selectedActivityPeriod === 'current-year') {
      const currentYear = now.getFullYear();
      for (let m = 0; m <= now.getMonth(); m++) {
        monthsList.push({ year: currentYear, month: m });
      }
    } else if (selectedActivityPeriod === 'last-year') {
      const lastYear = now.getFullYear() - 1;
      for (let m = 0; m <= 11; m++) {
        monthsList.push({ year: lastYear, month: m });
      }
    }

    monthsList.forEach(m => {
      // Format month label
      const date = new Date(m.year, m.month, 1);
      activityLabels.push(new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', year: '2-digit' }).format(date));

      // Sum hours for this month
      const monthStart = new Date(m.year, m.month, 1, 0, 0, 0, 0);
      const monthEnd = new Date(m.year, m.month + 1, 0, 23, 59, 59, 999);
      let monthSum = 0;
      logs.forEach(log => {
        const logStart = new Date(log.startTime);
        if (logStart >= monthStart && logStart <= monthEnd) {
          const duration = (new Date(log.endTime) - logStart) / 3600000;
          monthSum += duration;
        }
      });
      activityData.push(Number(monthSum.toFixed(2)));
    });
  }

  // Render Project Chart
  renderProjectChart(projectLabels, projectData);
  
  // Render Client Chart
  renderClientChart(clientLabels, clientData);
  
  // Render Activity Chart
  renderWeeklyChart(activityLabels, activityData);
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

function getThemeColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    textColor: isLight ? '#475569' : '#94a3b8',
    gridColor: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.05)'
  };
}

function renderProjectChart(labels, data) {
  const ctx = document.getElementById('projectChart').getContext('2d');
  
  if (projectChartInstance) {
    projectChartInstance.destroy();
  }
  
  const colors = getThemeColors();
  
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
            color: colors.textColor,
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
  
  const colors = getThemeColors();
  
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
            color: colors.textColor,
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
  
  const colors = getThemeColors();
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
          ticks: { color: colors.textColor, font: { family: 'Inter' } }
        },
        y: {
          grid: { color: colors.gridColor },
          ticks: { color: colors.textColor, font: { family: 'Inter' } }
        }
      }
    }
  });
}
