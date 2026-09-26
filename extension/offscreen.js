// Offscreen document: has DOMParser, which the service worker does not.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen' || message.type !== 'EXTRACT') return false;
  const doc = new DOMParser().parseFromString(message.html, 'text/html');
  const el = doc.querySelector(message.selector);
  // textContent (not innerText): a parsed document has no layout
  const text = el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 500) : null;
  sendResponse(text);
  return false;
});
