import admin from 'firebase-admin';

let initialized = false;

export function initFirebase() {
  if (initialized) return admin;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey && privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    console.warn('Firebase credentials missing. Some features will not work until configured.');
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
    initialized = true;
  }
  return admin;
}

export function getDb() {
  if (!initialized && admin.apps.length === 0) initFirebase();
  return admin.firestore();
}
