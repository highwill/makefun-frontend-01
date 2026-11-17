// Hash router: one route per surface, each reachable by link and by address.
// The board keeps its own search/filter/sort state, and toolbar edits repaint
// only the list — the shell, the toolbar and the scroll position stay put.

import { getBoard, getBounty, getLeaderboard, getProfile, getRanking } from './api.js';
import { timeLeft } from './format.js';
import {
  boardListHtml,
  boardShell,
  bountyPage,
  errorPage,
  leaderboardPage,
  notFoundPage,
  profilePage,
} from './views.js';

const view = document.getElementById('view');
const boardState = { q: '', filter: 'all', sort: 'closing' };
let boardItems = null;
let boardReady = false;

// Every 20 s, refresh only the countdown spans. No rebuild, no refetch.
function tickCountdowns() {
  for (const el of document.querySelectorAll('[data-deadline]')) {
    el.textContent = timeLeft(el.getAttribute('data-deadline'));
  }
}
setInterval(tickCountdowns, 20000);

function paintBoardList() {
  if (!boardItems) return;
  const list = document.getElementById('board-list');
  const count = document.getElementById('count');
  if (!list) return;
  const out = boardListHtml(boardItems, boardState);
  list.innerHTML = out.html;
  if (count) count.textContent = out.count;
  tickCountdowns();
}

function wireBoardToolbar() {
  const q = document.getElementById('q');
  const filter = document.getElementById('filter');
  const sort = document.getElementById('sort');
  if (!q) return;
  q.value = boardState.q;
  filter.value = boardState.filter;
  sort.value = boardState.sort;
  q.addEventListener('input', () => {
    boardState.q = q.value;
    paintBoardList();
  });
  filter.addEventListener('change', () => {
    boardState.filter = filter.value;
    paintBoardList();
  });
  sort.addEventListener('change', () => {
    boardState.sort = sort.value;
    paintBoardList();
  });
}

async function showBoard() {
  document.title = 'Live bounties | make.fun';
  if (boardReady) {
    view.innerHTML = boardShell();
    wireBoardToolbar();
    paintBoardList();
    window.__shotReady = true;
    return;
  }
  view.innerHTML = boardShell();
  wireBoardToolbar();
  document.getElementById('board-list').innerHTML = '<p class="loading">Loading live bounties…</p>';
  try {
    const data = await getBoard();
    boardItems = data.items ?? [];
    boardReady = true;
    paintBoardList();
  } catch (err) {
    document.getElementById('board-list').innerHTML = errorPage(`The board didn’t load: ${err.message}`, '#/');
  }
  window.__shotReady = true;
}

async function showBounty(slug) {
  document.title = `${slug} | make.fun`;
  try {
    const b = await getBounty(slug);
    document.title = `${b.title} | make.fun`;
    view.innerHTML = bountyPage(b);
  } catch (err) {
    view.innerHTML = err.status === 404 ? notFoundPage(`Bounty “${slug}”`) : errorPage(err.message, '#/');
  }
  tickCountdowns();
  window.__shotReady = true;
}

async function showLeaderboard(slug, page, viewName) {
  document.title = `Leaderboard — ${slug} | make.fun`;
  try {
    const board = await getLeaderboard(slug, viewName);
    document.title = `Leaderboard — ${board.competition.title} | make.fun`;
    view.innerHTML = leaderboardPage(board, page, viewName);
  } catch (err) {
    view.innerHTML = err.status === 404 ? notFoundPage(`Leaderboard for “${slug}”`) : errorPage(err.message, `#/bounty/${slug}`);
  }
  window.__shotReady = true;
}

async function showAccount(handle) {
  document.title = `@${handle} | make.fun`;
  try {
    const [profile, ranking] = await Promise.all([getProfile(handle), getRanking(handle)]);
    document.title = `${profile.display_name ?? profile.handle} | make.fun`;
    view.innerHTML = profilePage(profile, ranking);
  } catch (err) {
    view.innerHTML = err.status === 404 ? notFoundPage(`Account “${handle}”`) : errorPage(err.message, '#/');
  }
  window.__shotReady = true;
}

// Routes:
//   #/                              board
//   #/bounty/<slug>                 one bounty
//   #/bounty/<slug>/leaderboard     its leaderboard (?p=2&view=overall)
//   #/account/<handle>              a public profile
export function route() {
  window.__shotReady = false;
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (parts.length === 0) return showBoard();
  if (parts[0] === 'bounty' && parts[1] && parts.length === 2) return showBounty(parts[1]);
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') {
    return showLeaderboard(parts[1], Number(params.get('p')) || 1, params.get('view'));
  }
  if (parts[0] === 'account' && parts[1]) return showAccount(parts[1]);
  view.innerHTML = notFoundPage(`Page “${path}”`);
  window.__shotReady = true;
  return Promise.resolve();
}
