import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

let client;
let ioRef;
let latestQr = null;
let status = null;
const qrListeners = new Set();
const statusListeners = new Set();

export function onQr(add, remove) {
  if (add) qrListeners.add(add);
  if (remove) qrListeners.delete(remove);
}
export function onStatus(add, remove) {
  if (add) statusListeners.add(add);
  if (remove) statusListeners.delete(remove);
}

function emitQr(qr) {
  latestQr = qr;
  for (const cb of qrListeners) cb(qr);
  if (ioRef) ioRef.emit('whatsapp:qr', { type: 'qr', data: qr });
}
function emitStatus(s) {
  status = s;
  for (const cb of statusListeners) cb(s);
  if (ioRef) ioRef.emit('whatsapp:status', s);
}

export function getLatestQr() { return latestQr; }
export function getWhatsAppStatus() { return status; }

export async function initWhatsApp(io) {
  ioRef = io;
  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'calendar-app', dataPath: './whatsapp-session' }),
    puppeteer: { headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] }
  });

  client.on('qr', (qr) => emitQr(qr));
  client.on('authenticated', () => emitStatus({ type: 'authenticated' }));
  client.on('ready', () => emitStatus({ type: 'ready' }));
  client.on('disconnected', (reason) => emitStatus({ type: 'disconnected', reason }));
  client.on('auth_failure', (msg) => emitStatus({ type: 'auth_failure', message: msg }));

  await client.initialize();
}

export async function sendWhatsAppMessage(e164Phone, text) {
  if (!client) throw new Error('WhatsApp client not initialized');
  const number = e164Phone.replace('+','');
  const chatId = `${number}@c.us`;
  return client.sendMessage(chatId, text);
}

export async function logoutWhatsApp() {
  if (!client) return { ok: false, message: 'client not initialized' };
  try {
    await client.logout();
  } catch (e) {
    // ignore; we'll still emit status
  }
  emitStatus({ type: 'disconnected', reason: 'manual' });
  // Try to reinitialize to prompt a new QR if needed
  try { await client.initialize(); } catch {}
  return { ok: true };
}

export function refreshWhatsApp() {
  if (status) emitStatus(status);
  if (latestQr) emitQr(latestQr);
  return { ok: true, status, qr: latestQr };
}
