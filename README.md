# 🦅 WE Time Tracker

A desktop time tracker for freelancers: a timer for your work, hourly rates per client and project, payments and debts per client, reports with CSV export, and optional sync between your computers through your own Google Drive. Runs on macOS (Intel and Apple silicon) and Windows. Made by **White Eagles & Co. s.r.o.**

App page: 🔗 **[jaffarsk24.github.io/WE-Time-Tracker](https://jaffarsk24.github.io/WE-Time-Tracker/)** · Privacy policy: 🔗 **[privacy](https://jaffarsk24.github.io/WE-Time-Tracker/privacy.html)** · Website: 🔗 **[whiteeagles.sk](https://whiteeagles.sk/)**

---

## ✨ What the app does

### ⏱️ Timer
* Start a timer with a task description, a client and, if you like, a project. Pause and resume it as often as needed: paused time is not counted.
* Mark whether the work is to be paid for (**Requires Payment**) or done for free.
* Add work done away from the computer as a **manual entry** with its start and end time.
* Today's entries are listed under the timer.
* The running time is shown in the **menu bar** on macOS and in the tray icon tooltip on Windows. The timer can be stopped from there without opening the window.

### 📊 Dashboard
* Total hours, total earnings, number of projects and clients.
* Time by project and by client, and activity in hours for a chosen period: from the last 7 days to the last 12 months, the current or the last year.

### 👥 Clients and projects
* An hourly rate in EUR for each client, and an optional rate of its own for a project (0 takes the client's rate).
* Each entry keeps the rate it was made with, so changing a rate later does not rewrite past earnings.
* Amounts are counted to the minute: the duration is rounded to the nearest minute, with one minute as the least for any started entry.

### 💶 Payments and balance
* Each client has a ledger of payments. The balance shows what was billed, what was received and whether the client owes you (**Debt**) or has paid ahead (**Advance**).
* Marking entries as **Paid** records a matching payment for the part of the debt they cover. Unmarking or deleting the entries takes it back, so a manual payment plus a mark never leaves a phantom advance.

### 📋 Reports and logs
* Filter entries by client, project, payment status (awaiting payment, paid, non-billable) and period.
* Hours and total amount for the filtered entries.
* Edit any entry, mark several as paid or delete them at once. A deletion can be undone from the notice that follows it.
* Export to **CSV** (opens in Excel or Numbers) or **JSON**.

### ⚙️ Settings
* Interface in **English** or **Russian**, **dark** or **light** theme.
* Export all data to one JSON file, import it back, or reset everything.
* Google Drive sync and app updates (see below).

---

## 🚀 Installation

Download the latest version from **[Releases](https://github.com/JaffarSk24/WE-Time-Tracker/releases/latest)**.

### macOS (10.15 or newer, Intel and Apple silicon)
1. Download **`WE-Time-Tracker-<version>-mac-universal.dmg`**. One image serves every Mac and runs natively on both Intel and M-series processors.
2. Open it and drag **WE Time Tracker** into **Applications**.
3. Open Terminal and run this command once:
   ```bash
   xattr -cr "/Applications/WE Time Tracker.app"
   ```
   The app is not notarised by Apple (that needs a paid Apple Developer ID), and macOS refuses to open such an app when it was downloaded with a browser, usually saying the app "is damaged". The app is intact: the command only removes the download mark, nothing else. Without Terminal, the same is done in System Settings, Privacy & Security: find the message about WE Time Tracker being blocked and choose **Open Anyway**.

### Windows (10 or newer, 64-bit)
1. Download **`WE-Time-Tracker-<version>-win-x64.exe`** and run it.
2. SmartScreen will warn about an unknown publisher, because the installer is not signed with a paid certificate. Choose **More info**, then **Run anyway**.
3. The app installs for your user account in one step, without asking for an administrator password, and adds shortcuts to the desktop and the Start menu.

---

## 🔄 Updates

The app checks for a new version on start and every few hours. When one is out, a banner appears at the top of the window:

1. **Update** downloads the new version with a progress bar. **What is new** shows the release notes, **Later** hides the banner until the next version.
2. The download is checked against the checksums published with the release.
3. **Restart and update** closes the app, puts the new version in place of the old one and opens the app again. Your data stays where it is, and unsaved changes reach Google Drive before the app closes.

Nothing has to be dragged and no Terminal command is needed: the download mark is only set by browsers, and the app downloads the update itself. On Windows the setup runs silently after the app closes. A Mac with Apple silicon that runs the Intel build moves to the native build with its next update.

If the app sits in a folder it cannot write to (an `/Applications` owned by an administrator), the disk image opens instead, and the app is dragged into Applications as on first install.

Updates are also checked and installed in **Settings, App Update**.

**Coming from 1.8.x?** These versions do not install updates by themselves yet, so the update to 1.9 goes the old way once: on macOS the disk image opens and the app is dragged into Applications, on Windows the setup runs when the app closes. Every update after that installs in place.

---

## 💾 Your data

* Everything is kept in one file on your computer:
  * macOS: `~/Library/Application Support/we-time-tracker/we-tracker-data.json`
  * Windows: `%APPDATA%\we-time-tracker\we-tracker-data.json`
* Once a day, before the first change, the app keeps a copy of that file in the `backups` folder next to it. The last 14 copies are kept.
* The app works fully offline. It goes online only to sync with Google Drive (if you sign in) and to check GitHub for updates.
* Settings, Export Data (JSON) gives you a complete copy you can store anywhere and import later.

## ☁️ Google Drive sync

Sync is optional. Sign in with Google from the banner on first start or from Settings. Your data is stored as one file in a hidden app folder of your own Drive, which only this app can open, and is read back on your other computers. Before downloading a newer copy from the cloud, the app saves the local one to the backups folder.

The app asks for two permissions: access to its own hidden Drive folder (`drive.appdata`) and your email address, shown so you know which account is connected. Tick the Drive permission on the Google consent page, or sync cannot work. Nothing passes through a server of ours. What is stored where, and how to delete it, is described in the [privacy policy](https://jaffarsk24.github.io/WE-Time-Tracker/privacy.html).

If Google stops accepting the sign-in, an amber banner says that sync has stopped and why. Until you sign in again, changes are kept on this computer only.

### Moving from a version before 1.8.0 with several computers

Version 1.8.0 signs in through a new Google client, and every Google client gets its own hidden Drive folder. The cloud therefore starts out empty, and every computer has to sign in again.

1. Before updating, sync every computer on the old version, so they all hold the same data.
2. Update and sign in first on the computer whose data is the most recent. It uploads that data to the new folder.
3. Update the remaining computers and sign in there.

If a computer finds data already in the new folder and has work of its own, nothing is overwritten: the app asks whether to keep this computer's copy or take the one from the cloud.

---

## 🛠️ Development

### Stack
* Plain JavaScript (ES modules), HTML and CSS custom properties, built with **Vite**. Charts by Chart.js, icons by Lucide, fonts bundled locally: no CDN, the app runs offline.
* **Electron** desktop shell. The built interface is served through a custom `app://` protocol, and the data file is read and written by the main process through the preload bridge (`preload.cjs`).
* `gdrive-sync.cjs`: Google sign-in (PKCE with a loopback redirect) and Drive sync. `updater.cjs`: the in-app updater.
* Tests with Vitest, linting with ESLint.

### Running from source
Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/JaffarSk24/WE-Time-Tracker.git
cd WE-Time-Tracker
npm install
```

* `npm run dev` runs the interface in a browser at http://localhost:3000 (data stays in that browser's storage).
* `npm run electron:dev` runs the desktop app with hot reload.
* `npm test` and `npm run lint` must pass before a commit.

Google Drive sync needs the app's OAuth client in `oauth-credentials.json` at the project root. The file is not in the repository; without it the app builds and runs, and the sync section stays hidden.

### Building and releasing
* `npm run electron:pack` builds a runnable app in `release/` without installers.
* `npm run electron:dist` builds the Mac release: `WE-Time-Tracker-<version>-mac-universal.dmg`, a zip per architecture (`-mac-x64.zip`, `-mac-arm64.zip`) and `latest-mac.yml` with their checksums.
* `npm run electron:dist:win` builds the Windows setup `WE-Time-Tracker-<version>-win-x64.exe` and `latest.yml`. It runs on macOS too: electron-builder fetches Wine by itself.
* `npm run verify:package` checks that every packaged build contains all the files the app needs to start. Run it after each build, and launch the built app (not `electron .`) before publishing.

A release must carry all of these files, including the `.blockmap` files and both `.yml` files: the updater installs from the zip for the Mac's own processor and from the setup on Windows, and checks each download against the yml files. The version is set only in `package.json`.

On macOS the app is signed ad hoc after packaging (`scripts/adhoc-sign.cjs`). Build outside an iCloud-synced folder such as Desktop or Documents: iCloud adds file attributes to the app bundle, and code signing then fails with "resource fork, Finder information, or similar detritus not allowed". To run a build straight from `release/`, clear the download mark there: `xattr -cr "release/mac/WE Time Tracker.app"`.

---

## 📜 License & credits

This project is released under a free public license by **White Eagles & Co. s.r.o.**
Feel free to fork, customize, and use it for personal or team productivity.

*Need web application engineering, mobile app development, or marketing campaigns that convert?*
Let's fly higher together: 🔗 **[White Eagles & Co. s.r.o.](https://whiteeagles.sk/)**
