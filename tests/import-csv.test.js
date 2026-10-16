import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  parseCsv, detectFormat, parseTime, parseBillable, parseRate,
  parseTimeEntriesCsv, planImport, buildImportRecords
} from '../src/import-csv.js';

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
// Expected times are built in local time, like the import reads them.
const local = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s).toISOString();

function idFactory() {
  let n = 0;
  return (prefix) => `${prefix}_${++n}`;
}

describe('parseCsv', () => {
  it('splits commas, keeps quoted commas, quotes and newlines', () => {
    const { delimiter, rows } = parseCsv('a,b,c\n1,"x, y","say ""hi"""\n2,"multi\nline",z\n');
    expect(delimiter).toBe(',');
    expect(rows.map(r => r.cells)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'multi\nline', 'z']
    ]);
    expect(rows.map(r => r.line)).toEqual([1, 2, 3]);
  });

  it('detects semicolons from the header and handles CRLF and a BOM', () => {
    const { delimiter, rows } = parseCsv('\uFEFFa;b\r\n"1,5";2\r\n');
    expect(delimiter).toBe(';');
    expect(rows.map(r => r.cells)).toEqual([['a', 'b'], ['1,5', '2']]);
  });

  it('counts lines after a quoted newline', () => {
    const { rows } = parseCsv('h\n"a\nb"\nc');
    expect(rows.map(r => r.line)).toEqual([1, 2, 4]);
  });

  it('keeps empty trailing cells', () => {
    expect(parseCsv('a,b,\n').rows[0].cells).toEqual(['a', 'b', '']);
  });
});

describe('detectFormat', () => {
  it('tells Toggl from Clockify by header', () => {
    expect(detectFormat(['User', 'Email', 'Client', 'Project', 'Task', 'Description', 'Billable',
      'Start date', 'Start time', 'End date', 'End time', 'Duration', 'Tags', 'Amount'])).toBe('toggl');
    expect(detectFormat(['Project', 'Client', 'Description', 'Task', 'User', 'Group', 'Email', 'Tags',
      'Billable', 'Start Date', 'Start Time', 'End Date', 'End Time', 'Duration (h)',
      'Duration (decimal)', 'Billable Rate (USD)', 'Billable Amount (USD)'])).toBe('clockify');
  });

  it('rejects other files', () => {
    expect(detectFormat(['Date', 'Hours', 'Comment'])).toBe(null);
    expect(detectFormat(['Description', 'Start date', 'Start time'])).toBe(null);
  });
});

describe('cell values', () => {
  it('reads 24h and 12h times', () => {
    expect(parseTime('09:05')).toEqual([9, 5, 0]);
    expect(parseTime('23:59:59')).toEqual([23, 59, 59]);
    expect(parseTime('9:05 AM')).toEqual([9, 5, 0]);
    expect(parseTime('12:00 AM')).toEqual([0, 0, 0]);
    expect(parseTime('12:30 PM')).toEqual([12, 30, 0]);
    expect(parseTime('1:15:20 pm')).toEqual([13, 15, 20]);
    expect(parseTime('25:00')).toBe(null);
    expect(parseTime('13:00 PM')).toBe(null);
    expect(parseTime('10:61')).toBe(null);
    expect(parseTime('')).toBe(null);
  });

  it('reads billable flags', () => {
    expect(parseBillable('Yes')).toBe(true);
    expect(parseBillable('true')).toBe(true);
    expect(parseBillable('No')).toBe(false);
    expect(parseBillable('')).toBe(false);
  });

  it('reads rates with either decimal separator', () => {
    expect(parseRate('60.00')).toBe(60);
    expect(parseRate('40,50')).toBe(40.5);
    expect(parseRate('1.250,00')).toBe(1250);
    expect(parseRate('1,250.00')).toBe(1250);
    expect(parseRate('€ 35')).toBe(35);
    expect(parseRate('')).toBe(null);
  });
});

describe('parseTimeEntriesCsv: Toggl', () => {
  const parsed = parseTimeEntriesCsv(fixture('toggl-detailed.csv'));

  it('reads entries in local time with tasks in brackets', () => {
    expect(parsed.format).toBe('toggl');
    expect(parsed.dateFormat).toBe('ymd');
    expect(parsed.entries).toHaveLength(4);
    expect(parsed.entries[0]).toEqual({
      line: 2, client: 'Acme', project: 'Website', description: 'Homepage mockups [Design]',
      startTime: local(2026, 3, 2, 9, 0), endTime: local(2026, 3, 2, 10, 30), billable: true, rate: null
    });
    expect(parsed.entries[1].description).toBe('Call with Bob, notes');
    expect(parsed.entries[1].billable).toBe(false);
  });

  it('keeps multi-line descriptions and entries past midnight', () => {
    const e = parsed.entries[2];
    expect(e.line).toBe(4);
    expect(e.client).toBe('');
    expect(e.description).toBe('Line one\nline two');
    expect(e.startTime).toBe(local(2026, 3, 3, 22, 30));
    expect(e.endTime).toBe(local(2026, 3, 4, 0, 15));
  });

  it('reports unreadable rows with their line numbers', () => {
    expect(parsed.errors).toEqual([{ line: 6, reason: 'order' }]);
    expect(parsed.entries[3]).toMatchObject({ line: 7, description: 'He said "hi"', startTime: local(2026, 3, 5, 8, 0) });
  });

  it('reads DD.MM.YYYY and rejects impossible dates', () => {
    const p = parseTimeEntriesCsv(fixture('toggl-dots.csv'));
    expect(p.dateFormat).toBe('dmyDot');
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0].startTime).toBe(local(2026, 4, 7, 10, 0));
    expect(p.errors).toEqual([{ line: 3, reason: 'date' }]);
  });
});

