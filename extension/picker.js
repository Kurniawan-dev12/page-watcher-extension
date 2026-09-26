// Injected into the current page when the user clicks "Watch an element".
// Step 1: hover + click to choose an element. Step 2: a small panel to set the rule.
(() => {
  if (window.__pageWatcherPicker) return;
  window.__pageWatcherPicker = true;

  const ACCENT = '#2563eb';

  // ---------- CSS selector for the chosen element ----------
  function uniqueId(el) {
    return el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1;
  }

  function cssPath(el) {
    if (uniqueId(el)) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (uniqueId(node)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  }

  const textOf = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 500);

  // ---------- host element with shadow DOM so page CSS can't break our UI ----------
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .box { position: fixed; border: 2px solid ${ACCENT}; background: rgba(37,99,235,.10); border-radius: 4px;
             pointer-events: none; transition: all .06s ease-out; display: none; }
      .tag { position: fixed; background: ${ACCENT}; color: #fff; font-size: 12px; padding: 3px 8px; border-radius: 4px;
             pointer-events: none; display: none; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bar { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff;
             padding: 10px 16px; border-radius: 999px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.25);
             pointer-events: auto; display: flex; gap: 12px; align-items: center; }
      .bar kbd { background: #334155; border-radius: 4px; padding: 1px 6px; font-size: 12px; }
      .panel { position: fixed; top: 16px; right: 16px; width: 320px; background: #fff; color: #0f172a; border-radius: 12px;
               box-shadow: 0 12px 40px rgba(15,23,42,.25); padding: 16px; pointer-events: auto; font-size: 13px; }
      .panel h2 { margin: 0 0 12px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
      .value { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px;
               font-weight: 600; font-size: 15px; word-break: break-word; max-height: 72px; overflow: auto; }
      label { display: block; font-size: 12px; color: #475569; margin: 10px 0 4px; }
      input, select { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; color: #0f172a; background: #fff; }
      input:focus, select:focus { outline: 2px solid ${ACCENT}; outline-offset: -1px; border-color: transparent; }
      .row { display: flex; gap: 8px; } .row > div { flex: 1; }
      .actions { display: flex; gap: 8px; margin-top: 16px; }
      button { flex: 1; padding: 9px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-size: 13px;
               cursor: pointer; font-weight: 600; color: #0f172a; }
      button.primary { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
      button:hover { filter: brightness(.95); }
      .hint { font-size: 11px; color: #64748b; margin-top: 4px; }
      .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff;
               padding: 12px 18px; border-radius: 10px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
    </style>
    <div class="box"></div>
    <div class="tag"></div>
    <div class="bar">🎯 Click the value you want to watch <kbd>Esc</kbd> to cancel</div>
  `;
  const box = root.querySelector('.box');
  const tag = root.querySelector('.tag');
  const bar = root.querySelector('.bar');

  let current = null;

  function highlight(el) {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', top: `${r.top - 2}px`, left: `${r.left - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    tag.textContent = textOf(el) || el.tagName.toLowerCase();
    Object.assign(tag.style, { display: 'block', top: `${Math.max(4, r.top - 26)}px`, left: `${Math.max(4, r.left)}px` });
  }

  function onMove(e) {
    const el = e.target;
    if (!el || el === host || el === document.documentElement || el === document.body) return;
    current = el;
    highlight(el);
  }

  function onClick(e) {
    if (!current || e.target === host) return;
    e.preventDefault();
    e.stopPropagation();
    stopPicking();
    showPanel(current);
  }

  function onKey(e) {
    if (e.key === 'Escape') cleanup();
  }

  function stopPicking() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    bar.remove();
  }

  function cleanup() {
    stopPicking();
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    window.__pageWatcherPicker = false;
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  // ---------- step 2: configure the rule ----------
  function showPanel(el) {
    const value = textOf(el);
    const selector = cssPath(el);
    const hasNumber = /\d/.test(value);
    const defaultLabel = (document.title || location.hostname).split(/[|–-]/)[0].trim().slice(0, 40);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <h2>👁️ Watch this value</h2>
      <div class="value"></div>
      <label>Name</label>
      <input name="label" maxlength="60">
      <label>Alert me when</label>
      <select name="condition">
        <option value="changed">The value changes</option>
        <option value="below">Number goes below…</option>
        <option value="above">Number goes above…</option>
        <option value="contains">Text appears…</option>
      </select>
      <div class="threshold-wrap" hidden>
        <label class="threshold-label">Threshold</label>
        <input name="threshold">
        <div class="hint"></div>
      </div>
      <label>Check every</label>
      <select name="interval">
        <option value="1">1 minute</option>
        <option value="5" selected>5 minutes</option>
        <option value="15">15 minutes</option>
        <option value="60">1 hour</option>
      </select>
      <div class="actions">
        <button class="cancel">Cancel</button>
        <button class="primary save">Start watching</button>
      </div>
    `;
    root.appendChild(panel);
    panel.querySelector('.value').textContent = value || '(empty element)';
    panel.querySelector('[name=label]').value = defaultLabel;
    const condition = panel.querySelector('[name=condition]');
    const wrap = panel.querySelector('.threshold-wrap');
    const threshold = panel.querySelector('[name=threshold]');
    const hint = panel.querySelector('.hint');
    if (hasNumber) condition.value = 'below';

    function updateThreshold() {
      const c = condition.value;
      wrap.hidden = c === 'changed';
      threshold.type = c === 'contains' ? 'text' : 'number';
      threshold.placeholder = c === 'contains' ? 'e.g. In stock' : 'e.g. 100';
      hint.textContent = c === 'contains'
        ? 'Not case-sensitive.'
        : 'Currency symbols and separators are ignored ($1,299.00 → 1299).';
    }
    condition.addEventListener('change', updateThreshold);
    updateThreshold();
    highlight(el);

    panel.querySelector('.cancel').addEventListener('click', cleanup);
    panel.querySelector('.save').addEventListener('click', async () => {
      const c = condition.value;
      if (c !== 'changed' && !threshold.value.trim()) {
        threshold.focus();
        return;
      }
      const watcher = {
        url: location.href,
        selector,
        label: panel.querySelector('[name=label]').value.trim() || defaultLabel,
        condition: c,
        threshold: c === 'changed' ? null : threshold.value.trim(),
        interval: Number(panel.querySelector('[name=interval]').value),
        lastValue: value || null,
      };
      const response = await chrome.runtime.sendMessage({ type: 'ADD_WATCHER', watcher });
      panel.remove();
      box.style.display = 'none';
      tag.style.display = 'none';
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = response?.ok
        ? '✅ Watching! Open Page Watcher from the toolbar to see it.'
        : `❌ Could not save: ${response?.error || 'unknown error'}`;
      root.appendChild(toast);
      setTimeout(cleanup, 2500);
    });
  }
})();
