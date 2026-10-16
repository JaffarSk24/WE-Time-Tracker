// WE Time Tracker - tags in the UI: the Tags tab in Clients & Projects, the
// compact tag picker, tag chips, the report filter and the Dashboard card.
import { store } from './store.js';
import { t } from './i18n.js';
import { showToast } from './toast.js';
import { escapeHtml, formatDurationShort } from './utils.js';
import {
  TAG_COLORS, tagColor, logTagIds, validTagIds, tagRemovalPatches, tagStats, dashboardPeriodRange
} from './tags.js';

export function getTags() {
  return [...store.getCollection('tags')].sort((a, b) => a.name.localeCompare(b.name));
}

// Chips for the given tag ids (unknown ids are skipped).
export function tagChipsHtml(tagIds) {
  const byId = new Map(store.getCollection('tags').map(tag => [tag.id, tag]));
  const chips = (tagIds || []).map(id => byId.get(id)).filter(Boolean).map(tag =>
    `<span class="tag-chip" style="--tag-color: ${tagColor(tag.color)};">${escapeHtml(tag.name)}</span>`
  );
  return chips.length ? `<span class="tag-chips">${chips.join('')}</span>` : '';
}

// Extra fields for continuing an entry with the timer: its tags.
export function continueExtra(log) {
  const tagIds = validTagIds(logTagIds(log), store.getCollection('tags'));
  return tagIds.length ? { tagIds } : {};
}

// ---------------- TAG PICKER ----------------
// A button with the chosen chips that opens a small list of tags with
// checkboxes. Keeps its value itself; refresh() redraws after tags change.
const openPickers = new Set();

document.addEventListener('mousedown', (e) => {
  openPickers.forEach(picker => {
    if (!picker.root.contains(e.target)) picker.close();
  });
});

export function createTagPicker(root) {
  if (!root) return null;
  let value = [];
  let disabled = false;

  root.classList.add('tag-picker');
  root.innerHTML = `
    <button type="button" class="tag-picker-button"></button>
    <div class="tag-picker-menu" hidden></div>
  `;
  const button = root.querySelector('.tag-picker-button');
  const menu = root.querySelector('.tag-picker-menu');

  const picker = {
    root,
    getValue: () => validTagIds(value, store.getCollection('tags')),
    setValue(ids) {
      value = [...new Set(ids || [])];
      picker.close();
      render();
    },
    setDisabled(flag) {
      disabled = !!flag;
      button.disabled = disabled;
      if (disabled) picker.close();
    },
    close() {
      menu.hidden = true;
      openPickers.delete(picker);
    },
    refresh: () => render()
  };

  function renderMenu() {
    const tags = getTags();
    if (tags.length === 0) {
      menu.innerHTML = `<div class="tag-picker-empty">${t('tags-picker-empty')}</div>`;
      return;
    }
    menu.innerHTML = '';
    tags.forEach(tag => {
      const label = document.createElement('label');
      label.className = 'tag-picker-option';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = value.includes(tag.id);
      box.addEventListener('change', () => {
        value = box.checked ? [...value, tag.id] : value.filter(id => id !== tag.id);
        renderButton();
      });
      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      dot.style.setProperty('--tag-color', tagColor(tag.color));
      const name = document.createElement('span');
      name.textContent = tag.name;
      label.append(box, dot, name);
      menu.appendChild(label);
    });
  }

  function renderButton() {
    const chips = tagChipsHtml(picker.getValue());
    button.innerHTML = chips || `<i data-lucide="tag"></i><span>${t('tags-label')}</span>`;
    button.classList.toggle('has-tags', !!chips);
    if (!chips && window.lucide) window.lucide.createIcons();
  }

  function render() {
    renderButton();
    if (!menu.hidden) renderMenu();
  }

  button.addEventListener('click', () => {
    if (disabled) return;
    if (menu.hidden) {
      renderMenu();
      menu.hidden = false;
      openPickers.add(picker);
    } else {
      picker.close();
    }
  });

  render();
  return picker;
}

// ---------------- REPORTS FILTER ----------------
export function fillTagFilter(select) {
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('filter-all');
  select.appendChild(all);
  getTags().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag.id;
    opt.textContent = tag.name;
    select.appendChild(opt);
  });
  select.value = getTags().some(tag => tag.id === selected) ? selected : '';
}

// ---------------- DASHBOARD CARD ----------------
export function renderDashboardTags(logs, period) {
  const list = document.getElementById('dash-tags-list');
  if (!list) return;
  const lang = store.getSettings().language;
  const stats = tagStats(logs, store.getCollection('tags'), dashboardPeriodRange(period));

  if (stats.length === 0) {
    list.innerHTML = `<div class="dash-tags-empty">${t('dash-tags-empty')}</div>`;
    return;
  }
  const maxHours = stats[0].hours || 1;
  list.innerHTML = stats.map(s => `
    <div class="dash-tag-row" style="--tag-color: ${s.color};">
      <span class="tag-dot"></span>
      <span class="dash-tag-name">${escapeHtml(s.name)}</span>
      <span class="dash-tag-bar"><span style="width: ${(s.hours / maxHours) * 100}%;"></span></span>
      <span class="dash-tag-hours">${formatDurationShort(s.hours, lang)}</span>
      <span class="dash-tag-amount">${s.amount.toFixed(2)} €</span>
    </div>
  `).join('');
}