describe('parseTimeEntriesCsv: Clockify', () => {
  it('reads quoted CRLF exports with 12h times and the rate column', () => {
    const p = parseTimeEntriesCsv(fixture('clockify-detailed.csv'));
    expect(p.format).toBe('clockify');
    expect(p.dateFormat).toBe('mdy');
    expect(p.entries).toHaveLength(3);
    expect(p.entries[0]).toEqual({
      line: 2, client: 'Initech', project: 'Mobile app', description: 'Sprint planning [Planning]',
      startTime: local(2026, 3, 9, 9, 0), endTime: local(2026, 3, 9, 10, 0), billable: true, rate: 60
    });
    expect(p.entries[1]).toMatchObject({ startTime: local(2026, 3, 9, 12, 30), endTime: local(2026, 3, 9, 13, 15), billable: false, rate: 0 });
    expect(p.entries[2]).toMatchObject({ startTime: local(2026, 3, 10, 23, 45), endTime: local(2026, 3, 11, 0, 15) });
    expect(p.errors).toEqual([{ line: 5, reason: 'time' }]);
  });

  it('picks DD/MM/YYYY when only it reads every row, with semicolons and decimal commas', () => {
    const p = parseTimeEntriesCsv(fixture('clockify-semicolon-dmy.csv'));
    expect(p.delimiter).toBe(';');
    expect(p.dateFormat).toBe('dmy');
    expect(p.errors).toEqual([]);
    expect(p.entries[0]).toMatchObject({ description: 'Checkout, payment step', startTime: local(2026, 3, 5, 14, 0), rate: 40 });
    expect(p.entries[1].startTime).toBe(local(2026, 3, 25, 9, 0));
  });

  it('picks MM/DD/YYYY when only it reads every row', () => {
    const csv = [
      'Project,Client,Description,Billable,Start Date,Start Time,End Date,End Time,Duration (h)',
      'P,C,a,Yes,03/05/2026,09:00,03/05/2026,10:00,1',
      'P,C,b,Yes,03/25/2026,09:00,03/25/2026,10:00,1'
    ].join('\n');
    const p = parseTimeEntriesCsv(csv);
    expect(p.dateFormat).toBe('mdy');
    expect(p.entries[0].startTime).toBe(local(2026, 3, 5, 9, 0));
    expect(p.errors).toEqual([]);
  });

  it('uses the end-after-start rule to settle slash dates', () => {
    const csv = [
      'Project,Client,Description,Billable,Start Date,Start Time,End Date,End Time,Duration (h)',
      'P,C,a,Yes,02/01/2026,23:00,01/02/2026,01:00,2'
    ].join('\n');
    const p = parseTimeEntriesCsv(csv);
    expect(p.dateFormat).toBe('dmy');
    expect(p.entries[0].startTime).toBe(local(2026, 1, 2, 23, 0));
    expect(p.entries[0].endTime).toBe(local(2026, 2, 1, 1, 0));
  });
});

describe('parseTimeEntriesCsv: other files', () => {
  it('refuses unknown and empty files', () => {
    expect(parseTimeEntriesCsv(fixture('unknown.csv'))).toEqual({ error: 'unknown_format' });
    expect(parseTimeEntriesCsv('')).toEqual({ error: 'empty' });
    expect(parseTimeEntriesCsv('\n\n')).toEqual({ error: 'empty' });
  });

  it('skips blank lines without calling them errors', () => {
    const csv = 'Description,Start date,Start time,End date,End time,Duration\n\nx,2026-01-01,10:00,2026-01-01,11:00,1\n\n';
    const p = parseTimeEntriesCsv(csv);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0].line).toBe(3);
    expect(p.entries[0].billable).toBe(true);
    expect(p.errors).toEqual([]);
  });
});

