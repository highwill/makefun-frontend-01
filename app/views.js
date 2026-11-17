// The four surfaces, each a function from API data to HTML. Views are pure
// strings; the router drops them into #view and the countdown ticker updates
// only the [data-deadline] spans, so a tick never rebuilds the page.

import { date, entriesLabel, esc, feeLabel, money, msLeft, num, pot, takesEntries, timeLeft } from './format.js';

const PAGE_SIZE = 25;

// --- shared bits -----------------------------------------------------------

function statusBadge(b) {
  if (!takesEntries(b)) return '<span class="badge ended">Ended</span>';
  if (msLeft(b.deadline) < 48 * 3600000) return '<span class="badge soon">Closing soon</span>';
  return '<span class="badge open">Open</span>';
}

function bountyLinks(b) {
  return `<a class="btn" href="#/bounty/${encodeURIComponent(b.slug)}">Bounty</a>
    <a class="btn" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard</a>
    <a class="btn" href="https://make.fun${esc(b.url ?? `/bounty/${b.slug}`)}">On make.fun ↗</a>`;
}

// A little markdown for bounty descriptions and rules: headings, bullet
// lists and paragraphs. Everything is escaped first, so API text is inert.
export function md(text) {
  const lines = esc(text ?? '').split('\n');
  let out = '';
  let list = false;
  let para = [];
  const flushPara = () => {
    if (para.length) out += `<p>${para.join(' ')}</p>`;
    para = [];
  };
  const flushList = () => {
    if (list) out += '</ul>';
    list = false;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushPara();
      flushList();
      out += `<h3>${trimmed.slice(3)}</h3>`;
    } else if (trimmed.startsWith('- ')) {
      flushPara();
      if (!list) {
        out += '<ul>';
        list = true;
      }
      out += `<li>${trimmed.slice(2)}</li>`;
    } else if (trimmed === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(trimmed);
    }
  }
  flushPara();
  flushList();
  return out;
}

