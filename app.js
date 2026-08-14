const API_BASE_URL = 'https://api.realandrare.lat';

const defaults = {
  timingMode: 'exact',
  intervalValue: 15,
  intervalUnit: 'minutes',
  minIntervalValue: 10,
  maxIntervalValue: 20,
  rangeIntervalUnit: 'minutes',
  jitterPercent: 25,
  title: 'New Shopify purchase',
  messages: ['You have a new purchase.'],
  enabled: false,
};

const storageKey = 'purchase-alert-settings';
const subscriptionKey = 'purchase-alert-subscription';

const form = document.querySelector('#settingsForm');
const timingMode = document.querySelector('#timingMode');
const intervalValue = document.querySelector('#intervalValue');
const intervalUnit = document.querySelector('#intervalUnit');
const minIntervalValue = document.querySelector('#minIntervalValue');
const maxIntervalValue = document.querySelector('#maxIntervalValue');
const rangeIntervalUnit = document.querySelector('#rangeIntervalUnit');
const jitterPercent = document.querySelector('#jitterPercent');
const title = document.querySelector('#title');
const messageList = document.querySelector('#messageList');
const enabled = document.querySelector('#enabled');
const permissionStatus = document.querySelector('#permissionStatus');
const previewTitle = document.querySelector('#previewTitle');
const previewBody = document.querySelector('#previewBody');
const testButton = document.querySelector('#testButton');
const addMessageButton = document.querySelector('#addMessageButton');
const installNote = document.querySelector('#installNote');
const intervalSummary = document.querySelector('#intervalSummary');
const actionStatus = document.querySelector('#actionStatus');
const iconUrl = new URL('icons/icons8-shopify-180.png', location.href).href;

function normalizeMessages(settings) {
  if (Array.isArray(settings.messages)) {
    return settings.messages.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof settings.message === 'string') {
    return settings.message.split('\n').map((item) => item.trim()).filter(Boolean);
  }

  return defaults.messages;
}

function loadSettings() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { ...defaults };

  try {
    const parsed = { ...defaults, ...JSON.parse(raw) };
    return { ...parsed, messages: normalizeMessages(parsed) };
  } catch {
    return { ...defaults };
  }
}

function createMessageRow(value = '') {
  const row = document.createElement('div');
  row.className = 'message-row';

  const input = document.createElement('input');
  input.className = 'message-input';
  input.type = 'text';
  input.maxLength = 160;
  input.required = true;
  input.value = value;
  input.placeholder = 'Notification text';

  const remove = document.createElement('button');
  remove.className = 'secondary icon-button';
  remove.type = 'button';
  remove.textContent = 'x';
  remove.setAttribute('aria-label', 'Remove text');
  remove.addEventListener('click', () => {
    if (messageList.querySelectorAll('.message-input').length === 1) {
      input.value = '';
    } else {
      row.remove();
    }
    updatePreview();
  });

  row.append(input, remove);
  messageList.append(row);
}

function readMessages() {
  const messages = Array.from(messageList.querySelectorAll('.message-input'))
    .map((input) => input.value.trim())
    .filter(Boolean);

  return messages.length ? messages : defaults.messages;
}

function readForm() {
  const minValue = Math.max(0.001, Number(minIntervalValue.value || defaults.minIntervalValue));
  const maxValue = Math.max(minValue, Number(maxIntervalValue.value || defaults.maxIntervalValue));

  return {
    timingMode: timingMode.value,
    intervalValue: Math.max(0.001, Number(intervalValue.value || defaults.intervalValue)),
    intervalUnit: intervalUnit.value,
    minIntervalValue: minValue,
    maxIntervalValue: maxValue,
    rangeIntervalUnit: rangeIntervalUnit.value,
    jitterPercent: Math.min(100, Math.max(0, Number(jitterPercent.value || defaults.jitterPercent))),
    title: title.value.trim() || defaults.title,
    messages: readMessages(),
    enabled: enabled.checked,
  };
}

function writeForm(settings) {
  timingMode.value = settings.timingMode || defaults.timingMode;
  intervalValue.value = String(settings.intervalValue);
  intervalUnit.value = settings.intervalUnit;
  minIntervalValue.value = String(settings.minIntervalValue || defaults.minIntervalValue);
  maxIntervalValue.value = String(settings.maxIntervalValue || defaults.maxIntervalValue);
  rangeIntervalUnit.value = settings.rangeIntervalUnit || defaults.rangeIntervalUnit;
  jitterPercent.value = String(settings.jitterPercent ?? defaults.jitterPercent);
  title.value = settings.title;
  messageList.innerHTML = '';
  normalizeMessages(settings).forEach((item) => createMessageRow(item));
  if (!messageList.children.length) createMessageRow(defaults.messages[0]);
  enabled.checked = settings.enabled;
}

