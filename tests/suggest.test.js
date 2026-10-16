import { describe, it, expect } from 'vitest';
import { findSuggestions } from '../src/suggest.js';

const clients = [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Beta' }];
const projects = [{ id: 'p1', name: 'Site', clientId: 'c1' }];
const log = (description, clientId, projectId, day, billable = true) => ({
  id: `${description}-${day}`, description, clientId, projectId, billable,
  startTime: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`, endTime: `2026-10-${String(day).padStart(2, '0')}T11:00:00Z`
});

describe('description suggestions', () => {
  const logs = [
    log('Landing page', 'c1', 'p1', 1),
    log('landing page', 'c1', 'p1', 3, false),
    log('Landing page', 'c2', null, 2),
    log('Logo', 'c2', null, 4),
    log('', 'c1', null, 5)
  ];

  it('matches case-insensitively, newest first, unique by description, client and project', () => {
    const res = findSuggestions(logs, 'LAND', clients, projects);
    expect(res.map(r => `${r.description}/${r.clientName}/${r.projectName}`)).toEqual([
      'landing page/Acme/Site',
      'Landing page/Beta/'
    ]);
    expect(res[0]).toMatchObject({ clientId: 'c1', projectId: 'p1', billable: false });
  });

  it('matches inside the text and skips empty descriptions', () => {
    expect(findSuggestions(logs, 'go', clients, projects).map(r => r.description)).toEqual(['Logo']);
    expect(findSuggestions(logs, '', clients, projects)).toEqual([]);
    expect(findSuggestions(logs, '   ', clients, projects)).toEqual([]);
  });

  it('returns at most eight', () => {
    const many = Array.from({ length: 20 }, (_, i) => log(`Task ${i}`, 'c1', null, (i % 28) + 1));
    expect(findSuggestions(many, 'task', clients, projects)).toHaveLength(8);
  });
});
