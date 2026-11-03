import { describe, it, expect } from 'vitest';
import { notesFor, parseNotes, shouldOpenPopup } from '../src/update-popup.js';

describe('release notes in the update window', () => {
  it('reads bold lines as headings, list items as a list, and stops at Install', () => {
    const md = 'A big release.\n\n**Timer**\n- Suggestions while you type.\n- Tags with a [filter](https://x).\n\n## Install\n- Download the dmg.';
    expect(parseNotes(md)).toEqual([
      { type: 'text', text: 'A big release.' },
      { type: 'heading', text: 'Timer' },
      { type: 'list', items: ['Suggestions while you type.', 'Tags with a filter.'] }
    ]);
  });

  it('picks the section in the app language, else English, else the whole notes', () => {
    const md = '## English\n- Fixed sync.\n## Русский\n- Исправлена синхронизация.';
    expect(notesFor(md, 'ru')).toBe('- Исправлена синхронизация.');
    expect(notesFor('## English\n- Fixed sync.', 'ru')).toBe('- Fixed sync.');
    expect(notesFor('- Plain notes.', 'ru')).toBe('- Plain notes.');
  });
});

describe('when the update window opens', () => {
  const offer = { phase: 'idle', last: { ok: true, available: true, latest: '2.1.0' } };

  it('opens once per version while the update is on offer', () => {
    const shown = new Set();
    expect(shouldOpenPopup(offer, true, shown)).toBe(true);
    shown.add('2.1.0');
    expect(shouldOpenPopup(offer, true, shown)).toBe(false);
    expect(shouldOpenPopup({ ...offer, last: { ...offer.last, latest: '2.1.1' } }, true, shown)).toBe(true);
  });

  it('stays closed when nothing is offered or a download is already running', () => {
    expect(shouldOpenPopup(offer, false, new Set())).toBe(false);
    expect(shouldOpenPopup({ ...offer, phase: 'downloading' }, true, new Set())).toBe(false);
    expect(shouldOpenPopup({ phase: 'idle', last: null }, true, new Set())).toBe(false);
  });
});
