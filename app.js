const API_BASE_URL = 'https://api.realandrare.lat';

const defaults = {
  intervalValue: 15,
  intervalUnit: 'minutes',
  amount: 49.99,
  title: 'New Shopify purchase',
  message: 'You have a new purchase.',
  enabled: false,
};

const storageKey = 'purchase-alert-settings';
const subscriptionKey = 'purchase-alert-subscription';

const form = document.querySelector('#settingsForm');
const intervalValue = document.querySelector('#intervalValue');
const intervalUnit = document.querySelector('#intervalUnit');
const amount = document.querySelector('#amount');
const title = document.querySelector('#title');
const message = document.querySelector('#message');
const enabled = document.querySelector('#enabled');
const permissionStatus = document.querySelector('#permissionStatus');
const previewTitle = document.querySelector('#previewTitle');
const previewBody = document.querySelector('#previewBody');
const testButton = document.querySelector('#testButton');
const installNote = document.querySelector('#installNote');
const intervalSummary = document.querySelector('#intervalSummary');
const iconUrl = new URL('icons/icons8-shopify-180.png', location.href).href;

function loadSettings() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return defaults;

  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function readForm() {
  return {
    intervalValue: Math.max(0.001, Number(intervalValue.value || defaults.intervalValue)),
    intervalUnit: intervalUnit.value,
    amount: Math.max(0, Number(amount.value || defaults.amount)),
    title: title.value.trim() || defaults.title,
    message: message.value.trim() || defaults.message,
    enabled: enabled.checked,
  };
}

function writeForm(settings) {
  intervalValue.value = String(settings.intervalValue);
  intervalUnit.value = settings.intervalUnit;
  amount.value = settings.amount.toFixed(2);
  title.value = settings.title;
  message.value = settings.message;
  enabled.checked = settings.enabled;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function notificationBody(settings) {
  const messages = settings.message
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const firstMessage = messages[0] || defaults.message;
  const extraCount = Math.max(0, messages.length - 1);
  const suffix = extraCount ? ` (+${extraCount} more)` : '';

  return `${firstMessage}${suffix} Amount: ${formatCurrency(settings.amount)}`;
}

function updatePreview(settings = readForm()) {
  previewTitle.textContent = settings.title;
  previewBody.textContent = notificationBody(settings);
  intervalSummary.textContent = `Sends every ${settings.intervalValue} ${settings.intervalUnit}.`;
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

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

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const settings = readForm();
  save(settings);

  if (settings.enabled) {
    await subscribe(settings);
  } else {
    await unsubscribe();
  }
});

testButton.addEventListener('click', async () => {
  const settings = readForm();
  save(settings);
  const subscription = await subscribe(settings);
  if (!subscription) return;

  await apiRequest('/test', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      settings,
      pageUrl: location.href,
      iconUrl,
    }),
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(console.error);
}

const settings = loadSettings();
writeForm(settings);
updatePreview(settings);
updatePermissionStatus();
setInstallNote();