// Rewards map {place: amount} collapsed into ranges where the prize repeats:
// 1 → $100, 2 → $70, 3 → $50, 4–10 → $20, 11–20 → $14.
export function rewardsTable(rewards) {
  const places = Object.keys(rewards ?? {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!places.length) return '<p class="muted">No prize table published yet.</p>';
  const ranges = [];
  let start = places[0];
  let prev = places[0];
  for (const p of places.slice(1)) {
    if (p === prev + 1 && rewards[p] === rewards[prev]) {
      prev = p;
      continue;
    }
    ranges.push([start, prev, rewards[prev]]);
    start = prev = p;
  }
  ranges.push([start, prev, rewards[prev]]);
  const rows = ranges
    .map(
      ([a, b, amount]) =>
        `<tr><td>${a === b ? `#${a}` : `#${a}–${b}`}</td><td class="r">${money(amount)}</td></tr>`,
    )
    .join('');
  return `<table class="rewards"><thead><tr><th>Place</th><th class="r">Prize</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function metaTable(rows) {
  return `<dl class="meta">${rows
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('')}</dl>`;
}

// --- 1. the board ----------------------------------------------------------

export function boardShell() {
  return `<h1>Live bounties</h1>
  <p class="lede">Every open bounty on make.fun — its live pot, entry fee, time left
  and entries. Pots grow as entry fees are paid in.</p>
  <div class="toolbar" role="search">
    <input id="q" type="search" placeholder="Search bounties…" aria-label="Search bounties" autocomplete="off">
    <select id="filter" aria-label="Filter bounties">
      <option value="all">All bounties</option>
      <option value="open">Taking entries</option>
      <option value="soon">Closing within 48h</option>
      <option value="pot">Pot $500+</option>
    </select>
    <select id="sort" aria-label="Sort bounties">
      <option value="closing">Closing soonest</option>
      <option value="pot">Biggest pot</option>
      <option value="entries">Most entries</option>
      <option value="newest">Newest first</option>
    </select>
  </div>
  <p id="count" class="muted" aria-live="polite"></p>
  <div id="board-list"></div>`;
}

function boardCard(b) {
  const open = takesEntries(b);
  return `<article class="card">
    <div class="card-top"><span class="cat">${esc(b.category ?? 'Bounty')}</span>${statusBadge(b)}</div>
    <h2><a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h2>
    <p class="summary">${esc(b.summary ?? '')}</p>
    <div class="stats">
      <div><span class="label">Live pot</span><strong class="pot">${pot(b)}</strong></div>
      <div><span class="label">Entry fee</span><strong>${feeLabel(b)}</strong></div>
      <div><span class="label">Time left</span><strong data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</strong></div>
      <div><span class="label">Entries</span><strong>${num(b.submissionCount)}</strong></div>
    </div>
    <div class="card-links">${bountyLinks(b)}</div>
  </article>`;
}

export function applyBoardFilter(items, state) {
  const q = state.q.trim().toLowerCase();
  let list = items.filter((b) => {
    if (q && !(b.title + ' ' + (b.summary ?? '') + ' ' + (b.category ?? '')).toLowerCase().includes(q)) return false;
    if (state.filter === 'open' && !takesEntries(b)) return false;
    if (state.filter === 'soon' && !(takesEntries(b) && msLeft(b.deadline) < 48 * 3600000)) return false;
    if (state.filter === 'pot' && Number(b.potUsd ?? b.rewardAmount) < 500) return false;
    return true;
  });
  const key = {
    // Still taking entries first, soonest deadline first; ended bounties sink.
    closing: (b) => (takesEntries(b) ? 0 : 1) * 1e15 + new Date(b.deadline).getTime(),
    pot: (b) => -(b.potUsd ?? b.rewardAmount ?? 0),
    entries: (b) => -(b.submissionCount ?? 0),
    newest: (b) => -new Date(b.publishedAt ?? b.deadline).getTime(),
  }[state.sort];
  return list.sort((a, b) => key(a) - key(b));
}

export function boardListHtml(items, state) {
  const list = applyBoardFilter(items, state);
  const count = list.length === items.length
    ? `${items.length} bounties`
    : `${list.length} of ${items.length} bounties`;
  return { count, html: list.length
    ? `<div class="grid">${list.map(boardCard).join('')}</div>`
    : '<p class="empty">No bounties match. Clear the search or widen the filter.</p>' };
}

// --- 2. one bounty ---------------------------------------------------------

export function bountyPage(b) {
  const rules = typeof b.rules === 'string' ? b.rules : Array.isArray(b.rules) ? b.rules.join('\n- ') : '';
  const phases = (b.phases ?? [])
    .map(
      (p) =>
        `<li><strong>${esc(p.title ?? p.key)}</strong> — ${date(p.startsAt)} to ${date(p.endsAt)}${
          p.scoresVisible === false ? ' (scores hidden)' : ''
        }</li>`,
    )
    .join('');
  return `<p class="crumbs"><a href="#/">← All bounties</a></p>
  <div class="bounty-head">
    <div>
      <span class="cat">${esc(b.category ?? 'Bounty')}</span> ${statusBadge(b)}
      <h1>${esc(b.title)}</h1>
      <p class="lede">${esc(b.summary ?? '')}</p>
      <p>${(b.skills ?? []).map((s) => `<span class="chip">${esc(s)}</span>`).join(' ')}</p>
    </div>
    <aside class="pot-card">
      <span class="label">Live pot</span><strong class="pot big">${pot(b)}</strong>
      <span class="label">Entry fee</span><strong>${feeLabel(b)}</strong>
      <span class="label">Time left</span><strong data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</strong>
      <span class="label">Entries</span><strong>${entriesLabel(b.submissionCount)}</strong>
      ${bountyLinks(b)}
    </aside>
  </div>
  ${metaTable([
    ['Deadline', `${date(b.deadline)} (<span data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>)`],
    ['Opens', date(b.opensAt ?? b.publishedAt)],
    ['Status', esc(b.status)],
    ['Sponsor', esc(b.sponsor?.name ?? 'make.fun')],
    ['Category', esc(b.category ?? '—')],
  ])}
  <div class="two-col">
    <section><h2>Rewards</h2>${rewardsTable(b.rewards ?? b.rewardsNow)}
    <p class="muted">The pot is the prize plus every entry fee paid in so far.</p></section>
    <section><h2>Phases</h2>${phases ? `<ul>${phases}</ul>` : '<p class="muted">No phases published.</p>'}</section>
  </div>
  <section><h2>Description</h2><div class="prose">${md(b.description)}</div></section>
  ${rules ? `<section><h2>Rules</h2><div class="prose">${md(rules)}</div></section>` : ''}
  ${b.rulesNote ? `<p class="muted">${esc(b.rulesNote)}</p>` : ''}`;
}

// --- 3. a bounty's leaderboard ---------------------------------------------

export function leaderboardPage(board, page, view) {
  const columns = board.columns ?? [];
  const rankKey = board.rank_key ?? columns[0]?.key;
  const rows = [...(board.entries ?? []), ...(board.rest ?? [])];
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pages);
  const slice = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const views = (board.views ?? []).filter((v) => v !== 'cost' && v !== 'efficiency');
  const head = columns
    .map((c) => `<th class="${c.key === rankKey ? 'r' : ''}">${esc(c.title)}</th>`)
    .join('');
  const body = slice
    .map((row) => {
      const cells = columns
        .map((c) => {
          const shown = row.display?.[c.key] ?? row.values?.[c.key];
          return `<td class="${c.key === rankKey ? 'r strong' : ''}">${shown == null ? '—' : esc(shown)}</td>`;
        })
        .join('');
      const prize = row.prize_rank != null ? `<span class="prize" title="In a paid place">P${num(row.prize_rank)}</span>` : '';
      return `<tr>
        <td class="r strong">#${num(row.rank)}</td>
        <td><a href="#/account/${encodeURIComponent(row.handle)}">${esc(row.handle)}</a>${row.house ? ' <span class="chip">house</span>' : ''}${row.baseline ? ' <span class="chip">baseline</span>' : ''} ${prize}</td>
        <td class="title-cell">${esc(row.title ?? '')}</td>${cells}
      </tr>`;
    })
    .join('');
  return `<p class="crumbs"><a href="#/">← All bounties</a> · <a href="#/bounty/${encodeURIComponent(board.competition.slug)}">${esc(board.competition.title)}</a></p>
  <h1>Leaderboard — ${esc(board.competition.title)}</h1>
  <p class="lede">${esc(board.title ?? 'Results')} · ranked by ${esc(rankKey)}${board.phase ? ` · phase: ${esc(board.phase.title ?? board.phase.key)}` : ''}${
    board.phase?.placements_held ? ' · places unofficial until results publish' : ''
  }</p>
  ${views.length > 1 ? `<div class="tabs" role="tablist">${views.map((v) => `<a role="tab" aria-selected="${v === (view || board.view)}" class="${v === (view || board.view) ? 'on' : ''}" href="#/bounty/${encodeURIComponent(board.competition.slug)}/leaderboard?view=${v}">${esc(v)}</a>`).join('')}</div>` : ''}
  <p class="muted">Showing ${num((safePage - 1) * PAGE_SIZE + 1)}–${num(Math.min(safePage * PAGE_SIZE, total))} of ${num(total)} entries · page ${safePage} of ${pages}</p>
  <div class="table-wrap"><table class="leader">
    <thead><tr><th class="r">Rank</th><th>Account</th><th>Entry</th>${head}</tr></thead>
    <tbody>${body || '<tr><td colspan="99">No entries ranked yet.</td></tr>'}</tbody>
  </table></div>
  <nav class="pager" aria-label="Leaderboard pages">
    ${safePage > 1 ? `<a href="#/bounty/${encodeURIComponent(board.competition.slug)}/leaderboard?p=${safePage - 1}${view ? `&view=${view}` : ''}">← Prev</a>` : '<span class="off">← Prev</span>'}
    <span>Page ${safePage} / ${pages}</span>
    ${safePage < pages ? `<a href="#/bounty/${encodeURIComponent(board.competition.slug)}/leaderboard?p=${safePage + 1}${view ? `&view=${view}` : ''}">Next →</a>` : '<span class="off">Next →</span>'}
  </nav>
  <p class="muted">Tip: a handle links to that account's public profile, with its entries, ranks and prizes.</p>`;
}

// --- 4. an account's public profile ----------------------------------------

export function profilePage(profile, ranking) {
  const rec = profile.record ?? {};
  const solutions = profile.solutions ?? [];
  const rows = solutions
    .map((s) => {
      const c = s.competition ?? {};
      return `<tr>
        <td><a href="#/bounty/${encodeURIComponent(c.slug)}">${esc(c.title ?? c.slug)}</a></td>
        <td>${esc(c.status ?? '—')}</td>
        <td class="r">${s.placement != null ? `#${num(s.placement)}` : '—'}</td>
        <td class="r">${s.prize_usd != null ? money(s.prize_usd) : '—'}</td>
        <td class="r">${esc(s.score?.display ?? '—')}</td>
      </tr>`;
    })
    .join('');
  const links = [
    profile.github_login ? `<a href="https://github.com/${encodeURIComponent(profile.github_login)}">GitHub: ${esc(profile.github_login)}</a>` : '',
    profile.x?.username ? `<a href="${esc(profile.x.url ?? `https://x.com/${profile.x.username}`)}">X: @${esc(profile.x.username)}</a>` : '',
    profile.wallet?.explorer_url ? `<a href="${esc(profile.wallet.explorer_url)}">Wallet ↗</a>` : '',
  ].filter(Boolean).join(' · ');
  return `<p class="crumbs"><a href="#/">← All bounties</a></p>
  <div class="profile-head">
    ${profile.avatar || profile.image ? `<img class="avatar" crossorigin="anonymous" src="${esc(profile.avatar ?? profile.image)}" alt="">` : ''}
    <div>
      <h1>${esc(profile.display_name ?? profile.handle)}</h1>
      <p class="muted">@${esc(profile.handle)} · joined ${date(profile.joined_at)}${profile.house ? ' · house account' : ''}</p>
      ${profile.bio ? `<p>${esc(profile.bio)}</p>` : ''}
      ${links ? `<p>${links}</p>` : ''}
    </div>
  </div>
  <div class="stat-grid">
    <div><span class="label">Entered</span><strong>${num(rec.competitions_entered)}</strong></div>
    <div><span class="label">Placed</span><strong>${num(rec.competitions_placed)}</strong></div>
    <div><span class="label">Won</span><strong>${num(rec.competitions_won)}</strong></div>
    <div><span class="label">Prize money</span><strong>${money(rec.prize_usd ?? 0)}</strong></div>
    <div><span class="label">Best placement</span><strong>${rec.best_placement != null ? `#${num(rec.best_placement)}` : '—'}</strong></div>
    <div><span class="label">Site rank</span><strong>${ranking?.account?.rank != null ? `#${num(ranking.account.rank)} of ${num(ranking.total)}` : 'Unranked'}</strong></div>
  </div>
  <section><h2>Entries (${solutions.length})</h2>
  ${solutions.length
    ? `<div class="table-wrap"><table class="leader"><thead><tr><th>Bounty</th><th>Status</th><th class="r">Place</th><th class="r">Prize</th><th class="r">Score</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted">No public entries in published competitions yet.</p>'}
  </section>`;
}

// --- errors ------------------------------------------------------------------

export function errorPage(message, back) {
  return `<h1>Couldn’t load this page</h1>
  <p>${esc(message)}</p>
  <p class="muted">The make.fun API may be rebuilding its board — it usually answers again within seconds.</p>
  <p><a href="${back ?? '#/'}">← Back</a></p>`;
}

export function notFoundPage(what) {
  return `<h1>Not found</h1><p>${esc(what)} doesn’t exist on make.fun, or it moved.</p><p><a href="#/">← All bounties</a></p>`;
}
