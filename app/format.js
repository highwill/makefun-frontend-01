// Small presenters for API values: money, dates, countdowns, safe text.

// Text made safe to put inside HTML.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// A dollar amount ('1000.00', 0.5, '12.00') as '$1,000' or '$0.50'.
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
}

// A whole number with thousands separators; '—' when unknown.
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
}

// A deadline as a short UTC date, e.g. 'Nov 24, 2026, 5:00 PM UTC'.
export function date(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`;
}

// Milliseconds until a deadline; negative once it has passed.
export function msLeft(iso) {
  return new Date(iso).getTime() - Date.now();
}

// '2d 4h left', '3h 12m left', '9m left', 'ends in 40s', or 'ended'.
export function timeLeft(iso) {
  const ms = msLeft(iso);
  if (ms <= 0) return 'ended';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return `ends in ${seconds}s`;
}

// The reward as it stands now: the live pot (prizes + entry fees paid in).
export function pot(b) {
  return money(b.potUsd ?? b.rewardUsd ?? b.rewardAmount);
}

// 'Free entry' or the fee, e.g. '$0.50 entry fee'.
export function feeLabel(b) {
  const fee = Number(b.entryFeeUsd);
  return fee > 0 ? `${money(fee)} entry fee` : 'Free entry';
}

// Whether a bounty still takes entries: its deadline decides, not its status —
// a bounty past its deadline can still read 'open' until results publish.
export function takesEntries(b) {
  return msLeft(b.deadline) > 0 && b.status !== 'closed';
}

// '1 entry' / '13,092 entries'.
export function entriesLabel(n) {
  return `${num(n)} ${Number(n) === 1 ? 'entry' : 'entries'}`;
}
