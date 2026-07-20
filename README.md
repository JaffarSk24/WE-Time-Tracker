# 🦅 WE Time Tracker

Bilingual (RU/EN) offline-first time tracking and financial analytics tool designed specifically for freelancers working with multiple clients and variable project rates. Released under a free public license by **White Eagles & Co. s.r.o.**

[Russian Version Below | Русская версия ниже](#ru-описание)

---

## 🎯 Key Features

1. **Flexible Rates**: Set default hourly rates per client (in EUR), or override them with custom rates for specific projects.
2. **Historical Billing Integrity**: Saved time logs retain the historical hourly rate active at the moment of tracking. Modifying rates in the future does not alter your past earnings history.
3. **Live Timer & Manual Entry**: Start/stop the timer in real-time or log past tasks manually using a clean calendar interface.
4. **Interactive Dashboard**: Keep track of total hours, total earnings, active clients, and projects. Visualize time distribution with interactive doughnut charts and view weekly activity using bar charts (powered by Chart.js).
5. **Detailed Reports**: Filter logs by client, project, payment type (billable/non-billable), and pre-defined or custom date ranges (Today, Yesterday, This Week, This Month).
6. **Data Portability & Backups**: Import and export your entire database (clients, projects, settings, and logs) in one click as a JSON file. Prevent iCloud sync lockups by creating physical manual backups.
7. **Bilingual UI**: Switch seamlessly between Russian and English.
8. **Premium Dark Theme**: Sleek glassmorphism visual layout tailored for night-owl creators and developers.

---

## 🚀 How to Run Locally

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18.0.0 or higher recommended).

### Setup Instructions
1. **Clone the repository:**
   ```bash
   git clone https://github.com/JaffarSk24/WE-Time-Tracker.git
   cd WE-Time-Tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   *Vite will start the server on port 3000 (or another available port). Open your browser and navigate to the address shown in the terminal (usually `http://localhost:3000`).*

4. **Build for production:**
   To bundle the application into optimized static assets:
   ```bash
   npm run build
   ```
   *The built files will be located in the `dist/` directory, ready to be served by any static host.*

---

## 📄 License & Attribution

This software is released under the open license of **White Eagles & Co. s.r.o.**
Feel free to download, modify, and run this time tracker locally for personal or commercial needs.

For modern website development and high-ROI Google/Social Media marketing campaigns, visit:  
🔗 **[White Eagles & Co. s.r.o.](https://whiteeagles.sk/)**

---

## RU: Описание

**WE Time Tracker** — это двуязычный (RU/EN) инструмент для учета рабочего времени и финансовой аналитики, разработанный специально для фрилансеров, работающих с несколькими клиентами и разными почасовыми ставками для различных проектов.

### 🎯 Возможности
1. **Гибкие ставки (EUR)**: Указывайте индивидуальную базовую ставку для каждого клиента или переопределяйте ее внутри конкретных проектов.
2. **Сохранение истории ставок**: Записи времени фиксируют текущую ставку на момент выполнения задачи. Будущие изменения цен не исказят историю ваших прошлых доходов.
3. **Два режима трекинга**: Секундомер реального времени с функцией паузы/отмены и форма ручного ретроспективного ввода.
4. **Визуальная аналитика (Дашборд)**: Сводные данные по заработку и часам. Красивые графики распределения времени по клиентам/проектам и гистограмма недельной активности на базе Chart.js.
5. **Детализированные отчеты**: Фильтрация записей по клиентам, проектам, признаку оплаты и датам (Сегодня, Вчера, Неделя, Месяц). Экспорт таблиц в CSV (с корректной поддержкой кириллицы в Excel) и JSON.
6. **Резервное копирование (Backup)**: Удобный импорт и экспорт всей базы данных (клиенты, проекты, настройки, логи) в один клик в файл JSON.
7. **Премиум-дизайн**: Современный темный интерфейс с эффектом матового стекла (glassmorphism) и плавной анимацией.

### 🚀 Запуск на локальном компьютере
1. **Склонируйте репозиторий:**
   ```bash
   git clone https://github.com/JaffarSk24/WE-Time-Tracker.git
   cd WE-Time-Tracker
   ```
2. **Установите пакеты:**
   ```bash
   npm install
   ```
3. **Запустите локальный сервер Vite:**
   ```bash
   npm run dev
   ```
4. **Сборка продакшн-версии:**
   ```bash
   npm run build
   ```

---
Разработано при поддержке White Eagles & Co. s.r.o. По всем вопросам создания сайтов и онлайн-рекламы переходите на:  
🔗 **[https://whiteeagles.sk/](https://whiteeagles.sk/)**
