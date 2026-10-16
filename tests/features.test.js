import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { FEATURES, FEATURE_SECTIONS } from '../src/features-content.js';
import { filterFeatures } from '../src/features.js';

const pascal = (name) => name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('features view content', () => {
  it('has unique ids, a known section and both languages for every feature', () => {
    const ids = new Set();
    FEATURES.forEach(f => {
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(FEATURE_SECTIONS.some(s => s.id === f.section)).toBe(true);
      ['title', 'where'].forEach(k => { expect(f[k].ru).toBeTruthy(); expect(f[k].en).toBeTruthy(); });
      expect(f.body.ru.length).toBeGreaterThan(0);
      expect(f.body.ru.length).toBe(f.body.en.length);
    });
  });

  it('uses only icons the app registers and views that exist', () => {
    [...FEATURES, ...FEATURE_SECTIONS].forEach(f => {
      expect(appJs).toMatch(new RegExp(`\\b${pascal(f.icon)}\\b`));
      if (f.view) expect(html).toContain(`id="${f.view}"`);
    });
  });

  it('keeps the house style: no long dashes, no space before % or currency', () => {
    const text = JSON.stringify(FEATURES);
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/\d [%€$]/);
  });

  it('finds features by any word of their title or text', () => {
    expect(filterFeatures(FEATURES, '', 'ru')).toHaveLength(FEATURES.length);
    expect(filterFeatures(FEATURES, 'TOGGL', 'ru').map(f => f.id)).toEqual(['import']);
    expect(filterFeatures(FEATURES, 'zzzz', 'en')).toEqual([]);
  });
});
