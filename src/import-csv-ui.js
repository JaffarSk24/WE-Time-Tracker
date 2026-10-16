// Settings, Data Management: import time entries from a Toggl Track or
// Clockify CSV export. The file is read by the pure parser in import-csv.js,
// a preview shows what will be added, and the import is one store write with
// an undo toast that removes exactly what was added.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { isTimeInLockedPeriod } from './period-lock.js';
import { parseTimeEntriesCsv, planImport, buildImportRecords } from './import-csv.js';

const FORMAT_NAMES = { toggl: 'Toggl Track', clockify: 'Clockify' };
const MAX_LISTED_ERRORS = 20;

let pending = null;

function locale() {
  return store.getSettings().language === 'ru' ? 'ru-RU' : 'en-US';
}

function currentData() {
  return { clients: store.getClients(), projects: store.getProjects(), timeLogs: store.getTimeLogs() };
}

// One "label: value" line of the preview, filled through textContent.
function summaryRow(label, value) {
  const row = document.createElement('div');
  row.className = 'csv-import-row';
  const l = document.createElement('span');
  l.className = 'csv-import-label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'csv-import-value';
  v.textContent = value;
  row.append(l, v);
  return row;
}

function renderPreview(parsed, plan) {
  const box = document.getElementById('csv-import-summary');
  box.innerHTML = '';
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(locale());
  const none = t('csv-import-none');

  box.appendChild(summaryRow(t('csv-import-format'), FORMAT_NAMES[parsed.format] || parsed.format));
  box.appendChild(summaryRow(t('csv-import-entries'), String(plan.entries.length)));
  if (plan.from) {
    const from = fmtDate(plan.from);
    const to = fmtDate(plan.to);
    box.appendChild(summaryRow(t('csv-import-period'), from === to ? from : `${from} - ${to}`));
  }
  box.appendChild(summaryRow(t('csv-import-new-clients'), plan.newClients.length ? plan.newClients.join(', ') : none));
  box.appendChild(summaryRow(
    t('csv-import-new-projects'),
    plan.newProjects.length ? plan.newProjects.map(p => `${p.name} (${p.clientName})`).join(', ') : none
  ));
  box.appendChild(summaryRow(t('csv-import-duplicates'), String(plan.duplicates)));
  box.appendChild(summaryRow(t('csv-import-errors'), String(plan.errors.length)));

  if (plan.errors.length) {
    const list = document.createElement('ul');
    list.className = 'csv-import-errors';
    plan.errors.slice(0, MAX_LISTED_ERRORS).forEach(e => {
      const li = document.createElement('li');
      li.textContent = t('csv-import-line', { line: e.line, reason: t(`csv-import-reason-${e.reason}`) });
      list.appendChild(li);
    });
    if (plan.errors.length > MAX_LISTED_ERRORS) {
      const li = document.createElement('li');
      li.textContent = t('csv-import-more', { count: plan.errors.length - MAX_LISTED_ERRORS });
      list.appendChild(li);
    }
    box.appendChild(list);
  }

  const confirmBtn = document.getElementById('csv-import-confirm');
  confirmBtn.disabled = plan.entries.length === 0;
  if (plan.entries.length === 0) {
    const note = document.createElement('p');
    note.className = 'csv-import-note';
    note.textContent = t('csv-import-nothing');
    box.appendChild(note);
  }
}

function openPreview(text) {
  const parsed = parseTimeEntriesCsv(text);
  if (parsed.error) {
    showToast(parsed.error === 'empty' ? t('csv-import-empty') : t('csv-import-unknown'), { type: 'error', duration: 7000 });
    return;
  }
  const plan = planImport(parsed, currentData(), { noClientName: t('csv-import-no-client') });
  pending = { parsed, plan };
  renderPreview(parsed, plan);
  document.getElementById('csv-import-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('csv-import-modal').classList.remove('active');
  pending = null;
}

// Removes what an import added. Clients and projects it created stay when
// something else now uses them (an entry, a project or a payment added since).
function undoImport(added) {
  const logIds = new Set(added.timeLogs.map(l => l.id));
  const otherLogs = store.getTimeLogs().filter(l => !logIds.has(l.id));
  const projectIds = added.projects
    .filter(p => !otherLogs.some(l => l.projectId === p.id))
    .map(p => p.id);
  const removedProjects = new Set(projectIds);
  const clientIds = added.clients
    .filter(c => {
      const current = store.getClients().find(x => x.id === c.id);
      if (current && (current.payments || []).length > 0) return false;
      if (otherLogs.some(l => l.clientId === c.id)) return false;
      return !store.getProjects().some(p => p.clientId === c.id && !removedProjects.has(p.id));
    })
    .map(c => c.id);
  store.removeRecords({ timeLogs: [...logIds], projects: projectIds, clients: clientIds });
  showToast(t('csv-import-undone'), { type: 'info' });
}

function runImport() {
  if (!pending) return;
  // Planned again against the data as it is now, in case it changed.
  const plan = planImport(pending.parsed, currentData(), { noClientName: t('csv-import-no-client') });
  closeModal();
  if (plan.entries.length === 0) {
    showToast(t('csv-import-nothing'), { type: 'info' });
    return;
  }
  const added = buildImportRecords(plan, currentData(), (prefix) => store.newId(prefix));
  // Like manual entries, imported ones may not land in a locked period.
  const lockedUntil = store.getLockedUntil();
  const before = added.timeLogs.length;
  added.timeLogs = added.timeLogs.filter(l => !isTimeInLockedPeriod(l.startTime, lockedUntil));
  const skipped = before - added.timeLogs.length;
  if (added.timeLogs.length === 0) {
    showToast(t('lock-skipped', { count: skipped }), { type: 'info' });
    return;
  }
  store.addRecords(added);
  if (skipped > 0) showToast(t('lock-skipped', { count: skipped }), { type: 'info' });
  showToast(t('csv-import-done', { count: added.timeLogs.length }), {
    type: 'success',
    duration: 15000,
    actionLabel: t('toast-undo'),
    onAction: () => undoImport(added)
  });
}

export function initCsvImport() {
  const btn = document.getElementById('settings-csv-import-btn');
  const input = document.getElementById('settings-csv-import-input');
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      openPreview(String(event.target.result || ''));
      input.value = '';
    };
    reader.onerror = () => {
      showToast(t('csv-import-read-error') + (reader.error ? reader.error.message : ''), { type: 'error' });
      input.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('csv-import-confirm').addEventListener('click', runImport);
  document.getElementById('csv-import-cancel').addEventListener('click', closeModal);
  document.getElementById('csv-import-close').addEventListener('click', closeModal);
}
