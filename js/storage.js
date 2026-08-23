/**
 * QRStorage — QR history persisted to localStorage. Each entry is a small
 * snapshot (type, form values, style options, a thumbnail) so it can be
 * fully restored into the editor later.
 */
const QRStorage = (() => {
  'use strict';

  const KEY = 'qrcodejs.history.v1';
  const MAX_ENTRIES = 40;

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
    } catch {
      // Storage full or unavailable (private mode) — fail silently, it's non-critical.
    }
  }

  function add(entry) {
    const list = readAll();
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      ...entry,
    };
    list.unshift(record);
    writeAll(list);
    return record;
  }

  function remove(id) {
    writeAll(readAll().filter((e) => e.id !== id));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  return { readAll, add, remove, clear };
})();
