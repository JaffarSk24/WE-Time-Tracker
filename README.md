# 🦅 WE Time Tracker

An elite, local-first time tracking and financial analytics dashboard engineered for high-performance freelancers. Designed and packaged as a native desktop application for macOS and web platforms by **White Eagles & Co. s.r.o.**

App page: 🔗 **[jaffarsk24.github.io/WE-Time-Tracker](https://jaffarsk24.github.io/WE-Time-Tracker/)** · Privacy policy: 🔗 **[privacy](https://jaffarsk24.github.io/WE-Time-Tracker/privacy.html)**
Official Website: 🔗 **[whiteeagles.sk](https://whiteeagles.sk/)**

---

## ☁️ Google Drive Sync

Sync is optional. Signing in with Google stores one file with your data in a hidden app folder of your own Drive, which only this app can open, and reads it back on your other computers. The app asks for two permissions: access to its own hidden Drive folder (`drive.appdata`) and your account email address, shown so you know which account is connected. Nothing passes through a server of ours. What is stored where, and how to delete it, is written in the [privacy policy](https://jaffarsk24.github.io/WE-Time-Tracker/privacy.html).

### Updating to version 1.8.0 when you sync across several computers

Version 1.8.0 signs in through a new Google client, and every Google client gets its own hidden Drive folder. The cloud therefore starts out empty, and the sign-in on every computer has to be made again.

1. Before updating, sync every computer on the old version, so they all hold the same data.
2. Update and sign in first on the computer whose data is the most recent. It uploads that data to the new folder.
3. Update the remaining computers and sign in there.

If a computer finds data already in the new folder and has unsaved work of its own, the app does not overwrite anything: it asks whether to keep this computer's copy or take the one from the cloud.

---

## 🎯 Executive Summary & Design Philosophy

**WE Time Tracker** was built to solve the compromises of subscription-based time-tracking platforms. It is designed to be local-first, keeping your client billing data, hourly logs, and settings strictly stored on your own hardware without any external dependencies.

### 🎨 Visual & UX Highlights
* **Dual-Theme Design System:** A tailor-made aesthetic with a gorgeous **Dark Space Mode** (featuring glassmorphism, HSL-harmonized gradient borders, and ambient glow) and a crisp, high-contrast **Light Paper Mode** for daylight productivity.
* **Responsive Grid Interface:** Standardized to support both wide desktop layouts and mobile viewports. Manual time logs and timer widgets adjust dynamically to maximize screen utilization.
* **Dynamic Chart Synchronization:** Time distribution and weekly productivity charts (powered by Chart.js) adapt automatically to theme selection, updating labels, grids, and background fills on the fly.
* **Localization Out-of-the-Box:** Complete English and Russian support across the entire interface.

---

## 🛠️ Technical Architecture

The codebase represents a modern, lightweight SPA built with speed and long-term maintainability in mind:
* **Core Tech:** Pure Vanilla ES Modules, CSS Custom Properties, and HTML5 Semantic markup. Built and hot-reloaded using **Vite**.
* **State Management:** A custom Pub/Sub reactive store (`src/store.js`) implementing CRUD operations, automated historical billing snapshots, and localized `localStorage` syncing.
* **Historical Rate Preservation:** Logged records freeze the exact hourly rate (in EUR) active at the time of entry. Future rate changes do not affect past earnings history.
* **Electron Packaging Pipeline:** Built-in Desktop packaging via **Electron** and **electron-builder**. Resolves standard ES Module `file://` protocol CORS limitations by serving built assets through a lightweight, zero-dependency local HTTP server during production runtimes.
* **Reliable Data Portability:** Physical backup engine allows downloading the entire state as a single JSON file or restoring it in one click, shielding users from sync lockups.

---

## 🚀 Download & Installation

### ⬇️ Option A: Download Compiled Desktop Application (Recommended)
You do not need node.js or a terminal setup to run the application on macOS.
1. Navigate to the **[Releases](https://github.com/JaffarSk24/WE-Time-Tracker/releases)** section of this repository.
2. Download the latest **`WE Time Tracker-<version>.dmg`** or **`WE Time Tracker-<version>-mac.zip`**.
3. Open/mount the downloaded file, drag **WE Time Tracker** to your **Applications** folder.
4. Open Terminal and run the command below once. A `.dmg` fetched with a browser arrives carrying macOS's quarantine flag, and without a paid Apple notarisation Gatekeeper refuses to open what it marks, usually saying the app is damaged. The command clears that flag and nothing else:
   ```bash
   xattr -cr "/Applications/WE Time Tracker.app"
   ```

### 🛠️ Option B: Developer Setup (Running & Packaging from Source)

#### Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18.0.0 or higher recommended).

#### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/JaffarSk24/WE-Time-Tracker.git
   cd WE-Time-Tracker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

* **Web Mode (Vite Development Server):**
  ```bash
  npm run dev
  ```
  Runs the web app on [http://localhost:3000](http://localhost:3000) with hot-module replacement.

* **Desktop Mode (Electron Dev Environment):**
  ```bash
  npm run electron:dev
  ```
  Launches the application inside a native macOS borderless frame.

---

## 📦 Packaging and Distribution (macOS Desktop App)

You can compile a standalone, native macOS application with custom brand assets in three ways:

1. **Local Package Run:**
   ```bash
   npm run electron:prod
   ```
   Builds the assets and runs the production version locally in an Electron shell.

2. **Quick Compile (`.app` directory):**
   ```bash
   npm run electron:pack
   ```
   Compiles the app into a runnable macOS binary directory located in `release/mac/WE Time Tracker.app`.

3. **Installer Distribution (`.dmg` and `.zip` bundle):**
   ```bash
   npm run electron:dist
   ```
   Packages the application into a universal disk image that runs natively on Intel and Apple silicon (`release/WE-Time-Tracker-<version>-mac-universal.dmg`), a zip per architecture (`release/WE-Time-Tracker-<version>-mac-x64.zip` and `-mac-arm64.zip`) and `release/latest-mac.yml` with their checksums, with the custom White Eagles logo embedded as the application icon. The Windows setup is built with `npm run electron:dist:win` (`release/WE-Time-Tracker-<version>-win-x64.exe` and `release/latest.yml`). A release needs all of these files: the in-app updater installs from the zip for the Mac's own CPU and from the setup on Windows, and checks each download against the yml files.


### ⚠️ Note on macOS Gatekeeper

There is no paid Apple Developer ID for this project, so the app cannot be notarised and is only ad-hoc signed. Gatekeeper treats that as unsigned. On its own that is harmless, but macOS marks anything a browser downloads with a quarantine flag, and for a file carrying that flag Gatekeeper refuses to open an app it cannot verify, normally with a message claiming the app is damaged. The app is intact; the flag is what is being refused.

Clearing the flag takes one command, which changes nothing beyond that folder:

```bash
xattr -cr "/Applications/WE Time Tracker.app"
```

Running a build straight from `release/`? Point it there instead: `xattr -cr "release/mac/WE Time Tracker.app"`.

Without a terminal, the same thing is done in System Settings, Privacy & Security: scroll to the message about WE Time Tracker being blocked and choose Open Anyway. On recent macOS versions, right-clicking the app and choosing Open no longer works for unsigned apps.

**Updates installed from inside the app do not need any of this.** When a new version is out, a banner offers to download it; once it is downloaded, Install and restart quits the app, puts the new version in place of the old one and starts it again, with no disk image to open and nothing to drag. The quarantine flag is set by the program doing the downloading, and browsers are what set it; the in-app updater writes the file itself, so the new version is never flagged. On Windows the same button runs the setup silently after the app closes. If the app's folder is not writable (an `/Applications` owned by an administrator), the updater opens the disk image instead and the app is dragged across as on first install.

---


## 📜 License & Agency Credits

This project is released under a free public license by **White Eagles & Co. s.r.o.**
Feel free to fork, customize, and deploy this workspace locally for personal or team productivity.

*Need premium web application engineering, mobile app development, or high-converting marketing campaigns?*  
Let's fly higher together: 🔗 **[White Eagles & Co. s.r.o.](https://whiteeagles.sk/)**
