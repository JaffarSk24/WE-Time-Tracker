// Client report (PDF): UI glue. Builds the report from the logs Reports
// currently shows and saves it as PDF (desktop) or opens the print dialog
// (web/dev mode, no weReport bridge).
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { currencyOfClient } from './currency.js';
import {
  SENDER_FIELDS,
  normalizeSender,
  selectReportLogs,
  reportPeriod,
  clientReportFileName,
  buildClientReportHtml
} from './client-report.js';

// ---------------- Settings block "Details for reports" ----------------
function refreshSenderSettings() {
  const sender = normalizeSender(store.getSettings().reportSender);
  SENDER_FIELDS.forEach(key => {
    const el = document.getElementById(`settings-sender-${key}`);
    if (el && document.activeElement !== el) el.value = sender[key];
  });
}

export function initReportSenderSettings() {
  SENDER_FIELDS.forEach(key => {
    const el = document.getElementById(`settings-sender-${key}`);
    if (!el) return;
    el.addEventListener('change', () => {
      const sender = normalizeSender(store.getSettings().reportSender);
      sender[key] = el.value.trim();
      store.updateSettings({ reportSender: sender });
    });
  });
  refreshSenderSettings();
  store.subscribe(refreshSenderSettings);
}

// ---------------- Export ----------------
// filteredLogs: what Reports shows now; clientId and statusFilter: its filters.
export async function exportClientReport(filteredLogs, clientId, statusFilter) {
  if (!clientId) {
    showToast(t('creport-pick-client'), { type: 'error' });
    return;
  }
  const logs = selectReportLogs(filteredLogs.filter(l => l.clientId === clientId), statusFilter);
  if (logs.length === 0) {
    showToast(t('creport-empty'), { type: 'info' });
    return;
  }

  const client = store.getClients().find(c => c.id === clientId);
  const settings = store.getSettings();
  const html = buildClientReportHtml({
    logs,
    client,
    projects: store.getProjects(),
    sender: settings.reportSender,
    lang: settings.language,
    currency: currencyOfClient(clientId),
    t
  });
  const fileName = clientReportFileName(t('creport-file-prefix'), client ? client.name : '', reportPeriod(logs));

  if (window.weReport && window.weReport.savePdf) {
    try {
      const res = await window.weReport.savePdf(html, fileName);
      if (res && res.ok) showToast(t('creport-saved'), { type: 'success' });
      else if (!res || !res.canceled) showToast(t('creport-failed'), { type: 'error' });
    } catch (e) {
      console.error('Client report failed', e);
      showToast(t('creport-failed'), { type: 'error' });
    }
    return;
  }

  // Web/dev fallback: the browser's own print dialog can save as PDF.
  const win = window.open('', '_blank');
  if (!win) {
    showToast(t('creport-popup-blocked'), { type: 'error' });
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = fileName.replace(/\.pdf$/, '');
  win.focus();
  setTimeout(() => win.print(), 300);
}
