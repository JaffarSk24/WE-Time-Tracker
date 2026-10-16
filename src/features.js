// "Features" view: every feature of the app grouped by section. A click on
// a feature opens its description; a search field filters titles and texts;
// features of the current version carry a "New" badge.
import { store } from './store.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils.js';
import { FEATURES, FEATURE_SECTIONS } from './features-content.js';

const opened = new Set();
let query = '';

function lang() {
  return store.getSettings().language === 'ru' ? 'ru' : 'en';
}

// Features matching the search text (case-insensitive, in title, body and
// "where"), in their original order. An empty query matches everything.
export function filterFeatures(features, text, language) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return features;
  return features.filter(f => [f.title[language], f.where[language], ...f.body[language]]
    .some(part => String(part || '').toLowerCase().includes(q)));
}

function featureHtml(f, language, expanded) {
  const body = f.body[language].map(p => `<p>${escapeHtml(p)}</p>`).join('');
  const open = f.view
    ? `<button type="button" class="btn btn-secondary btn-sm feature-open" data-view="${f.view}">${escapeHtml(t('features-open'))}</button>`
    : '';
  return `
    <div class="feature-item${expanded ? ' expanded' : ''}" data-id="${f.id}">
      <button type="button" class="feature-head" aria-expanded="${expanded}" aria-controls="feature-body-${f.id}">
        <span class="feature-icon"><i data-lucide="${f.icon}"></i></span>
        <span class="feature-title">${escapeHtml(f.title[language])}</span>
        ${f.isNew ? `<span class="feature-new">${escapeHtml(t('features-new'))}</span>` : ''}
        <span class="feature-chevron"><i data-lucide="chevron-down"></i></span>
      </button>
      <div class="feature-body" id="feature-body-${f.id}"${expanded ? '' : ' hidden'}>
        ${body}
        <div class="feature-where">
          <span>${escapeHtml(t('features-where'))}: ${escapeHtml(f.where[language])}</span>
          ${open}
        </div>
      </div>
    </div>`;
}

export function renderFeatures() {
  const list = document.getElementById('features-list');
  if (!list) return;
  const language = lang();
  const shown = filterFeatures(FEATURES, query, language);
  const searching = query.trim() !== '';

  if (shown.length === 0) {
    list.innerHTML = `<div class="features-empty">${escapeHtml(t('features-empty'))}</div>`;
    return;
  }
  list.innerHTML = FEATURE_SECTIONS.map(section => {
    const items = shown.filter(f => f.section === section.id);
    if (items.length === 0) return '';
    const newCount = items.filter(f => f.isNew).length;
    return `
      <div class="card features-section">
        <h3 class="features-section-title">
          <i data-lucide="${section.icon}"></i>
          <span>${escapeHtml(section.title[language])}</span>
          ${newCount ? `<span class="features-section-new">${escapeHtml(t('features-new-count', { count: newCount }))}</span>` : ''}
        </h3>
        ${items.map(f => featureHtml(f, language, searching || opened.has(f.id))).join('')}
      </div>`;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
}

export function initFeatures() {
  const list = document.getElementById('features-list');
  const search = document.getElementById('features-search');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const openBtn = e.target.closest('.feature-open');
    if (openBtn) {
      const nav = document.querySelector(`.nav-item[data-target="${openBtn.dataset.view}"]`);
      if (nav) nav.click();
      return;
    }
    const head = e.target.closest('.feature-head');
    if (!head) return;
    const item = head.closest('.feature-item');
    const id = item.dataset.id;
    const expanded = !item.classList.contains('expanded');
    if (expanded) opened.add(id); else opened.delete(id);
    item.classList.toggle('expanded', expanded);
    head.setAttribute('aria-expanded', String(expanded));
    item.querySelector('.feature-body').hidden = !expanded;
  });

  if (search) {
    search.addEventListener('input', () => {
      query = search.value;
      renderFeatures();
    });
  }
  renderFeatures();
}