// ---------------- TAGS TAB ----------------
let newTagColor = TAG_COLORS[0];

function paletteHtml(selected, cls) {
  return TAG_COLORS.map(color => `
    <button type="button" class="tag-swatch ${cls} ${color === selected ? 'active' : ''}" data-color="${color}"
      style="--tag-color: ${color};" title="${t('tags-color')}"></button>
  `).join('');
}

function nameTaken(name, exceptId = null) {
  const key = name.trim().toLowerCase();
  return store.getCollection('tags').some(tag => tag.id !== exceptId && tag.name.trim().toLowerCase() === key);
}

export function renderTagsTab() {
  const list = document.getElementById('tags-list');
  const palette = document.getElementById('tag-new-palette');
  if (!list || !palette) return;

  palette.innerHTML = paletteHtml(newTagColor, 'new-tag-swatch');
  palette.querySelectorAll('.new-tag-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      newTagColor = btn.getAttribute('data-color');
      renderTagsTab();
    });
  });

  const tags = getTags();
  if (tags.length === 0) {
    list.innerHTML = `<div class="tags-empty">${t('tags-empty')}</div>`;
    return;
  }

  const counts = new Map();
  store.getCollection('timeLogs').forEach(log => {
    logTagIds(log).forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  });

  list.innerHTML = '';
  tags.forEach(tag => {
    const row = document.createElement('div');
    row.className = 'tag-row';
    row.style.setProperty('--tag-color', tagColor(tag.color));
    row.innerHTML = `
      <span class="tag-dot"></span>
      <input type="text" class="tag-row-name" maxlength="40">
      <span class="tag-row-count">${t('tags-usage', { count: counts.get(tag.id) || 0 })}</span>
      <div class="tag-row-palette">${paletteHtml(tagColor(tag.color), 'row-tag-swatch')}</div>
      <button class="btn-icon delete tag-row-delete" title="${t('delete')}"><i data-lucide="trash-2"></i></button>
    `;
    const nameInput = row.querySelector('.tag-row-name');
    nameInput.value = tag.name;
    nameInput.addEventListener('change', () => {
      const name = nameInput.value.trim();
      if (!name) {
        showToast(t('tags-enter-name'), { type: 'error' });
        nameInput.value = tag.name;
        return;
      }
      if (nameTaken(name, tag.id)) {
        showToast(t('tags-exists'), { type: 'error' });
        nameInput.value = tag.name;
        return;
      }
      if (name !== tag.name) {
        store.patchRecord('tags', tag.id, { name });
        renderTagsTab();
      }
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nameInput.blur();
    });
    row.querySelectorAll('.row-tag-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        store.patchRecord('tags', tag.id, { color: btn.getAttribute('data-color') });
        renderTagsTab();
      });
    });
    row.querySelector('.tag-row-delete').addEventListener('click', () => {
      if (!confirm(t('tags-confirm-delete', { name: tag.name }))) return;
      // Entries first, so no entry is left pointing at a deleted tag.
      store.patchRecords('timeLogs', tagRemovalPatches(store.getCollection('timeLogs'), tag.id));
      store.deleteRecord('tags', tag.id);
      showToast(t('tags-deleted'), { type: 'info' });
      renderTagsTab();
    });
    list.appendChild(row);
  });

  if (window.lucide) window.lucide.createIcons();
}

function addTag() {
  const input = document.getElementById('tag-new-name');
  const name = input.value.trim();
  if (!name) {
    showToast(t('tags-enter-name'), { type: 'error' });
    return;
  }
  if (nameTaken(name)) {
    showToast(t('tags-exists'), { type: 'error' });
    return;
  }
  store.upsertRecord('tags', { name, color: newTagColor });
  input.value = '';
  // Next tag gets the next colour, so a quick series stays distinguishable.
  newTagColor = TAG_COLORS[(TAG_COLORS.indexOf(newTagColor) + 1) % TAG_COLORS.length];
  renderTagsTab();
}

// The third tab of Clients & Projects. The two existing tabs keep their own
// handlers; these listeners only make the tabs exclusive with the new one.
export function initTagsTab() {
  const tabTags = document.getElementById('tab-tags');
  const panelTags = document.getElementById('panel-tags');
  if (!tabTags || !panelTags) return;
  const otherTabs = ['tab-clients', 'tab-projects'].map(id => document.getElementById(id)).filter(Boolean);
  const otherPanels = ['panel-clients', 'panel-projects'].map(id => document.getElementById(id)).filter(Boolean);

  tabTags.addEventListener('click', () => {
    otherTabs.forEach(tab => tab.classList.remove('active'));
    otherPanels.forEach(panel => panel.classList.remove('active'));
    tabTags.classList.add('active');
    panelTags.classList.add('active');
    renderTagsTab();
  });
  otherTabs.forEach(tab => tab.addEventListener('click', () => {
    tabTags.classList.remove('active');
    panelTags.classList.remove('active');
  }));

  document.getElementById('tag-add-btn').addEventListener('click', addTag);
  document.getElementById('tag-new-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTag();
  });
}
