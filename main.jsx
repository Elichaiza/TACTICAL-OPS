import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './military-system-v2.jsx';
import seedData from './seed-data.json';

/* ── Storage polyfill: localStorage fallback when window.storage is absent ── */
if (!window.storage) {
  window.storage = {
    async get(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw !== null ? { value: raw } : null;
      } catch { return null; }
    },
    async set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch { /* quota exceeded -- ignore */ }
    }
  };
}

/* ── Seed data: loads from seed-data.json on first run or re-seeds on version bump ── */
const SEED_VERSION = "2";
if (localStorage.getItem("tac:seed_version") !== SEED_VERSION) {
  localStorage.setItem("tac:deployments", JSON.stringify(seedData.deployments));
  localStorage.setItem("tac:users", JSON.stringify(seedData.users));
  localStorage.setItem("tac:seed_version", SEED_VERSION);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
