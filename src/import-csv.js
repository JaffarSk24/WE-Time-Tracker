// Import of time entries from Toggl Track and Clockify CSV exports.
// Pure functions only (no DOM, no store), so every rule is covered by tests:
//   parseCsv(text)              rows of cells with the line each row starts on
//   parseTimeEntriesCsv(text)   recognised entries and unreadable rows
//   planImport(parsed, data)    what an import would add, match and skip
//   buildImportRecords(plan, data, newId)  the records to add to the store
// All times are read as LOCAL time, the way both services export them.

// Splits CSV text into rows. Handles a BOM, quoted fields with commas,
// semicolons, doubled quotes and newlines, and CRLF line ends. The delimiter
// (comma or semicolon) is taken from the header line.
export function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(src);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push({ cells: row, line: rowLine });
      row = [];
      cell = '';
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push({ cells: row, line: rowLine });
  }
  return { delimiter, rows };
}

// The delimiter that splits the header line (outside quotes) into more cells.
function detectDelimiter(src) {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

const norm = (s) => String(s || '').trim().toLowerCase();

// Which export a header row comes from: 'toggl', 'clockify' or null.
// Both share most column names; Clockify alone has the "Duration (h)" and
// "Duration (decimal)" pair and the "Billable Rate (XXX)" column.
export function detectFormat(headers) {
  const h = headers.map(norm);
  const has = (name) => h.includes(name);
  const required = ['start date', 'start time', 'end date', 'end time'];
  if (!required.every(has) || !has('description')) return null;
  if (h.some(x => x.startsWith('duration (h') || x.startsWith('duration (decimal') || x.startsWith('billable rate'))) {
    return 'clockify';
  }
  if (has('duration') || has('email') || has('user') || h.some(x => x.startsWith('amount'))) return 'toggl';
  return null;
}

// Column indexes of the fields the import reads.
function columnMap(headers) {
  const h = headers.map(norm);
  const find = (...names) => {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const rateIndex = h.findIndex(x => x === 'rate' || x.startsWith('billable rate') || x.startsWith('rate ('));
  return {
    client: find('client'),
    project: find('project'),
    task: find('task'),
    description: find('description'),
    billable: find('billable'),
    startDate: find('start date'),
    startTime: find('start time'),
    endDate: find('end date'),
    endTime: find('end time'),
    rate: rateIndex
  };
}

// --- Dates and times ---

// Date formats the import understands. For each, the parts of the date in
// year, month, day order, or null when the text does not fit the format.
const DATE_FORMATS = {
  ymd: (s) => {
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : null;
  },
  dmyDot: (s) => {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    return m ? [+m[3], +m[2], +m[1]] : null;
  },
  mdy: (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? [+m[3], +m[1], +m[2]] : null;
  },
  dmy: (s) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    return m ? [+m[3], +m[2], +m[1]] : null;
  }
};
// When several formats read every row, the first one in this list wins.
const DATE_FORMAT_ORDER = ['ymd', 'dmyDot', 'mdy', 'dmy'];

// [year, month, day] when they form a real calendar date.
function validDate(parts) {
  if (!parts) return null;
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1) return null;
  const last = new Date(y, m, 0).getDate();
  return d <= last ? parts : null;
}

// "14:05", "14:05:30", "2:05 PM", "2:05:30 am", "12:00 AM" -> [h, m, s].
export function parseTime(text) {
  const s = String(text || '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  const sec = m[3] ? +m[3] : 0;
  if (min > 59 || sec > 59) return null;
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    const pm = m[4].toLowerCase() === 'p';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  } else if (h > 23) {
    return null;
  }
  return [h, min, sec];
}

function localDate(dateParts, timeParts) {
  const [y, mo, d] = dateParts;
  const [h, mi, s] = timeParts;
  return new Date(y, mo - 1, d, h, mi, s);
}

// --- Cell values ---

export function parseBillable(text) {
  const s = norm(text);
  if (s === '') return false;
  return ['yes', 'true', '1', 'y', 'да', 'billable'].includes(s);
}

