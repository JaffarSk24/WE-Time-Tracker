// Description suggestions: a dropdown under a text input listing earlier
// entries that match what is typed. Reusable: attachSuggest(input, options).
import { escapeHtml } from './utils.js';

export const MAX_SUGGESTIONS = 8;

// Earlier descriptions containing `query` (case-insensitive), newest first,
// unique by description + client + project. Logs come in any order.
export function findSuggestions(logs, query, clients = [], projects = [], limit = MAX_SUGGESTIONS) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const sorted = [...logs].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const seen = new Set();
  const out = [];
  for (const log of sorted) {
    if (out.length >= limit) break;
    const description = (log.description || '').trim();
    if (!description || !description.toLowerCase().includes(q)) continue;
    const key = [description.toLowerCase(), log.clientId || '', log.projectId || ''].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    const client = clients.find(c => c.id === log.clientId);
    const project = projects.find(p => p.id === log.projectId);
    out.push({
      description,
      clientId: log.clientId || null,
      projectId: project ? project.id : null,
      billable: log.billable !== undefined ? log.billable : true,
      clientName: client ? client.name : '',
      projectName: project ? project.name : ''
    });
  }
  return out;
}

// options: getItems(query) -> items, onPick(item).
// Keys: arrows move, Enter picks, Esc closes; the mouse works as well.
export function attachSuggest(input, { getItems, onPick }) {
  const host = input.parentElement;
  host.classList.add('suggest-host');
  const list = document.createElement('div');
  list.className = 'suggest-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  host.appendChild(list);
  input.setAttribute('autocomplete', 'off');

  let items = [];
  let active = -1;

  const close = () => {
    list.hidden = true;
    items = [];
    active = -1;
  };

  const highlight = () => {
    [...list.children].forEach((el, i) => el.classList.toggle('active', i === active));
    const el = list.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  };

  const pick = (index) => {
    const item = items[index];
    close();
    if (item) onPick(item);
  };

  const render = () => {
    items = input.disabled ? [] : getItems(input.value);
    active = -1;
    if (items.length === 0) {
      close();
      return;
    }
    list.innerHTML = items.map((item, i) => {
      const meta = [item.clientName, item.projectName].filter(Boolean).join(' · ');
      return `<div class="suggest-item" role="option" data-index="${i}">
        <span class="suggest-desc">${escapeHtml(item.description)}</span>
        ${meta ? `<span class="suggest-meta">${escapeHtml(meta)}</span>` : ''}
      </div>`;
    }).join('');
    list.hidden = false;
  };

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    if (input.value.trim()) render();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));

  input.addEventListener('keydown', (e) => {
    if (list.hidden || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % items.length;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = active <= 0 ? items.length - 1 : active - 1;
      highlight();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      e.stopPropagation();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  // mousedown, not click: picking must happen before the input loses focus.
  list.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.suggest-item');
    if (!el) return;
    e.preventDefault();
    pick(Number(el.getAttribute('data-index')));
  });
  list.addEventListener('mousemove', (e) => {
    const el = e.target.closest('.suggest-item');
    if (!el) return;
    const i = Number(el.getAttribute('data-index'));
    if (i !== active) {
      active = i;
      highlight();
    }
  });

  return { close, refresh: render };
}
