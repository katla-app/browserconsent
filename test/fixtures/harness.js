// Shared helpers for fixture pages. Results are read by test/e2e.mjs from the page world.
window.__results = [];
window.record = (what) => window.__results.push(what);
window.hide = (selector) => document.querySelector(selector)?.remove();