// "50", "50.5", "50,50", "1 250,00", "€50.00" -> number, or null.
export function parseRate(text) {
  let s = String(text || '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // The later separator is the decimal one.
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// --- Entries ---

// Reads a whole export. Returns
//   { format, delimiter, dateFormat, entries, errors }
// where entries are { line, client, project, description, startTime, endTime,
// billable, rate } with ISO times, and errors are { line, reason } for rows
// that could not be read (reason: 'date', 'time', 'order'). An unknown header
// gives { error: 'unknown_format' }, an empty file { error: 'empty' }.
export function parseTimeEntriesCsv(text) {
  const { delimiter, rows } = parseCsv(text);
  const isBlank = (r) => r.cells.every(c => c.trim() === '');
  const nonBlank = rows.filter(r => !isBlank(r));
  if (nonBlank.length === 0) return { error: 'empty' };
  const [header, ...data] = nonBlank;
  const format = detectFormat(header.cells);
  if (!format) return { error: 'unknown_format' };
  const col = columnMap(header.cells);
  const cell = (r, i) => (i === -1 ? '' : String(r.cells[i] ?? '').trim());

  // The date format is chosen once for the whole file: the one that reads
  // the most rows, so a file that is only valid as DD/MM/YYYY is never read
  // as MM/DD/YYYY (and the other way round).
  const rowTimes = (r, fmt) => {
    const sd = validDate(DATE_FORMATS[fmt](cell(r, col.startDate)));
    const ed = validDate(DATE_FORMATS[fmt](cell(r, col.endDate)));
    if (!sd || !ed) return { reason: 'date' };
    const st = parseTime(cell(r, col.startTime));
    const et = parseTime(cell(r, col.endTime));
    if (!st || !et) return { reason: 'time' };
    const start = localDate(sd, st);
    const end = localDate(ed, et);
    if (end <= start) return { reason: 'order' };
    return { start, end };
  };
  let dateFormat = DATE_FORMAT_ORDER[0];
  let best = -1;
  DATE_FORMAT_ORDER.forEach(fmt => {
    const ok = data.filter(r => !rowTimes(r, fmt).reason).length;
    if (ok > best) { best = ok; dateFormat = fmt; }
  });

  const entries = [];
  const errors = [];
  data.forEach(r => {
    const times = rowTimes(r, dateFormat);
    if (times.reason) {
      errors.push({ line: r.line, reason: times.reason });
      return;
    }
    const task = cell(r, col.task);
    const desc = cell(r, col.description);
    const description = task ? (desc ? `${desc} [${task}]` : `[${task}]`) : desc;
    entries.push({
      line: r.line,
      client: cell(r, col.client),
      project: cell(r, col.project),
      description,
      startTime: times.start.toISOString(),
      endTime: times.end.toISOString(),
      billable: col.billable === -1 ? true : parseBillable(cell(r, col.billable)),
      rate: col.rate === -1 ? null : parseRate(cell(r, col.rate))
    });
  });
  return { format, delimiter, dateFormat, entries, errors };
}

// --- Plan ---

const dupKey = (startTime, endTime, description) =>
  `${new Date(startTime).getTime()}|${new Date(endTime).getTime()}|${String(description || '').trim()}`;

// What importing the parsed file would do against the current data
// ({ clients, projects, timeLogs }). Clients and projects are matched by name
// without regard to case (projects within their client); rows without a
// client go to a client called noClientName. Rows equal to an existing entry
// or to an earlier row (same start, end and description) are skipped.
// Returns { entries, duplicates, errors, newClients, newProjects, from, to }
// where every entry carries clientKey and projectKey (lower-case names).
export function planImport(parsed, data, { noClientName = 'No client' } = {}) {
  const clients = data.clients || [];
  const projects = data.projects || [];
  const seen = new Set((data.timeLogs || []).map(l => dupKey(l.startTime, l.endTime, l.description)));
  const clientByKey = new Map(clients.map(c => [norm(c.name), c]));
  const newClients = new Map();
  const newProjects = new Map();
  const entries = [];
  let duplicates = 0;
  let from = null;
  let to = null;

  (parsed.entries || []).forEach(e => {
    const key = dupKey(e.startTime, e.endTime, e.description);
    if (seen.has(key)) { duplicates++; return; }
    seen.add(key);
    const clientName = e.client || noClientName;
    const clientKey = norm(clientName);
    const existingClient = clientByKey.get(clientKey);
    if (!existingClient && !newClients.has(clientKey)) newClients.set(clientKey, clientName);
    const projectKey = norm(e.project);
    if (projectKey) {
      const exists = existingClient && projects.some(p => p.clientId === existingClient.id && norm(p.name) === projectKey);
      const pk = `${clientKey}\u0000${projectKey}`;
      if (!exists && !newProjects.has(pk)) {
        newProjects.set(pk, { name: e.project, clientName: existingClient ? existingClient.name : newClients.get(clientKey) });
      }
    }
    if (!from || e.startTime < from) from = e.startTime;
    if (!to || e.endTime > to) to = e.endTime;
    entries.push({ ...e, clientKey, projectKey });
  });

  return {
    entries,
    duplicates,
    errors: parsed.errors || [],
    newClients: [...newClients.values()],
    newProjects: [...newProjects.values()],
    from,
    to
  };
}

// The records an import adds: { clients, projects, timeLogs }. Existing
// clients and projects are reused; rates come from the rate column when the
// file has one, otherwise from the matched project or client (as the app
// itself does). Imported entries are never marked paid.
export function buildImportRecords(plan, data, newId) {
  const clients = [...(data.clients || [])];
  const projects = [...(data.projects || [])];
  const added = { clients: [], projects: [], timeLogs: [] };

  const clientFor = (key, name) => {
    let c = clients.find(x => norm(x.name) === key);
    if (!c) {
      c = { id: newId('client'), name: name.trim(), defaultRate: 0, payments: [] };
      clients.push(c);
      added.clients.push(c);
    }
    return c;
  };
  const projectFor = (client, key, name) => {
    let p = projects.find(x => x.clientId === client.id && norm(x.name) === key);
    if (!p) {
      p = { id: newId('project'), name: name.trim(), clientId: client.id, rate: 0 };
      projects.push(p);
      added.projects.push(p);
    }
    return p;
  };
  const rateOf = (client, project) => {
    if (project && project.rate > 0) return project.rate;
    return Number(client.defaultRate) || 0;
  };

  plan.entries.forEach(e => {
    const clientName = plan.newClients.find(n => norm(n) === e.clientKey) || e.client || e.clientKey;
    const client = clientFor(e.clientKey, clientName);
    const project = e.projectKey ? projectFor(client, e.projectKey, e.project) : null;
    added.timeLogs.push({
      id: newId('log'),
      description: e.description,
      clientId: client.id,
      projectId: project ? project.id : null,
      startTime: e.startTime,
      endTime: e.endTime,
      billable: e.billable,
      paid: false,
      rateAtTime: e.rate !== null && e.rate !== undefined ? e.rate : rateOf(client, project)
    });
  });
  return added;
}
