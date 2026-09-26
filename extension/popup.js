import { describeCondition, timeAgo } from './lib/core.js';

const $ = (sel) => document.querySelector(sel);
const send = (type, data = {}) => chrome.runtime.sendMessage({ type, ...data });

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function renderCard(w) {
  const node = $('#card-tpl').content.firstElementChild.cloneNode(true);
  node.classList.toggle('paused', !w.enabled);
  node.classList.toggle('alerted', !!w.lastAlert && Date.now() - w.lastAlert < 10 * 60_000);

  node.querySelector('.label').textContent = w.label;
  const link = node.querySelector('.host');
  link.textContent = hostOf(w.url);
  link.href = w.url;
  node.querySelector('.badge').textContent = describeCondition(w);
  node.querySelector('.value').textContent = w.lastValue ?? '—';
  node.querySelector('.meta').textContent =
    `${w.enabled ? `Every ${w.interval} min` : 'Paused'} · checked ${timeAgo(w.lastChecked)}` +
    (w.lastAlert ? ` · last alert ${timeAgo(w.lastAlert)}` : '');

  if (w.error) {
    const err = node.querySelector('.err');
    err.hidden = false;
    err.textContent = `⚠️ ${w.error}`;
  }

  const ol = node.querySelector('.history ol');
  for (const h of w.history || []) {
    const li = document.createElement('li');
    if (h.alert) li.classList.add('alert');
    const v = document.createElement('span');
    v.textContent = h.value;
    const t = document.createElement('span');
    t.className = 'when';
    t.textContent = new Date(h.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    li.append(v, t);
    ol.append(li);
  }
  if (!ol.children.length) node.querySelector('.history').hidden = true;

  const checkBtn = node.querySelector('.check');
  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    await send('CHECK_NOW', { id: w.id });
    // storage.onChanged re-renders the list
  });

  const toggle = node.querySelector('.toggle');
  toggle.textContent = w.enabled ? '⏸ Pause' : '▶ Resume';
  toggle.addEventListener('click', () => send('TOGGLE_WATCHER', { id: w.id }));

  node.querySelector('.delete').addEventListener('click', () => {
    if (confirm(`Stop watching "${w.label}"?`)) send('DELETE_WATCHER', { id: w.id });
  });

  return node;
}

async function render() {
  const { watchers = [], settings = {} } = await chrome.storage.local.get(['watchers', 'settings']);
  const list = $('#list');
  list.replaceChildren();
  if (!watchers.length) {
    list.append($('#empty-tpl').content.cloneNode(true));
  } else {
    [...watchers].reverse().forEach((w) => list.append(renderCard(w)));
  }
  $('#telegram-hint').hidden = Boolean(settings.telegramToken && settings.telegramChatId);
}

$('#pick').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['picker.js'] });
    window.close();
  } catch {
    const el = $('#pick-error');
    el.hidden = false;
    el.textContent = 'This page can’t be watched (browser pages and the Chrome Web Store are blocked). Open a normal website and try again.';
  }
});

const openSettings = (e) => { e?.preventDefault(); chrome.runtime.openOptionsPage(); };
$('#settings').addEventListener('click', openSettings);
$('#open-settings').addEventListener('click', openSettings);

chrome.storage.onChanged.addListener(render);
render();
