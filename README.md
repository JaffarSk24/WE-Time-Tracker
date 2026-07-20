# 🦅 WE Time Tracker

An elite, local-first time tracking and financial analytics dashboard engineered for high-performance freelancers. Designed and packaged as a native desktop application for macOS and web platforms by **White Eagles & Co. s.r.o.**

Official Website: 🔗 **[whiteeagles.sk](https://whiteeagles.sk/)**

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
2. Download the latest **`WE Time Tracker-1.0.0.dmg`** or **`WE Time Tracker-1.0.0-mac.zip`**.
3. Open/mount the downloaded file, drag **WE Time Tracker** to your **Applications** folder.
4. Open Terminal and run the following command to bypass the Gatekeeper security check for instant startup (avoiding the dock-bouncing delay):
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
   Compiles the app into a runnable macOS binary directory located in `dist/mac/WE Time Tracker.app`.

3. **Installer Distribution (`.dmg` and `.zip` bundle):**
   ```bash
   npm run electron:dist
   ```
   Packages the application into a mountable disk image (`dist/WE Time Tracker-1.0.0.dmg`) and a zip file (`dist/WE Time Tracker-1.0.0-mac.zip`) with the custom White Eagles logo embedded as the application icon.


### ⚠️ Note on macOS Gatekeeper (First Launch Delay)
Since local builds are packaged without a paid Apple Developer certificate, macOS Gatekeeper may run an extensive background verification check on the unsigned `.app` bundle during the very first launch. This can cause the application icon to bounce in the Dock for up to a minute before starting.

To bypass this check and ensure the application launches instantly:
1. Open your terminal.
2. Run the following command to remove the macOS quarantine flag:
   ```bash
   xattr -cr "dist/mac/WE Time Tracker.app"
   ```
   *(Or if you moved it to your Applications folder: `xattr -cr "/Applications/WE Time Tracker.app"`)*

---


## 📜 License & Agency Credits

This project is released under a free public license by **White Eagles & Co. s.r.o.**
Feel free to fork, customize, and deploy this workspace locally for personal or team productivity.

*Need premium web application engineering, mobile app development, or high-converting marketing campaigns?*  
Let's fly higher together: 🔗 **[White Eagles & Co. s.r.o.](https://whiteeagles.sk/)**
