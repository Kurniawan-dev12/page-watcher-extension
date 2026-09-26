const $ = (id) => document.getElementById(id);
const status = $('status');

function show(message, ok) {
  status.textContent = message;
  status.className = ok ? 'ok' : 'bad';
}

function readForm() {
  return {
    telegramToken: $('token').value.trim(),
    telegramChatId: $('chat').value.trim(),
    desktopNotifications: $('desktop').checked,
  };
}

async function load() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('token').value = settings.telegramToken || '';
  $('chat').value = settings.telegramChatId || '';
  $('desktop').checked = settings.desktopNotifications !== false;
}

$('save').addEventListener('click', async () => {
  const settings = readForm();
  if (Boolean(settings.telegramToken) !== Boolean(settings.telegramChatId)) {
    show('Fill in both the bot token and the chat ID (or leave both empty).', false);
    return;
  }
  await chrome.storage.local.set({ settings });
  show('✅ Saved.', true);
});

$('test').addEventListener('click', async () => {
  const { telegramToken: token, telegramChatId: chatId } = readForm();
  if (!token || !chatId) {
    show('Enter the bot token and chat ID first.', false);
    return;
  }
  show('Sending…', true);
  const res = await chrome.runtime.sendMessage({ type: 'TEST_TELEGRAM', token, chatId });
  if (res?.ok) show('✅ Test message sent — check Telegram. Don’t forget to click Save.', true);
  else show(`❌ ${res?.error || 'Failed'}. Did you press Start in your bot chat?`, false);
});

load();
