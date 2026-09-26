// Pure logic shared by the background worker and popup. No chrome.* calls here,
// so everything in this file can be unit-tested with Node.

export const CONDITIONS = {
  changed: 'Value changes',
  above: 'Number goes above',
  below: 'Number goes below',
  contains: 'Text appears',
};

/**
 * Extract the first number from text. Handles common price formats:
 * "$1,299.00" -> 1299, "Rp 1.250.000" -> 1250000, "1.299,50 €" -> 1299.5
 */
export function parseNumber(text) {
  if (text === null || text === undefined) return null;
  const match = String(text).replace(/\s/g, '').match(/-?\d[\d.,]*/);
  if (!match) return null;

  let s = match[0].replace(/[.,]$/, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Both separators: whichever comes last is the decimal separator
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('');
  } else if (lastDot > -1) {
    const parts = s.split('.');
    // "1.250.000" or "1.250" (3 digits after the dot) = thousands separator
    if (parts.length > 2 || parts[1].length === 3) s = parts.join('');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isSatisfied(condition, threshold, value) {
  if (value === null || value === undefined) return false;
  if (condition === 'above' || condition === 'below') {
    const n = parseNumber(value);
    const t = Number(threshold);
    if (n === null || !Number.isFinite(t)) return false;
    return condition === 'above' ? n > t : n < t;
  }
  if (condition === 'contains') {
    return String(value).toLowerCase().includes(String(threshold ?? '').toLowerCase());
  }
  return false;
}

/**
 * Decide whether a new reading should trigger an alert.
 * Threshold conditions only fire when the value *crosses* the threshold,
 * so the user is not spammed on every check while it stays above/below.
 */
export function evaluate(watcher, previousValue, newValue) {
  if (newValue === null || newValue === undefined) return { triggered: false };
  const { condition, threshold } = watcher;

  if (condition === 'changed') {
    const triggered = previousValue !== null && previousValue !== undefined && newValue !== previousValue;
    return { triggered, reason: triggered ? 'changed' : null };
  }

  const nowOk = isSatisfied(condition, threshold, newValue);
  const wasOk = isSatisfied(condition, threshold, previousValue);
  const triggered = nowOk && !wasOk;
  return { triggered, reason: triggered ? condition : null };
}

export function describeCondition(watcher) {
  const { condition, threshold } = watcher;
  if (condition === 'above') return `above ${threshold}`;
  if (condition === 'below') return `below ${threshold}`;
  if (condition === 'contains') return `contains "${threshold}"`;
  return 'any change';
}

export function formatAlert(watcher, previousValue, newValue) {
  const title = `🔔 ${watcher.label}`;
  let body;
  if (watcher.condition === 'changed') {
    body = `Changed: ${previousValue ?? '—'} → ${newValue}`;
  } else {
    body = `Now ${newValue} (rule: ${describeCondition(watcher)})`;
    if (previousValue !== null && previousValue !== undefined) body += `\nBefore: ${previousValue}`;
  }
  return { title, body };
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function sameUrl(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    ua.hash = '';
    ub.hash = '';
    return ua.href === ub.href;
  } catch {
    return a === b;
  }
}

export function timeAgo(timestamp, now = Date.now()) {
  if (!timestamp) return 'never';
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
