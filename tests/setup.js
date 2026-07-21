// Vitest setup: store.js работает в браузерном окружении — даём минимальные
// заглушки localStorage/window для node-окружения тестов.
class LocalStorageMock {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new LocalStorageMock();
globalThis.window = globalThis.window || {};
