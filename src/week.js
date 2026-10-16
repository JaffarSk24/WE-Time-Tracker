// WE Time Tracker: weekly timesheet (grid of hours by client / project and
// day) and the day timeline with overlap detection below it.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { openEditLogModal } from './reports.js';
import { escapeHtml, logDurationMs, localDayKey, dayKeyToLocalDate, formatDurationShort, formatDurationHMS } from './utils.js';
import {
  startOfWeek, addWeeks, weekDays, buildWeekGrid, nextManualStart,
  findOverlaps, overlapsWith, timelineRange, findGaps, clientHue, assignLanes, rowKeyOf
} from './timesheet.js';

let weekStart = startOfWeek(new Date());
let selectedDay = localDayKey(new Date());
// The timesheet cell whose modal is open: { clientId, projectId, dayKey }
let openCell = null;

function locale() {
  return store.getSettings().language === 'ru' ? 'ru-RU' : 'en-US';
}

function formatTime(msOrIso) {
  return new Date(msOrIso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

// Compact hours for the grid cells: "1:30".
function formatHM(durMs) {
  const totalMin = Math.round(durMs / 60000);
  return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`;
}

function formatAmount(amount) {
  return `${amount.toFixed(2)} €`;
}

function rowLabel(clientId, projectId) {
  const client = store.getClients().find(c => c.id === clientId);
  const proj = projectId ? store.getProjects().find(p => p.id === projectId) : null;
  const clientName = client ? client.name : t('unknown-client');
  return proj ? `${clientName} · ${proj.name}` : clientName;
}

function formatDayLong(dayKey) {
  const s = dayKeyToLocalDate(dayKey).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function selectWeek(start) {
  weekStart = start;
  const days = weekDays(weekStart).map(d => localDayKey(d));
  const today = localDayKey(new Date());
  if (!days.includes(selectedDay)) selectedDay = days.includes(today) ? today : days[0];
  renderWeek();
}

// ---------------- GRID ----------------
function renderGrid(grid) {
  const container = document.getElementById('week-grid-container');
  const lang = store.getSettings().language;
  const today = localDayKey(new Date());

  document.getElementById('week-total-hours').textContent = `${t('week-total')}: ${formatDurationShort(grid.totalMs / 3600000, lang)}`;
  document.getElementById('week-total-amount').textContent = grid.amount > 0 ? formatAmount(grid.amount) : '';

  const dayHeaders = grid.days.map(dayKey => {
    const d = dayKeyToLocalDate(dayKey);
    const wd = d.toLocaleDateString(locale(), { weekday: 'short' });
    const cls = ['week-day-head', dayKey === today ? 'today' : '', dayKey === selectedDay ? 'selected' : ''].join(' ');
    return `<th class="${cls}" data-day="${dayKey}" title="${escapeHtml(t('week-select-day'))}">
      <span class="week-day-name">${escapeHtml(wd)}</span><span class="week-day-num">${d.getDate()}</span>
    </th>`;
  }).join('');

  let body;
  if (grid.rows.length === 0) {
    body = `<tr><td class="week-empty" colspan="10">
      <i data-lucide="calendar-x"></i><span>${escapeHtml(t('week-empty'))}</span>
    </td></tr>`;
  } else {
    const rows = [...grid.rows].sort((a, b) => rowLabel(a.clientId, a.projectId).localeCompare(rowLabel(b.clientId, b.projectId)));
    body = rows.map(row => {
      const cells = grid.days.map(dayKey => {
        const cell = row.cells[dayKey];
        const cls = ['week-cell', dayKey === today ? 'today' : '', cell.ms > 0 ? 'has-time' : ''].join(' ');
        return `<td class="${cls}" data-row="${escapeHtml(row.key)}" data-day="${dayKey}">${cell.ms > 0 ? formatHM(cell.ms) : ''}</td>`;
      }).join('');
      return `<tr>
        <td class="week-row-label">${escapeHtml(rowLabel(row.clientId, row.projectId))}</td>
        ${cells}
        <td class="week-row-total">${formatHM(row.totalMs)}</td>
        <td class="week-row-amount">${row.amount > 0 ? formatAmount(row.amount) : '-'}</td>
      </tr>`;
    }).join('');
  }

  const dayTotals = grid.days.map(dayKey =>
    `<td class="${dayKey === today ? 'today' : ''}">${grid.dayTotals[dayKey] > 0 ? formatHM(grid.dayTotals[dayKey]) : ''}</td>`
  ).join('');

  container.innerHTML = `
    <div class="week-grid-scroll card">
      <table class="week-grid">
        <thead><tr>
          <th class="week-row-label">${escapeHtml(t('week-row'))}</th>
          ${dayHeaders}
          <th class="week-row-total">${escapeHtml(t('week-total'))}</th>
          <th class="week-row-amount">${escapeHtml(t('week-amount'))}</th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td class="week-row-label">${escapeHtml(t('week-total'))}</td>
          ${dayTotals}
          <td class="week-row-total">${formatHM(grid.totalMs)}</td>
          <td class="week-row-amount">${grid.amount > 0 ? formatAmount(grid.amount) : '-'}</td>
        </tr></tfoot>
      </table>
    </div>
  `;

  container.querySelectorAll('.week-day-head').forEach(th => {
    th.addEventListener('click', () => {
      selectedDay = th.getAttribute('data-day');
      renderWeek();
    });
  });

  container.querySelectorAll('.week-cell').forEach(td => {
    td.addEventListener('click', () => {
      const row = grid.rows.find(r => r.key === td.getAttribute('data-row'));
      if (row) openCellModal(row.clientId, row.projectId, td.getAttribute('data-day'));
    });
  });
}

// ---------------- CELL MODAL ----------------
function cellLogs(cell) {
  const key = rowKeyOf(cell);
  return store.getTimeLogs()
    .filter(l => rowKeyOf(l) === key && localDayKey(l.startTime) === cell.dayKey)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
}

function renderCellEntries() {
  const list = document.getElementById('week-cell-entries');
  list.innerHTML = '';
  const logs = cellLogs(openCell);
  if (logs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'week-cell-empty';
    empty.textContent = t('week-cell-empty');
    list.appendChild(empty);
    return;
  }
  logs.forEach(log => {
    const row = document.createElement('div');
    row.className = 'week-cell-entry';
    row.innerHTML = `
      <span class="week-cell-entry-time">${formatTime(log.startTime)}-${formatTime(log.endTime)}</span>
      <span class="week-cell-entry-desc ${log.description ? '' : 'empty'}">${escapeHtml(log.description || t('no-description'))}</span>
      <span class="week-cell-entry-dur">${formatDurationHMS(Math.max(0, logDurationMs(log)))}</span>
      <button class="btn-icon week-cell-edit" title="${escapeHtml(t('edit'))}"><i data-lucide="edit-2"></i></button>
    `;
    row.querySelector('.week-cell-edit').addEventListener('click', () => {
      closeCellModal();
      openEditLogModal(log.id);
    });
    list.appendChild(row);
  });
  if (window.lucide) window.lucide.createIcons();
}

function openCellModal(clientId, projectId, dayKey) {
  openCell = { clientId, projectId, dayKey };
  document.getElementById('week-cell-title').textContent = `${rowLabel(clientId, projectId)}, ${formatDayLong(dayKey)}`;
  document.getElementById('week-add-hours').value = '1';
  document.getElementById('week-add-minutes').value = '0';
  document.getElementById('week-add-desc').value = '';
  renderCellEntries();
  document.getElementById('week-cell-modal').classList.add('active');
}

function closeCellModal() {
  document.getElementById('week-cell-modal').classList.remove('active');
  openCell = null;
}

function addTimeFromCell() {
  if (!openCell) return;
  const hours = Math.max(0, parseInt(document.getElementById('week-add-hours').value, 10) || 0);
  const minutes = Math.max(0, parseInt(document.getElementById('week-add-minutes').value, 10) || 0);
  const durMs = (hours * 60 + minutes) * 60000;
  if (durMs <= 0) {
    showToast(t('week-enter-duration'), { type: 'error' });
    return;
  }

  const allLogs = store.getTimeLogs();
  const start = nextManualStart(allLogs, openCell.dayKey);
  // Billable like the latest entry of this row (new rows default to billable)
  const key = rowKeyOf(openCell);
  const latest = allLogs.find(l => rowKeyOf(l) === key);
  const newLog = store.addTimeLog({
    description: document.getElementById('week-add-desc').value,
    clientId: openCell.clientId,
    projectId: openCell.projectId,
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + durMs).toISOString(),
    billable: latest ? latest.billable : true
  });

  showToast(t('toast-log-added'), { type: 'success' });
  if (overlapsWith(newLog, store.getTimeLogs()).length) {
    showToast(t('toast-overlap-warning'), { type: 'info' });
  }
  document.getElementById('week-add-desc').value = '';
  renderCellEntries();
}

// ---------------- DAY TIMELINE ----------------
function renderTimeline() {
  const lang = store.getSettings().language;
  const title = document.getElementById('week-timeline-title');
  const host = document.getElementById('week-timeline');
  const overlapsHost = document.getElementById('week-overlaps');
  const logs = store.getTimeLogs()
    .filter(l => localDayKey(l.startTime) === selectedDay && new Date(l.endTime) > new Date(l.startTime));
  const dayMs = logs.reduce((sum, l) => sum + logDurationMs(l), 0);

  title.textContent = t('timeline-title', { date: formatDayLong(selectedDay) })
    + (logs.length ? ` (${formatDurationShort(dayMs / 3600000, lang)})` : '');
  host.innerHTML = '';
  overlapsHost.innerHTML = '';

  const range = timelineRange(logs);
  if (!range) {
    const empty = document.createElement('div');
    empty.className = 'timeline-empty';
    empty.textContent = t('timeline-empty');
    host.appendChild(empty);
    return;
  }

  const span = range.end - range.start;
  const pos = (v) => `${((v - range.start) / span) * 100}%`;
  const width = (s, e) => `${((e - s) / span) * 100}%`;
  const overlaps = findOverlaps(logs);
  const overlapIds = new Set(overlaps.flatMap(o => [o.a.id, o.b.id]));
  const { lanes, count } = assignLanes(logs);

  const axis = document.createElement('div');
  axis.className = 'timeline-axis';
  for (let h = range.start; h <= range.end; h += 3600000) {
    const tick = document.createElement('span');
    tick.className = 'timeline-tick';
    tick.style.left = pos(h);
    tick.textContent = formatTime(h);
    axis.appendChild(tick);
  }

  const track = document.createElement('div');
  track.className = 'timeline-track';
  track.style.height = `${count * 30 + 8}px`;
  for (let h = range.start; h <= range.end; h += 3600000) {
    const line = document.createElement('span');
    line.className = 'timeline-hour-line';
    line.style.left = pos(h);
    track.appendChild(line);
  }

  findGaps(logs).forEach(g => {
    const gap = document.createElement('div');
    gap.className = 'timeline-gap';
    gap.style.left = pos(g.start);
    gap.style.width = width(g.start, g.end);
    gap.title = `${formatTime(g.start)}-${formatTime(g.end)}`;
    track.appendChild(gap);
  });

  logs.forEach(log => {
    const s = new Date(log.startTime).getTime();
    const e = new Date(log.endTime).getTime();
    const block = document.createElement('button');
    block.type = 'button';
    block.className = 'timeline-block' + (overlapIds.has(log.id) ? ' overlap' : '');
    block.style.left = pos(s);
    block.style.width = width(s, e);
    block.style.top = `${4 + lanes[log.id] * 30}px`;
    if (!overlapIds.has(log.id)) block.style.background = `hsl(${clientHue(log.clientId)}, 60%, 52%)`;
    block.title = [
      log.description || t('no-description'),
      rowLabel(log.clientId, log.projectId),
      `${formatTime(s)}-${formatTime(e)}`
    ].join('\n');
    block.textContent = log.description || '';
    block.addEventListener('click', () => openEditLogModal(log.id));
    track.appendChild(block);
  });

  host.appendChild(axis);
  host.appendChild(track);

  overlaps.forEach(o => {
    const row = document.createElement('div');
    row.className = 'timeline-overlap-row';
    const text = document.createElement('span');
    text.className = 'timeline-overlap-text';
    text.textContent = `${t('timeline-overlap', { range: `${formatTime(o.start)}-${formatTime(o.end)}` })} · `
      + `${o.a.description || t('no-description')} / ${o.b.description || t('no-description')}`;
    row.appendChild(text);
    [o.a, o.b].forEach(log => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = `${t('edit')}: ${formatTime(log.startTime)}-${formatTime(log.endTime)}`;
      btn.addEventListener('click', () => openEditLogModal(log.id));
      row.appendChild(btn);
    });
    overlapsHost.appendChild(row);
  });
}

// ---------------- VIEW ----------------
export function renderWeek() {
  if (!document.getElementById('week-grid-container')) return;
  const days = weekDays(weekStart);
  const first = days[0].toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const last = days[6].toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  document.getElementById('week-range-label').textContent = `${first} - ${last}`;
  document.getElementById('week-prev-btn').title = t('week-prev');
  document.getElementById('week-next-btn').title = t('week-next');

  renderGrid(buildWeekGrid(store.getTimeLogs(), weekStart));
  renderTimeline();
  if (openCell && document.getElementById('week-cell-modal').classList.contains('active')) renderCellEntries();
  if (window.lucide) window.lucide.createIcons();
}

export function initWeek() {
  document.getElementById('week-prev-btn').addEventListener('click', () => selectWeek(addWeeks(weekStart, -1)));
  document.getElementById('week-next-btn').addEventListener('click', () => selectWeek(addWeeks(weekStart, 1)));
  document.getElementById('week-today-btn').addEventListener('click', () => {
    selectedDay = localDayKey(new Date());
    selectWeek(startOfWeek(new Date()));
  });
  document.getElementById('week-cell-modal-close').addEventListener('click', closeCellModal);
  document.getElementById('week-cell-modal-cancel').addEventListener('click', closeCellModal);
  document.getElementById('week-cell-add-btn').addEventListener('click', addTimeFromCell);
}