function updateTimingFields(settings = readForm()) {
  document.querySelectorAll('.timing-field').forEach((field) => {
    field.hidden = true;
  });

  document.querySelectorAll(`.timing-${settings.timingMode}`).forEach((field) => {
    field.hidden = false;
  });
}

function notificationBody(settings) {
  const messages = normalizeMessages(settings);
  const firstMessage = messages[0] || defaults.messages[0];
  const extraCount = Math.max(0, messages.length - 1);
  const suffix = extraCount ? ` (+${extraCount} more)` : '';

  return `${firstMessage}${suffix}`;
}

function updatePreview(settings = readForm()) {
  previewTitle.textContent = settings.title;
  previewBody.textContent = notificationBody(settings);

  if (settings.timingMode === 'random') {
    intervalSummary.textContent = `Sends randomly every ${settings.minIntervalValue}-${settings.maxIntervalValue} ${settings.rangeIntervalUnit}.`;
  } else if (settings.timingMode === 'jitter') {
    intervalSummary.textContent = `Sends around every ${settings.intervalValue} ${settings.intervalUnit}, varied by ${settings.jitterPercent}%.`;
  } else {
    intervalSummary.textContent = `Sends every ${settings.intervalValue} ${settings.intervalUnit}.`;
  }

  updateTimingFields(settings);
}

function updatePermissionStatus() {
  if (!('Notification' in window)) {
    permissionStatus.textContent = 'Unsupported';
    permissionStatus.className = 'status-pill danger';
    return;
  }

  permissionStatus.textContent = Notification.permission;
  permissionStatus.className = `status-pill ${Notification.permission}`;
}

function setActionStatus(message, isError = false) {
  actionStatus.textContent = message;
  actionStatus.className = `action-status field-wide${isError ? ' error' : ''}`;
}

async function ensurePermission() {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support web notifications.');
  }

  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  updatePermissionStatus();
  return result === 'granted';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });
  return navigator.serviceWorker.ready.then(() => registration);
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error(`Could not reach ${API_BASE_URL}. Check HTTPS, DNS, Caddy, backend, and ALLOWED_ORIGIN.`);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `API request failed: ${response.status}`);
  }

  return response.json();
}

async function subscribe(settings) {
  const allowed = await ensurePermission();
  if (!allowed) return null;

  const registration = await getServiceWorkerRegistration();
  const { publicKey } = await apiRequest('/vapid-public-key');
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await apiRequest('/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      subscription,
      settings,
      pageUrl: location.href,
      iconUrl,
    }),
  });

  localStorage.setItem(subscriptionKey, JSON.stringify(subscription));
  return subscription;
}

async function unsubscribe() {
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await apiRequest('/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  localStorage.removeItem(subscriptionKey);
}

function save(settings) {
  localStorage.setItem(storageKey, JSON.stringify(settings));
  updatePreview(settings);
}

function setInstallNote() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && Boolean(navigator.standalone));
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (standalone) {
    installNote.textContent = 'Installed on your home screen.';
  } else if (isIos) {
    installNote.textContent = 'On iPhone: Share, Add to Home Screen, open from the new icon, then allow notifications.';
  } else {
    installNote.textContent = 'Install this app from your browser menu for a home screen icon.';
  }
}

form.addEventListener('input', () => updatePreview());
timingMode.addEventListener('change', () => updatePreview());

addMessageButton.addEventListener('click', () => {
  createMessageRow();
  updatePreview();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const settings = readForm();
  save(settings);

  try {
    if (settings.enabled) {
      await subscribe(settings);
      setActionStatus('Saved. Push notifications are enabled.');
    } else {
      await unsubscribe();
      setActionStatus('Saved. Push notifications are disabled.');
    }
  } catch (error) {
    setActionStatus(error.message || 'Could not save push settings.', true);
  }
});

testButton.addEventListener('click', async () => {
  const settings = readForm();
  save(settings);

  try {
    const subscription = await subscribe(settings);
    if (!subscription) {
      setActionStatus('Notification permission was not granted.', true);
      return;
    }

    await apiRequest('/test', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        settings,
        pageUrl: location.href,
        iconUrl,
      }),
    });
    setActionStatus('Test notification sent.');
  } catch (error) {
    setActionStatus(error.message || 'Could not send test notification.', true);
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(console.error);
}

const settings = loadSettings();
writeForm(settings);
updatePreview(settings);
updatePermissionStatus();
setInstallNote();