describe('planImport', () => {
  const parsed = parseTimeEntriesCsv(fixture('toggl-detailed.csv'));

  it('creates missing clients and projects, matching names without case', () => {
    const plan = planImport(parsed, { clients: [], projects: [], timeLogs: [] }, { noClientName: 'Без клиента' });
    expect(plan.newClients).toEqual(['Acme', 'Без клиента', 'Globex']);
    expect(plan.newProjects).toEqual([
      { name: 'Website', clientName: 'Acme' },
      { name: 'Internal', clientName: 'Без клиента' }
    ]);
    expect(plan.entries).toHaveLength(4);
    expect(plan.from).toBe(local(2026, 3, 2, 9, 0));
    expect(plan.to).toBe(local(2026, 3, 5, 9, 0));
    expect(plan.errors).toHaveLength(1);
  });

  it('reuses existing clients and projects', () => {
    const data = {
      clients: [{ id: 'c1', name: 'ACME', defaultRate: 50 }, { id: 'c2', name: 'globex', defaultRate: 0 }],
      projects: [{ id: 'p1', name: 'WEBSITE', clientId: 'c1', rate: 0 }],
      timeLogs: []
    };
    const plan = planImport(parsed, data, { noClientName: 'No client' });
    expect(plan.newClients).toEqual(['No client']);
    expect(plan.newProjects).toEqual([{ name: 'Internal', clientName: 'No client' }]);
  });

  it('a project of the same name under another client is new', () => {
    const data = {
      clients: [{ id: 'c1', name: 'Acme' }, { id: 'c9', name: 'Other' }],
      projects: [{ id: 'p9', name: 'Website', clientId: 'c9' }],
      timeLogs: []
    };
    const plan = planImport(parsed, data);
    expect(plan.newProjects[0]).toEqual({ name: 'Website', clientName: 'Acme' });
  });

  it('skips duplicates of existing entries and of earlier rows', () => {
    const first = parsed.entries[0];
    const data = {
      clients: [], projects: [],
      timeLogs: [{ id: 'l1', startTime: first.startTime, endTime: first.endTime, description: first.description }]
    };
    const twice = { ...parsed, entries: [...parsed.entries, parsed.entries[1]] };
    const plan = planImport(twice, data);
    expect(plan.duplicates).toBe(2);
    expect(plan.entries).toHaveLength(3);
  });

  it('an entry with another description is not a duplicate', () => {
    const first = parsed.entries[0];
    const data = { clients: [], projects: [], timeLogs: [{ startTime: first.startTime, endTime: first.endTime, description: 'other' }] };
    expect(planImport(parsed, data).duplicates).toBe(0);
  });
});

describe('buildImportRecords', () => {
  it('builds clients, projects and unpaid logs with matched rates', () => {
    const parsed = parseTimeEntriesCsv(fixture('toggl-detailed.csv'));
    const data = {
      clients: [{ id: 'c1', name: 'acme', defaultRate: 50, payments: [] }],
      projects: [{ id: 'p1', name: 'Website', clientId: 'c1', rate: 80 }],
      timeLogs: []
    };
    const plan = planImport(parsed, data, { noClientName: 'No client' });
    const added = buildImportRecords(plan, data, idFactory());
    expect(added.clients.map(c => c.name)).toEqual(['No client', 'Globex']);
    expect(added.clients[0]).toMatchObject({ defaultRate: 0, payments: [] });
    const noClient = added.clients[0];
    expect(added.projects).toEqual([{ id: added.projects[0].id, name: 'Internal', clientId: noClient.id, rate: 0 }]);
    expect(added.timeLogs).toHaveLength(4);
    expect(added.timeLogs[0]).toEqual({
      id: 'log_1', description: 'Homepage mockups [Design]', clientId: 'c1', projectId: 'p1',
      startTime: local(2026, 3, 2, 9, 0), endTime: local(2026, 3, 2, 10, 30),
      billable: true, paid: false, rateAtTime: 80
    });
    expect(added.timeLogs[1]).toMatchObject({ clientId: 'c1', projectId: 'p1', billable: false, rateAtTime: 80 });
    expect(added.timeLogs[2]).toMatchObject({ clientId: noClient.id, projectId: added.projects[0].id, rateAtTime: 0 });
    expect(added.timeLogs[3]).toMatchObject({ clientId: added.clients[1].id, projectId: null });
    expect(added.timeLogs.every(l => l.paid === false)).toBe(true);
  });

  it('falls back to the client rate and prefers the rate column', () => {
    const parsed = parseTimeEntriesCsv(fixture('clockify-detailed.csv'));
    const data = { clients: [{ id: 'c1', name: 'Initech', defaultRate: 45, payments: [] }], projects: [], timeLogs: [] };
    const plan = planImport(parsed, data);
    const added = buildImportRecords(plan, data, idFactory());
    expect(added.clients).toEqual([]);
    expect(added.projects.map(p => p.name)).toEqual(['Mobile app']);
    expect(added.timeLogs.map(l => l.rateAtTime)).toEqual([60, 0, 60]);
    expect(added.timeLogs[2].projectId).toBe(null);

    const noRate = { ...parsed, entries: parsed.entries.map(e => ({ ...e, rate: null })) };
    const added2 = buildImportRecords(planImport(noRate, data), data, idFactory());
    expect(added2.timeLogs.map(l => l.rateAtTime)).toEqual([45, 45, 45]);
  });
});
