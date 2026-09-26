// Service worker: schedules checks, reads values, sends alerts.
// It is the only place that writes the watcher list, so updates never collide.
import { evaluate, formatAlert, escapeHtml, sameUrl } from './lib/core.js';

const ALARM_PREFIX = 'watch:';
const MAX_HISTORY = 20;
const DEFAULT_SETTINGS = { telegramToken: '', telegramChatId: '', desktopNotifications: true };

// ---------- storage (serialized so parallel checks don't overwrite each other) ----------

let lock = Promise.resolve();
function withLock(fn) {
  const run = lock.then(fn);
  lock = run.catch(() => {});
  return run;
}

async function getWatchers() {
  const { watchers = [] } = await chrome.storage.local.get('watchers');
  return watchers;
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

function updateWatchers(mutate) {
  return withLock(async () => {
    const watchers = await getWatchers();
    const result = mutate(watchers);
    await chrome.storage.local.set({ watchers });
    return result;
  });
}

// ---------- alarms ----------

async function syncAlarms() {
  const watchers = await getWatchers();
  const alarms = await chrome.alarms.getAll();
  const wanted = new Map(watchers.filter((w) => w.enabled).map((w) => [ALARM_PREFIX + w.id, w]));

  for (const alarm of alarms) {
    const w = wanted.get(alarm.name);
    if (alarm.name.startsWith(ALARM_PREFIX) && (!w || alarm.periodInMinutes !== w.interval)) {
      await chrome.alarms.clear(alarm.name);
    }
  }
  const existing = new Set((await chrome.alarms.getAll()).map((a) => a.name));
  for (const [name, w] of wanted) {
    if (!existing.has(name)) {
      chrome.alarms.create(name, { delayInMinutes: w.interval, periodInMinutes: w.interval });
    }
  }
}

chrome.runtime.onInstalled.addListener(syncAlarms);
chrome.runtime.onStartup.addListener(syncAlarms);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) checkWatcher(alarm.name.slice(ALARM_PREFIX.length));
});

// ---------- reading values ----------

// 1) If the page is open in a tab, read the live DOM (works for JavaScript-rendered pages).
async function readFromOpenTab(watcher) {
  const tabs = await chrome.tabs.query({});
  const tab = tabs.find((t) => t.url && sameUrl(t.url, watcher.url) && !t.discarded);
  if (!tab) return undefined;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (selector) => {
        const el = document.querySelector(selector);
        return el ? el.innerText.trim().slice(0, 500) : null;
      },
      args: [watcher.selector],
    });
    return result;
  } catch {
    return undefined; // tab not scriptable right now, fall back to fetch
  }
}

// 2) Otherwise fetch the page and parse it in an offscreen document (service workers have no DOM).
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse fetched HTML to read the watched element',
    });
  } catch (err) {
    if (!String(err).includes('single offscreen')) throw err;
  }
}

async function readByFetching(watcher) {
  const response = await fetch(watcher.url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'EXTRACT', html, selector: watcher.selector });
}

async function readValue(watcher) {
  const live = await readFromOpenTab(watcher);
  if (live !== undefined) return live;
  return readByFetching(watcher);
}

// ---------- alerts ----------

async function sendTelegram(settings, text) {
  const url = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: settings.telegramChatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram error ${response.status}`);
}

async function notify(watcher, previousValue, newValue) {
  const settings = await getSettings();
  const { title, body } = formatAlert(watcher, previousValue, newValue);
  const jobs = [];

  if (settings.desktopNotifications) {
    jobs.push(chrome.notifications.create(`pw:${watcher.id}:${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message: body,
      priority: 2,
    }));
  }
  if (settings.telegramToken && settings.telegramChatId) {
    const text = `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}\n\n<a href="${escapeHtml(watcher.url)}">Open page</a>`;
    jobs.push(sendTelegram(settings, text));
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.find((r) => r.status === 'rejected');
  return failed ? failed.reason.message : null;
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const [, id] = notificationId.split(':');
  const watcher = (await getWatchers()).find((w) => w.id === id);
  if (watcher) chrome.tabs.create({ url: watcher.url });
  chrome.notifications.clear(notificationId);
});

// ---------- the check ----------

async function checkWatcher(id, { force = false } = {}) {
  const watcher = (await getWatchers()).find((w) => w.id === id);
  if (!watcher || (!watcher.enabled && !force)) return null;

  let value = null;
  let error = null;
  try {
    value = await readValue(watcher);
    if (value === null || value === undefined) error = 'Element not found on the page';
  } catch (err) {
    error = err.message || String(err);
  }

  const previous = watcher.lastValue;
  const { triggered } = evaluate(watcher, previous, value);
  let alertError = null;
  if (triggered) alertError = await notify(watcher, previous, value);

  return updateWatchers((watchers) => {
    const w = watchers.find((x) => x.id === id);
    if (!w) return null;
    w.lastChecked = Date.now();
    w.error = error || (alertError ? `Alert failed: ${alertError}` : null);
    if (value !== null && value !== undefined) {
      if (value !== w.lastValue) {
        w.history = [{ value, at: Date.now(), alert: triggered }, ...(w.history || [])].slice(0, MAX_HISTORY);
      }
      w.lastValue = value;
    }
    if (triggered) w.lastAlert = Date.now();
    return w;
  });
}

// ---------- messages from popup, options page and picker ----------

const handlers = {
  async ADD_WATCHER({ watcher }) {
    const w = {
      id: crypto.randomUUID().slice(0, 8),
      enabled: true,
      createdAt: Date.now(),
      lastChecked: Date.now(),
      history: watcher.lastValue ? [{ value: watcher.lastValue, at: Date.now(), alert: false }] : [],
      error: null,
      ...watcher,
      interval: Number(watcher.interval) || 5,
    };
    await updateWatchers((list) => list.push(w));
    await syncAlarms();
    return w;
  },
  async DELETE_WATCHER({ id }) {
    await updateWatchers((list) => {
      const i = list.findIndex((w) => w.id === id);
      if (i > -1) list.splice(i, 1);
    });
    await syncAlarms();
  },
  async TOGGLE_WATCHER({ id }) {
    await updateWatchers((list) => {
      const w = list.find((x) => x.id === id);
      if (w) w.enabled = !w.enabled;
    });
    await syncAlarms();
  },
  CHECK_NOW({ id }) {
    return checkWatcher(id, { force: true });
  },
  async TEST_TELEGRAM({ token, chatId }) {
    await sendTelegram(
      { telegramToken: token, telegramChatId: chatId },
      '✅ <b>Page Watcher</b> is connected. You will receive alerts here.',
    );
    return true;
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === 'offscreen') return false; // meant for offscreen.js
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve(handler(message))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // keep the channel open for the async response
});
