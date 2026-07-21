// WE Time Tracker — общие утилиты (см. AGENTS.md: даты только локальные,
// пользовательский ввод в DOM только через escapeHtml/textContent).

// Шаг округления биллинга: длительность каждой записи округляется ВВЕРХ
// до 5-минутных блоков при расчёте суммы (само время отображается точным).
export const BILLING_ROUND_MINUTES = 5;

// Фактически отработанная длительность записи в мс.
// Если из-за пауз она короче интервала startTime..endTime — используем
// сохранённую durationMs; иначе интервал.
export function logDurationMs(log) {
  if (log.durationMs !== undefined && log.durationMs !== null) {
    return log.durationMs;
  }
  return new Date(log.endTime) - new Date(log.startTime);
}

// Округлённые часы для расчёта денег.
export function billableHours(durationMs) {
  if (durationMs <= 0) return 0;
  const blockMs = BILLING_ROUND_MINUTES * 60000;
  return (Math.ceil(durationMs / blockMs) * blockMs) / 3600000;
}

// Экранирование пользовательских строк перед вставкой в innerHTML.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ISO-строка -> значение для <input type="datetime-local"> в ЛОКАЛЬНОМ времени.
export function toLocalDatetimeString(isoOrDate) {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

// Локальный ключ дня YYYY-MM-DD (НЕ UTC-срез ISO-строки).
export function localDayKey(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Ключ дня -> локальная полночь этого дня (new Date('YYYY-MM-DD') дал бы UTC).
export function dayKeyToLocalDate(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Миллисекунды -> "HH:MM:SS".
export function formatDurationHMS(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return [hrs, mins, secs].map(n => String(n).padStart(2, '0')).join(':');
}

// Десятичные часы -> "2ч 15м" / "2h 15m" (без бага "1ч 60м" на округлении).
export function formatDurationShort(decimalHours, lang) {
  const totalMinutes = Math.round(decimalHours * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return lang === 'ru' ? `${hrs}ч ${mins}м` : `${hrs}h ${mins}m`;
}

// Заполнение <select> списком {id, name} с плейсхолдером.
export function fillSelect(element, items, placeholderText, selectedId = null) {
  if (!element) return;
  element.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = placeholderText;
  element.appendChild(placeholder);

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    if (selectedId && item.id === selectedId) {
      opt.selected = true;
    }
    element.appendChild(opt);
  });
}

// Экранирование ячейки CSV: кавычки удваиваются, значения с формульными
// префиксами (= + - @) получают апостроф — защита от CSV-инъекций в Excel.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }
  return '"' + s.replace(/"/g, '""') + '"';
}
