const admin = require('firebase-admin');
const crypto = require('crypto');

function getApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Faltam variaveis de ambiente do Firebase (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Configure-as no painel do Vercel (Settings > Environment Variables).'
    );
  }

  // Vercel env vars store literal "\n" inside the private key; convert back to real newlines.
  privateKey = privateKey.replace(/\\n/g, '\n');

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
}

function db() {
  getApp();
  return admin.firestore();
}

function FieldValue() {
  return admin.firestore.FieldValue;
}

function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str), 'utf8').digest('hex');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayKeyUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

function addDaysKeyUTC(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
}

const DEFAULT_PASSWORD = 'adoracao2026';

async function getConfig() {
  const ref = db().collection('config').doc('main');
  const snap = await ref.get();
  if (snap.exists) return snap.data();

  const start = todayKeyUTC();
  const defaults = {
    churchName: 'Adoração ao Santíssimo Sacramento',
    subtitle: 'Reserve um horário para adorar Jesus Sacramentado',
    contactPhone: '',
    startDate: start,
    endDate: addDaysKeyUTC(start, 7),
    activeHours: Array.from({ length: 24 }, (_, h) => h),
    capacity: 1,
    adminPasswordHash: sha256Hex(DEFAULT_PASSWORD)
  };
  await ref.set(defaults);
  return defaults;
}

async function updateConfig(patch) {
  const ref = db().collection('config').doc('main');
  await ref.set(patch, { merge: true });
}

// ---- sessions (lightweight admin auth tokens) ----
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

async function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  await db().collection('sessions').doc(token).set({
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

async function isValidSession(token) {
  if (!token || typeof token !== 'string') return false;
  const snap = await db().collection('sessions').doc(token).get();
  if (!snap.exists) return false;
  const data = snap.data();
  if (!data.expiresAt || data.expiresAt < Date.now()) {
    await snap.ref.delete().catch(() => {});
    return false;
  }
  return true;
}

// ---- bookings ----
// One Firestore doc per slot ("bookings/{dateKey}_{hh}") holding an array field "entries".
function slotDocRef(slotKey) {
  return db().collection('bookings').doc(slotKey.replace('|', '_'));
}

async function getAllBookingCounts() {
  const snaps = await db().collection('bookings').get();
  const counts = {};
  snaps.forEach((doc) => {
    const entries = doc.data().entries || [];
    counts[doc.id.replace('_', '|')] = entries.length;
  });
  return counts;
}

// Public-safe version: only names (no phone numbers), for display on the public page.
async function getAllBookingNames() {
  const snaps = await db().collection('bookings').get();
  const out = {};
  snaps.forEach((doc) => {
    const entries = doc.data().entries || [];
    if (entries.length) {
      out[doc.id.replace('_', '|')] = entries.map((b) => b.name);
    }
  });
  return out;
}

async function getAllBookingsFull() {
  const snaps = await db().collection('bookings').get();
  const out = {};
  snaps.forEach((doc) => {
    const entries = doc.data().entries || [];
    if (entries.length) out[doc.id.replace('_', '|')] = entries;
  });
  return out;
}

// Atomic check-and-add via Firestore transaction: prevents overbooking under concurrent requests.
async function addBookingAtomic(slotKey, booking, capacity) {
  const ref = slotDocRef(slotKey);
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const entries = snap.exists ? (snap.data().entries || []) : [];
    if (entries.length >= capacity) {
      return { ok: false, reason: 'full' };
    }
    const next = entries.concat([booking]);
    tx.set(ref, { entries: next }, { merge: true });
    return { ok: true };
  });
}

async function removeBooking(slotKey, bookingId) {
  const ref = slotDocRef(slotKey);
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: true };
    const entries = (snap.data().entries || []).filter((b) => b.id !== bookingId);
    tx.set(ref, { entries }, { merge: true });
    return { ok: true };
  });
}

module.exports = {
  sha256Hex,
  getConfig,
  updateConfig,
  createSession,
  isValidSession,
  getAllBookingCounts,
  getAllBookingNames,
  getAllBookingsFull,
  addBookingAtomic,
  removeBooking
};
