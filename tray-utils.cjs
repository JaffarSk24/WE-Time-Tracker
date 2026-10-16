// Pure timer logic for the main process: starting and stopping the timer on
// a plain state object (the parsed data file) when no window is open, and the
// recent tasks of the tray menu. The entries written here must be identical
// to what store.js produces (startTimer, stopTimer, addTimeLog, getRate);
// tests/tray-utils.test.js compares them.

function newId(prefix, nowMs) {
  return `${prefix}_${nowMs}_${Math.random().toString(36).substr(2, 9)}`;
}

// Same rule as store.getRate: a project's own rate, else its client's.
function getRate(state, clientId, projectId) {
  const clients = state.clients || [];
  const projects = state.projects || [];
  if (projectId) {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      if (project.rate && project.rate > 0) return project.rate;
      const client = clients.find(c => c.id === project.clientId);
      return client ? client.defaultRate : 0;
    }
  }
  if (clientId) {
    const client = clients.find(c => c.id === clientId);
    return client ? client.defaultRate : 0;
  }
  return 0;
}

function stamp(state, nowMs) {
  state.savedAt = new Date(nowMs).toISOString();
}

// Stops the active timer of `state` (mutated) like store.stopTimer and
// returns the new log, or null when nothing runs.
function stopTimerOnState(state, nowMs) {
  const timer = state.activeTimer;
  if (!timer) return null;

  let totalDuration = timer.accumulatedTime || 0;
  if (!timer.isPaused && timer.startTime) {
    totalDuration += Math.max(0, nowMs - new Date(timer.startTime).getTime());
  }
  const endTime = new Date(nowMs).toISOString();
  const startTime = timer.originalStartTime
    || new Date(nowMs - totalDuration).toISOString();

  const log = {
    id: newId('log', nowMs),
    description: (timer.description || '').trim(),
    clientId: timer.clientId || null,
    projectId: timer.projectId || null,
    startTime,
    endTime,
    billable: timer.billable !== undefined ? timer.billable : true,
    paid: false,
    rateAtTime: getRate(state, timer.clientId, timer.projectId)
  };
  // As in store.addTimeLog: keep durationMs only when pauses made it shorter.
  const spanMs = new Date(endTime) - new Date(startTime);
  if (Math.abs(spanMs - totalDuration) > 1000) log.durationMs = totalDuration;

  if (!Array.isArray(state.timeLogs)) state.timeLogs = [];
  state.timeLogs.push(log);
  state.activeTimer = null;
  stamp(state, nowMs);
  return log;
}

// Starts a timer for `task` like store.startTimer (a running one is stopped
// first, as the play button does). Returns { stopped, timer }.
function startTimerOnState(state, task, nowMs) {
  const stopped = state.activeTimer ? stopTimerOnState(state, nowMs) : null;
  const nowIso = new Date(nowMs).toISOString();
  state.activeTimer = {
    description: (task.description || '').trim(),
    clientId: task.clientId || null,
    projectId: task.projectId || null,
    startTime: nowIso,
    originalStartTime: nowIso,
    billable: task.billable !== undefined ? task.billable : true,
    isPaused: false,
    accumulatedTime: 0
  };
  stamp(state, nowMs);
  return { stopped, timer: state.activeTimer };
}

// What the tray keeps about the active timer (the same shape the renderer
// sends over timer:sync).
function traySnapshot(state) {
  const timer = state && state.activeTimer;
  if (!timer) return null;
  return {
    description: timer.description || '',
    isPaused: !!timer.isPaused,
    startTime: timer.startTime,
    originalStartTime: timer.originalStartTime || null,
    accumulatedTime: timer.accumulatedTime || 0,
    clientId: timer.clientId || null,
    projectId: timer.projectId || null,
    billable: timer.billable !== undefined ? timer.billable : true,
    rateAtTime: getRate(state, timer.clientId, timer.projectId)
  };
}

// The latest distinct tasks (description + client + project), newest first.
// Entries whose client no longer exists are skipped.
function recentTasks(state, limit = 5) {
  const clients = state.clients || [];
  const projects = state.projects || [];
  const logs = [...(state.timeLogs || [])]
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const seen = new Set();
  const tasks = [];
  for (const log of logs) {
    if (tasks.length >= limit) break;
    const client = clients.find(c => c.id === log.clientId);
    if (log.clientId && !client) continue;
    const key = [(log.description || '').trim().toLowerCase(), log.clientId || '', log.projectId || ''].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    const project = projects.find(p => p.id === log.projectId);
    tasks.push({
      description: (log.description || '').trim(),
      clientId: log.clientId || null,
      projectId: project ? project.id : null,
      billable: log.billable !== undefined ? log.billable : true,
      clientName: client ? client.name : '',
      projectName: project ? project.name : ''
    });
  }
  return tasks;
}

// Menu label "description · client" (project added when there is one).
function taskLabel(task, noDescription) {
  const parts = [task.description || noDescription];
  if (task.clientName) parts.push(task.clientName);
  if (task.projectName) parts.push(task.projectName);
  const label = parts.join(' · ');
  return label.length > 60 ? label.slice(0, 59) + '…' : label;
}

module.exports = {
  getRate,
  stopTimerOnState,
  startTimerOnState,
  traySnapshot,
  recentTasks,
  taskLabel
};
