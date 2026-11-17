// Boot: warm the board cache, render the route in the hash, re-render on
// hash changes. window.__shotReady is false while a route loads and true once
// its data is on screen, so a screenshot script knows when to capture.

import { warmBoard } from './api.js';
import { route } from './router.js';

window.__shotReady = false;

warmBoard();
window.addEventListener('hashchange', () => {
  route().catch((err) => {
    document.getElementById('view').innerHTML =
      `<h1>Something went wrong</h1><p>${err.message}</p><p><a href="#/">← All bounties</a></p>`;
    window.__shotReady = true;
  });
});
route();
