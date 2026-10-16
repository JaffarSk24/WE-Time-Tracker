// Content of the "Features" view: every feature of the app with a short
// explanation of what it does, where it is and how to use it. Kept as data
// in both languages, so the view itself stays a plain renderer.
//
// Fields: id, icon (Lucide name registered in app.js), isNew (came with the
// current version), view (section id the "Open" button switches to, optional),
// title / body / where as { ru, en }; body is a list of paragraphs.

export const FEATURE_SECTIONS = [
  { id: 'timer', icon: 'play-circle', title: { ru: 'Таймер', en: 'Timer' } },
  { id: 'entries', icon: 'file-spreadsheet', title: { ru: 'Записи и отчёты', en: 'Entries and reports' } },
  { id: 'money', icon: 'wallet', title: { ru: 'Клиенты и деньги', en: 'Clients and money' } },
  { id: 'analytics', icon: 'bar-chart-3', title: { ru: 'Аналитика и цели', en: 'Analytics and goals' } },
  { id: 'data', icon: 'cloud', title: { ru: 'Данные, синхронизация, обновления', en: 'Data, sync and updates' } }
];

export const FEATURES = [
  // ---------------- Timer ----------------
  {
    id: 'timer-basic', section: 'timer', icon: 'play-circle', view: 'timer-view',
    title: { ru: 'Таймер с паузой', en: 'Timer with pause' },
    body: {
      ru: ['Напишите, что делаете, выберите клиента и, если нужно, проект, затем нажмите «Старт». «Пауза» останавливает отсчёт, «Продолжить» возобновляет: время на паузе в запись не попадает. «Стоп» сохраняет запись, крестик отменяет таймер без сохранения.',
        'Галочка «Требует оплаты» решает, войдёт ли запись в заработок и долг клиента.'],
      en: ['Type what you are doing, pick the client and, if you like, a project, then press Start. Pause stops the count and Resume continues it: paused time is not counted. Stop saves the entry, the cross cancels the timer without saving.',
        'The "Requires payment" box decides whether the entry counts towards earnings and the client\'s debt.']
    },
    where: { ru: 'Таймер', en: 'Timer' }
  },
  {
    id: 'manual-entry', section: 'timer', icon: 'plus', view: 'timer-view',
    title: { ru: 'Ввод вручную', en: 'Manual entry' },
    body: {
      ru: ['Если работали без таймера, внесите запись с началом и концом. Время по умолчанию: последний час. Если новая запись пересекается с уже существующей, приложение предупредит, но сохранит её.'],
      en: ['If you worked without the timer, add an entry with its start and end. The default is the last hour. If the new entry overlaps an existing one, the app warns you but still saves it.']
    },
    where: { ru: 'Таймер, карточка «Ввод вручную»', en: 'Timer, "Manual entry" card' }
  },
  {
    id: 'continue', section: 'timer', icon: 'play', view: 'timer-view',
    title: { ru: 'Продолжить задачу', en: 'Continue a task' },
    body: {
      ru: ['Кнопка ▶ у записи запускает таймер с тем же описанием, клиентом, проектом и тегами. Если таймер уже идёт, он сначала остановится и сохранится.'],
      en: ['The ▶ button on an entry starts the timer with the same description, client, project and tags. A running timer is stopped and saved first.']
    },
    where: { ru: 'Таймер, список «Сегодня»; Отчёты, у каждой записи', en: 'Timer, "Today" list; Reports, on every entry' }
  },
  {
    id: 'suggestions', section: 'timer', icon: 'search', view: 'timer-view', isNew: true,
    title: { ru: 'Подсказки описаний', en: 'Description suggestions' },
    body: {
      ru: ['Начните печатать описание: появится список прежних задач с клиентом и проектом. Выберите стрелками и Enter или мышью, и клиент, проект и оплата подставятся сами.'],
      en: ['Start typing a description and earlier tasks appear with their client and project. Pick one with the arrows and Enter or with the mouse, and the client, project and billing are filled in.']
    },
    where: { ru: 'Таймер: поле описания и ручной ввод', en: 'Timer: the description field and manual entry' }
  },
  {
    id: 'tags', section: 'timer', icon: 'tag', view: 'clients-view', isNew: true,
    title: { ru: 'Теги', en: 'Tags' },
    body: {
      ru: ['Теги помечают вид работы поперёк клиентов: «Реклама», «SEO», «Созвоны». Создайте их на вкладке «Теги», затем выбирайте кнопкой «Теги» у таймера, в ручном вводе и при правке записи.',
        'По тегу можно отфильтровать отчёт, теги попадают в CSV, а на дашборде есть карточка «По тегам» с часами и суммой.'],
      en: ['Tags mark the kind of work across clients: "Ads", "SEO", "Calls". Create them on the Tags tab, then pick them with the Tags button of the timer, in manual entry and when editing an entry.',
        'Reports can be filtered by tag, tags go into the CSV export, and the dashboard has a "By tag" card with hours and amounts.']
    },
    where: { ru: 'Клиенты & Проекты, вкладка «Теги»', en: 'Clients & Projects, Tags tab' }
  },
  {
    id: 'tray', section: 'timer', icon: 'clock', isNew: true,
    title: { ru: 'Таймер в меню-баре и быстрый старт', en: 'Menu-bar timer and quick start' },
    body: {
      ru: ['Пока таймер идёт, время видно в меню-баре на Mac и в подсказке значка в трее на Windows. Меню значка показывает последние 5 задач: щелчок запускает нужную, остановив текущую. Там же «Остановить таймер».',
        'Всё это работает и при закрытом окне.'],
      en: ['While the timer runs, the time shows in the Mac menu bar and in the tray icon tooltip on Windows. The icon\'s menu lists your last 5 tasks: a click starts one and stops the current timer. "Stop timer" is there too.',
        'All of it works with the window closed.']
    },
    where: { ru: 'Значок в меню-баре или в трее', en: 'The menu-bar or tray icon' }
  },
  {
    id: 'hotkey', section: 'timer', icon: 'play-circle', view: 'settings-view', isNew: true,
    title: { ru: 'Горячая клавиша', en: 'Global hotkey' },
    body: {
      ru: ['⌘⌥⇧T на Mac или Ctrl+Alt+Shift+T на Windows работает из любой программы: останавливает идущий таймер, а если он не идёт, продолжает последнюю задачу. Короткое уведомление скажет, что произошло. Включена по умолчанию.'],
      en: ['⌘⌥⇧T on a Mac or Ctrl+Alt+Shift+T on Windows works from any program: it stops the running timer or, when none runs, continues your last task. A short notification says what happened. On by default.']
    },
    where: { ru: 'Настройки, «Таймер и напоминания»', en: 'Settings, "Timer and reminders"' }
  },
  {
    id: 'idle', section: 'timer', icon: 'clock', view: 'settings-view', isNew: true,
    title: { ru: 'Если вы отошли', en: 'When you step away' },
    body: {
      ru: ['Если таймер идёт, а за компьютером никого нет дольше 10 минут (или компьютер уснул), при возвращении приложение спросит, что сделать с этим временем: оставить, убрать и продолжить, или убрать и остановить таймер на моменте ухода.',
        'Порог меняется в настройках, 0 выключает проверку.'],
      en: ['If the timer runs while nobody uses the computer for more than 10 minutes (or it goes to sleep), the app asks on your return what to do with that time: keep it, drop it and continue, or drop it and stop the timer at the moment you left.',
        'The threshold is set in Settings, 0 turns the check off.']
    },
    where: { ru: 'Настройки, «Таймер и напоминания»', en: 'Settings, "Timer and reminders"' }
  },
  {
    id: 'reminders', section: 'timer', icon: 'bell', view: 'settings-view', isNew: true,
    title: { ru: 'Напоминания', en: 'Reminders' },
    body: {
      ru: ['Системные уведомления, даже при закрытом окне. Первое: таймер идёт дольше 4 часов (повторяется с тем же шагом). Второе: в рабочее время таймер не запущен, а вы за компьютером. По умолчанию это пн-пт с 9:00 до 18:00, не чаще раза в 30 минут.',
        'Дни, часы, интервал и пороги настраиваются, любое напоминание можно выключить.'],
      en: ['System notifications, even with the window closed. One: the timer has run for more than 4 hours (repeated at the same step). Two: during working hours no timer runs while you are at the computer. By default Mon-Fri, 9:00 to 18:00, at most every 30 minutes.',
        'Days, hours, interval and thresholds can be changed, and each reminder can be turned off.']
    },
    where: { ru: 'Настройки, «Таймер и напоминания»', en: 'Settings, "Timer and reminders"' }
  },
  {
    id: 'login-item', section: 'timer', icon: 'log-in', view: 'settings-view', isNew: true,
    title: { ru: 'Запуск при входе в систему', en: 'Launch at login' },
    body: {
      ru: ['Включите, и приложение будет запускаться само, когда вы входите в систему, чтобы таймер и напоминания всегда были под рукой. По умолчанию выключено.'],
      en: ['Turn it on and the app starts by itself when you log in, so the timer and reminders are always at hand. Off by default.']
    },
    where: { ru: 'Настройки, «Таймер и напоминания»', en: 'Settings, "Timer and reminders"' }
  },
  {
    id: 'calendar', section: 'timer', icon: 'calendar-clock', view: 'settings-view', isNew: true,
    title: { ru: 'Подсказки из Google Календаря', en: 'Suggestions from Google Calendar' },
    body: {
      ru: ['Встречи сегодняшнего и вчерашнего дня, для которых ещё нет записи, появляются карточкой на экране таймера. Выберите клиента и нажмите «Записать», или скройте встречу. Клиент запоминается для встреч с тем же названием.',
        'Включается переключателем в настройках и требует отдельного разрешения Google на чтение календаря. Пока Google не проверил приложение, на этом шаге он покажет предупреждение о непроверенном приложении. Синхронизацию это не затрагивает.'],
      en: ['Meetings of today and yesterday that have no entry yet show as a card on the Timer view. Pick the client and press Record, or hide the meeting. The client is remembered for meetings with the same title.',
        'Turn it on in Settings; it needs a separate Google permission to read the calendar. Until Google has verified the app, this step shows an "unverified app" warning. Sync is not affected.']
    },
    where: { ru: 'Настройки, рядом с синхронизацией; карточка на экране таймера', en: 'Settings, next to sync; a card on the Timer view' }
  },

  // ---------------- Entries and reports ----------------
  {
    id: 'reports', section: 'entries', icon: 'file-spreadsheet', view: 'reports-view',
    title: { ru: 'Отчёты и фильтры', en: 'Reports and filters' },
    body: {
      ru: ['Все записи по дням с фильтрами по клиенту, проекту, статусу оплаты, периоду и тегу. Сверху показаны часы и сумма за выбранное. Запись правится карандашом, удаляется корзиной.'],
      en: ['All entries by day, filtered by client, project, payment status, period and tag. The hours and amount of what is shown are on top. Edit an entry with the pencil, delete it with the bin.']
    },
    where: { ru: 'Отчёты & Логи', en: 'Reports & Logs' }
  },
  {
    id: 'bulk', section: 'entries', icon: 'check-circle', view: 'reports-view',
    title: { ru: 'Массовые действия и отмена', en: 'Bulk actions and undo' },
    body: {
      ru: ['Отметьте несколько записей галочками: их можно разом пометить оплаченными, удалить или объединить. После удаления и отметки оплаты всплывает «Отменить».'],
      en: ['Tick several entries to mark them paid, delete them or merge them in one go. Deleting and marking paid show an Undo button.']
    },
    where: { ru: 'Отчёты & Логи', en: 'Reports & Logs' }
  },
  {
    id: 'split-merge', section: 'entries', icon: 'scissors', view: 'reports-view', isNew: true,
    title: { ru: 'Разделить и объединить', en: 'Split and merge' },
    body: {
      ru: ['Ножницы у записи делят её на две в выбранный момент. Время и сумма распределяются точно, паузы учитываются. Две и больше записей одного клиента, проекта и статуса можно объединить в одну.',
        'Оплаченные записи не делятся и не объединяются: сначала снимите отметку оплаты.'],
      en: ['The scissors on an entry split it in two at the moment you choose. Time and money are divided exactly, pauses included. Two or more entries of the same client, project and status can be merged into one.',
        'Paid entries can be neither split nor merged: unmark them as paid first.']
    },
    where: { ru: 'Отчёты & Логи', en: 'Reports & Logs' }
  },
  {
    id: 'export', section: 'entries', icon: 'download', view: 'reports-view',
    title: { ru: 'Экспорт в CSV и JSON', en: 'CSV and JSON export' },
    body: {
      ru: ['CSV открывается в Excel и Numbers, в нём описание, клиент, проект, время, статус, ставка, сумма и теги. Выгружается то, что выбрано фильтрами.'],
      en: ['The CSV opens in Excel and Numbers with description, client, project, times, status, rate, amount and tags. It exports what the filters show.']
    },
    where: { ru: 'Отчёты & Логи', en: 'Reports & Logs' }
  },
  {
    id: 'client-report', section: 'entries', icon: 'file-text', view: 'reports-view', isNew: true,
    title: { ru: 'Отчёт для клиента в PDF', en: 'Client report as PDF' },
    body: {
      ru: ['Аккуратный документ для клиента: ваши реквизиты, клиент, период, таблица работ с временем и суммой, итоги по проектам. Без внутренних данных: платежей и баланса там нет.',
        'Выберите клиента и период в фильтрах и нажмите «Отчёт для клиента (PDF)». Реквизиты для шапки заполняются один раз в настройках.'],
      en: ['A clean document for the client: your details, the client, the period, a table of work with time and amount, totals per project. No internal data: payments and balance are not in it.',
        'Pick the client and period in the filters and press "Client report (PDF)". The header details are filled in once in Settings.']
    },
    where: { ru: 'Отчёты & Логи; реквизиты в Настройках', en: 'Reports & Logs; details in Settings' }
  },
  {
    id: 'lock', section: 'entries', icon: 'lock', view: 'settings-view', isNew: true,
    title: { ru: 'Закрытый период и защита оплаченных', en: 'Locked period and paid entries' },
    body: {
      ru: ['Задайте дату, и записи по эту дату включительно нельзя будет изменить, удалить или добавить задним числом. Оплаченные записи защищены всегда: у них виден замок, а окно правки открывается только для чтения.',
        'Чтобы поправить оплаченную запись, нажмите в нём «Снять отметку оплаты». Таймер, начатый в закрытом периоде, всё равно сохранится: новая работа не теряется.'],
      en: ['Set a date and entries up to it can no longer be changed, deleted or added after the fact. Paid entries are always protected: they show a lock and open read-only.',
        'To change a paid entry, press "Unmark as paid" in its window. A timer started inside the locked period is still saved: new work is never lost.']
    },
    where: { ru: 'Настройки, «Закрытый период»', en: 'Settings, "Locked period"' }
  },
  {
    id: 'week', section: 'entries', icon: 'calendar-days', view: 'week-view', isNew: true,
    title: { ru: 'Неделя: табель', en: 'Week: timesheet' },
    body: {
      ru: ['Сетка «клиент · проект» по дням недели с итогами и суммой. Стрелки листают недели. Щелчок по ячейке показывает её записи и позволяет добавить время за этот день: запись встанет сразу после последней в этот день или в 9:00.'],
      en: ['A grid of client · project by weekday with totals and amounts. The arrows move between weeks. Clicking a cell shows its entries and lets you add time for that day: the entry goes right after the day\'s last one or at 9:00.']
    },
    where: { ru: 'Неделя', en: 'Week' }
  },
  {
    id: 'timeline', section: 'entries', icon: 'gauge', view: 'week-view', isNew: true,
    title: { ru: 'Лента дня и пересечения', en: 'Day timeline and overlaps' },
    body: {
      ru: ['Под табелем лента выбранного дня: записи блоками по клиентам, пустые промежутки видны сразу. Записи, которые пересекаются по времени, выделены красным и перечислены ниже с кнопками правки. День выбирается щелчком по заголовку столбца.'],
      en: ['Below the timesheet, the timeline of the selected day: entries as blocks by client, gaps visible at once. Entries that overlap in time are red and listed below with edit buttons. Click a column header to pick the day.']
    },
    where: { ru: 'Неделя', en: 'Week' }
  },
  {
    id: 'import', section: 'entries', icon: 'download-cloud', view: 'settings-view', isNew: true,
    title: { ru: 'Импорт из Toggl и Clockify', en: 'Import from Toggl and Clockify' },
    body: {
      ru: ['Выгрузите подробный отчёт (detailed report) в CSV из Toggl Track или Clockify и выберите файл. До импорта будет видно, сколько записей придёт, какие клиенты и проекты создадутся, какие повторы пропущены и какие строки не прочитались. После импорта всё можно отменить одной кнопкой.'],
      en: ['Export a detailed report as CSV from Toggl Track or Clockify and choose the file. Before importing you see how many entries come in, which clients and projects are created, which duplicates are skipped and which rows could not be read. The whole import can be undone with one button.']
    },
    where: { ru: 'Настройки, «Управление данными»', en: 'Settings, "Data management"' }
  },

  // ---------------- Clients and money ----------------
  {
    id: 'clients-rates', section: 'money', icon: 'briefcase', view: 'clients-view',
    title: { ru: 'Клиенты, проекты и ставки', en: 'Clients, projects and rates' },
    body: {
      ru: ['У клиента ставка по умолчанию, у проекта может быть своя (0 значит ставка клиента). Каждая запись запоминает ставку на момент работы, поэтому смена ставки не переписывает прошлый заработок.',
        'Суммы считаются с точностью до минуты, без округления вверх; минимум для начатой записи: 1 минута.'],
      en: ['A client has a default rate and a project may have its own (0 means the client\'s). Every entry keeps the rate it was made with, so changing a rate does not rewrite past earnings.',
        'Amounts are counted to the minute, never rounded up; a started entry counts at least 1 minute.']
    },
    where: { ru: 'Клиенты & Проекты', en: 'Clients & Projects' }
  },
  {
    id: 'payments', section: 'money', icon: 'wallet', view: 'clients-view',
    title: { ru: 'Платежи, долг и аванс', en: 'Payments, debt and advance' },
    body: {
      ru: ['Кнопка платежей у клиента открывает его баланс: наработано, получено, долг или аванс. Внесите полученный платёж, и долг уменьшится.',
        'Отметка «оплачено» у записей сама создаёт платёж на их сумму, а снятие отметки его убирает, так что двойного учёта не бывает.'],
      en: ['The payments button on a client opens the balance: billed, received, debt or advance. Add a payment you received and the debt goes down.',
        'Marking entries as paid creates a payment for their amount, and unmarking removes it, so nothing is counted twice.']
    },
    where: { ru: 'Клиенты & Проекты, кнопка платежей у клиента', en: 'Clients & Projects, the payments button of a client' }
  },
  {
    id: 'expenses', section: 'money', icon: 'coins', view: 'clients-view', isNew: true,
    title: { ru: 'Расходы клиента', en: 'Client expenses' },
    body: {
      ru: ['Деньги, потраченные за клиента, например рекламный бюджет. Расход «к оплате клиентом» добавляется к его долгу. Список расходов выгружается в CSV.'],
      en: ['Money spent on the client\'s behalf, for example an ad budget. A billable expense is added to what the client owes. The expense list can be exported to CSV.']
    },
    where: { ru: 'Окно платежей клиента, раздел «Расходы»', en: 'The client\'s payments window, "Expenses"' }
  },
  {
    id: 'currency', section: 'money', icon: 'euro', view: 'clients-view', isNew: true,
    title: { ru: 'Валюта клиента', en: 'Client currency' },
    body: {
      ru: ['У каждого клиента своя валюта (EUR, USD, CZK, GBP, PLN, CHF), валюта по умолчанию задаётся в настройках. Его ставки, суммы, бюджеты и отчёты идут в этой валюте. Итоги по разным валютам показываются отдельными строками и никогда не складываются.',
        'Смена валюты меняет только подпись, суммы не пересчитываются.'],
      en: ['Each client has its own currency (EUR, USD, CZK, GBP, PLN, CHF); the default one is set in Settings. Its rates, amounts, budgets and reports are in that currency. Totals in different currencies are shown on separate lines and never added together.',
        'Changing the currency only relabels amounts, nothing is converted.']
    },
    where: { ru: 'Окно клиента; Настройки', en: 'The client window; Settings' }
  },
  {
    id: 'budgets', section: 'money', icon: 'target', view: 'clients-view', isNew: true,
    title: { ru: 'Бюджеты проектов и пакеты часов', en: 'Project budgets and hour packages' },
    body: {
      ru: ['В окне проекта задайте бюджет в часах и/или в деньгах: на весь проект или на каждый месяц (пакет, который обнуляется 1-го числа). Полоса прогресса видна на карточке проекта и под таймером.',
        'При 80% и при 100% бюджета появится предупреждение, по одному разу за период.'],
      en: ['In the project window set a budget in hours and/or money: for the whole project or per month (a package that resets on the 1st). A progress bar shows on the project card and under the timer.',
        'At 80% and at 100% of the budget you get a warning, once per period.']
    },
    where: { ru: 'Клиенты & Проекты, окно проекта', en: 'Clients & Projects, the project window' }
  },

  // ---------------- Analytics and goals ----------------
  {
    id: 'dashboard', section: 'analytics', icon: 'bar-chart-3', view: 'dashboard-view',
    title: { ru: 'Дашборд', en: 'Dashboard' },
    body: {
      ru: ['Всего часов и заработано, проекты и клиенты, время по проектам и клиентам, активность за выбранный период: от 7 дней до года.'],
      en: ['Total hours and earnings, projects and clients, time by project and by client, and activity for the chosen period, from 7 days to a year.']
    },
    where: { ru: 'Дашборд', en: 'Dashboard' }
  },
  {
    id: 'period-analytics', section: 'analytics', icon: 'trending-up', view: 'dashboard-view', isNew: true,
    title: { ru: 'Аналитика за период', en: 'Period analytics' },
    body: {
      ru: ['Эффективная ставка (сколько приносит час с учётом бесплатной работы), доля оплачиваемых часов, сравнение с прошлым периодом той же длины и прогноз дохода на месяц по рабочим дням. Период берётся из переключателя «Активность».'],
      en: ['Effective hourly rate (what an hour earns, free work included), the share of billable hours, a comparison with the previous period of the same length and a monthly income forecast by working days. The period follows the Activity selector.']
    },
    where: { ru: 'Дашборд, «Аналитика за период»', en: 'Dashboard, "Period analytics"' }
  },
  {
    id: 'aging', section: 'analytics', icon: 'calendar-x', view: 'dashboard-view', isNew: true,
    title: { ru: 'Долги по давности', en: 'Debts by age' },
    body: {
      ru: ['Неоплаченная работа по клиентам, разложенная по давности: до 30, 31-60, 61-90 и больше 90 дней. Клиенты без долга в таблицу не попадают.'],
      en: ['Unpaid work per client, split by age: up to 30, 31-60, 61-90 and over 90 days. Clients without debt are left out.']
    },
    where: { ru: 'Дашборд', en: 'Dashboard' }
  },
  {
    id: 'goals', section: 'analytics', icon: 'target', view: 'settings-view', isNew: true,
    title: { ru: 'Цели на неделю и месяц', en: 'Weekly and monthly goals' },
    body: {
      ru: ['Задайте оплачиваемые часы в неделю, сумму в неделю и сумму в месяц. Прогресс виден на таймере и на дашборде. Неделя начинается с понедельника, суммы считаются в валюте по умолчанию. Пустое поле выключает цель.'],
      en: ['Set billable hours per week, an amount per week and per month. Progress shows on the Timer view and the dashboard. Weeks start on Monday, amounts count in the default currency. An empty field turns the goal off.']
    },
    where: { ru: 'Настройки, «Цели»', en: 'Settings, "Goals"' }
  },
  {
    id: 'by-tag', section: 'analytics', icon: 'tag', view: 'dashboard-view', isNew: true,
    title: { ru: 'Часы и деньги по тегам', en: 'Hours and money by tag' },
    body: {
      ru: ['Сколько времени и денег приносит каждый вид работы за выбранный период. Запись с несколькими тегами учитывается в каждом.'],
      en: ['How much time and money each kind of work brings in the chosen period. An entry with several tags counts for each of them.']
    },
    where: { ru: 'Дашборд, «По тегам»', en: 'Dashboard, "By tag"' }
  },

  // ---------------- Data, sync and updates ----------------
  {
    id: 'local-data', section: 'data', icon: 'database', view: 'settings-view',
    title: { ru: 'Данные у вас и резервные копии', en: 'Your data and backups' },
    body: {
      ru: ['Все данные хранятся в одном файле на вашем компьютере. Раз в день, перед первым изменением, приложение сохраняет копию, последние 14 копий остаются. Работает без интернета.',
        'Полную копию можно экспортировать в JSON и импортировать обратно.'],
      en: ['All data is kept in one file on your computer. Once a day, before the first change, the app saves a copy, and the last 14 are kept. It works offline.',
        'A full copy can be exported to JSON and imported back.']
    },
    where: { ru: 'Настройки, «Управление данными»', en: 'Settings, "Data management"' }
  },
  {
    id: 'sync', section: 'data', icon: 'cloud', view: 'settings-view',
    title: { ru: 'Синхронизация через Google Drive', en: 'Sync through Google Drive' },
    body: {
      ru: ['Войдите через Google, и данные будут одинаковыми на всех ваших компьютерах. Они лежат в скрытой папке вашего Google Drive, сервера посредника нет.',
        'При запуске приложение только забирает данные из облака, отправляет при закрытии и по кнопке «Синхронизировать». Если работа велась на двух компьютерах, записи объединяются сами, ничего не теряется и ничего не нужно выбирать.'],
      en: ['Sign in with Google and your data is the same on all your computers. It lives in a hidden folder of your own Google Drive, with no server of ours in between.',
        'On launch the app only takes data from the cloud; it uploads on closing and with the Sync button. When work was done on two computers, the entries are combined automatically, nothing is lost and there is nothing to choose.']
    },
    where: { ru: 'Настройки, «Синхронизация с Google Drive»', en: 'Settings, "Google Drive sync"' }
  },
  {
    id: 'updates', section: 'data', icon: 'refresh-cw', view: 'settings-view',
    title: { ru: 'Обновления в один клик', en: 'One-click updates' },
    body: {
      ru: ['Когда выходит новая версия, сверху появляется баннер. «Обновить» скачивает её и проверяет, «Перезапустить и обновить» ставит новую версию и открывает приложение заново. Перетаскивать ничего не нужно.'],
      en: ['When a new version is out, a banner appears on top. Update downloads and checks it, "Restart and update" installs it and opens the app again. Nothing to drag.']
    },
    where: { ru: 'Баннер сверху; Настройки, «Обновление приложения»', en: 'The banner on top; Settings, "App update"' }
  },
  {
    id: 'phone', section: 'data', icon: 'external-link', isNew: true,
    title: { ru: 'Версия для телефона', en: 'Phone version' },
    body: {
      ru: ['Веб-приложение для телефона с теми же данными через Google Drive: таймер, сегодняшние записи, ручной ввод и неделя. Его можно добавить на экран «Домой». Синхронизация работает по тем же правилам, что и на компьютере.'],
      en: ['A web app for your phone with the same data through Google Drive: the timer, today\'s entries, manual entry and the week. It can be added to the home screen. Sync follows the same rules as on the computer.']
    },
    where: { ru: 'jaffarsk24.github.io/WE-Time-Tracker/app/', en: 'jaffarsk24.github.io/WE-Time-Tracker/app/' }
  },
  {
    id: 'language-theme', section: 'data', icon: 'palette', view: 'settings-view',
    title: { ru: 'Язык и тема', en: 'Language and theme' },
    body: {
      ru: ['Интерфейс на русском или английском, тёмная или светлая тема.'],
      en: ['The interface in Russian or English, dark or light theme.']
    },
    where: { ru: 'Настройки', en: 'Settings' }
  }
];
