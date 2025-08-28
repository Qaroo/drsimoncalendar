import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { getDb } from '../utils/firebase.js';
import { sendWhatsAppMessage } from './whatsapp.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export function startWorker() {
  cron.schedule('*/30 * * * * *', async () => {
    const db = getDb();
    const nowIso = dayjs.utc().toISOString();
    let snap;
    try {
      const q = db.collection('notificationQueue').where('status', '==', 'queued').where('sendAt', '<=', nowIso).limit(10);
      snap = await q.get();
    } catch (err) {
      // If Firestore composite index missing, log and skip this tick
      console.error('[worker] queue scan error (likely missing index):', err?.message || err);
      return;
    }
    for (const doc of snap.docs) {
      const ref = doc.ref;
      const data = doc.data();
      const lockedUntil = data.lockedUntil || null;
      if (lockedUntil && lockedUntil > nowIso) continue;
      try {
        await ref.update({ status: 'processing', lockedUntil: dayjs.utc().add(1, 'minute').toISOString(), updatedAt: nowIso });
      } catch (_) { continue; }
      try {
        await sendWhatsAppMessage(data.to, data.payload?.messageText || '');
        await ref.update({ status: 'sent', sentAt: dayjs.utc().toISOString(), updatedAt: dayjs.utc().toISOString(), lockedUntil: null });
      } catch (err) {
        const attempts = (data.attempts || 0) + 1;
        let nextTime = dayjs.utc().add(Math.pow(2, attempts), 'minutes').toISOString();
        const newStatus = attempts >= 5 ? 'error' : 'queued';
        await ref.update({ status: newStatus, attempts, errorMessage: String(err.message || err), sendAt: nextTime, updatedAt: dayjs.utc().toISOString(), lockedUntil: null });
      }
    }
  });
}
