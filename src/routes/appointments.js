import express from 'express';
import dayjs from 'dayjs';
import { getDb } from '../utils/firebase.js';
import { appointmentSchema, errorResponse } from '../utils/validation.js';
import { computeDefaultEnd, scheduleNotifications, toUtcIsoFromInput, scheduleNotificationsWithSettings } from '../utils/time.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = express.Router();

async function consultantById(id) {
  const ref = getDb().collection('consultants').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function hasConflict(consultantId, startIso, endIso, excludeId) {
  const db = getDb();
  // Only check against scheduled appointments to avoid Firestore '!=' constraints
  const q = db.collection('appointments')
    .where('consultantId','==', consultantId)
    .where('status','==','scheduled');
  const snap = await q.get();
  for (const d of snap.docs) {
    if (excludeId && d.id === excludeId) continue;
    const a = d.data();
    if (a.start < endIso && a.end > startIso) {
      return { id: d.id, ...a };
    }
  }
  return null;
}

router.get('/', async (req, res) => {
  const { from, to, consultantId } = req.query;
  const db = getDb();
  let q = db.collection('appointments');
  if (consultantId) q = q.where('consultantId','==', consultantId);
  if (from) q = q.where('start','>=', from);
  if (to) q = q.where('start','<=', to);
  const snap = await q.get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(items);
});

router.post('/', async (req, res) => {
  try {
    const parsed = appointmentSchema.parse(req.body);
    const consultant = await consultantById(parsed.consultantId);
    if (!consultant || consultant.isActive === false) {
      return res.status(400).json(errorResponse('INVALID_CONSULTANT','Consultant not found or inactive'));
    }
    const duration = Number(parsed.durationMinutes ?? 45);
    // Normalize times to UTC ISO; UI may send local datetime-local string
    const startUtc = toUtcIsoFromInput(parsed.start);
    const end = parsed.end ? toUtcIsoFromInput(parsed.end) : computeDefaultEnd(startUtc, duration);
    if (dayjs.utc(end).isBefore(dayjs.utc(startUtc))) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR','end must be after start'));
    }
    const conflict = await hasConflict(parsed.consultantId, startUtc, end);
    if (conflict) {
      return res.status(409).json(errorResponse('CONFLICT','Overlapping appointment', { conflict }));
    }
    const now = dayjs.utc().toISOString();
    const title = `${parsed.clientName} — ${consultant.fullName}`;
    const doc = { ...parsed, start: startUtc, end, durationMinutes: duration, title, status: 'scheduled', createdAt: now, updatedAt: now };
    const db = getDb();
    const ref = await db.collection('appointments').add(doc);

    const notifListCreate = await scheduleNotificationsWithSettings(startUtc, parsed.clientName, consultant.fullName, parsed.clientPhone);
    const notifications = notifListCreate.map(n => ({ ...n, appointmentId: ref.id, status: 'queued', attempts: 0, createdAt: now, updatedAt: now }));

    const batch = db.batch();
    for (const n of notifications) {
      const nRef = db.collection('notificationQueue').doc();
      batch.set(nRef, n);
    }
    await batch.commit();

    try { await sendWhatsAppMessage(parsed.clientPhone, notifications[0].payload.messageText); } catch {}

    res.status(201).json({ id: ref.id, ...doc });
  } catch (err) {
    res.status(400).json(errorResponse('VALIDATION_ERROR', err.message));
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = appointmentSchema.partial().parse(req.body);
    const db = getDb();
    const ref = db.collection('appointments').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json(errorResponse('NOT_FOUND','Appointment not found'));
    const existing = snap.data();

    const merged = { ...existing, ...updates };
    const duration = Number(merged.durationMinutes ?? 45);
    const startUtc = toUtcIsoFromInput(merged.start);
    const end = merged.end ? toUtcIsoFromInput(merged.end) : computeDefaultEnd(startUtc, duration);
    const conflict = await hasConflict(merged.consultantId, startUtc, end, id);
    if (conflict) {
      return res.status(409).json(errorResponse('CONFLICT','Overlapping appointment', { conflict }));
    }

    const consultant = await consultantById(merged.consultantId);
    const title = `${merged.clientName} — ${consultant.fullName}`;

    await ref.update({ ...updates, start: startUtc, end, title, durationMinutes: duration, updatedAt: dayjs.utc().toISOString() });

    // cancel future notifications for this appointment
    const q = db.collection('notificationQueue').where('appointmentId','==', id).where('status','in', ['queued','processing']);
    const ns = await q.get();
    const batch = db.batch();
    for (const d of ns.docs) {
      batch.update(d.ref, { status: 'error', errorMessage: 'rescheduled', updatedAt: dayjs.utc().toISOString() });
    }
    await batch.commit();

    // enqueue new ones
    const notifListUpdate = await scheduleNotificationsWithSettings(startUtc, merged.clientName, consultant.fullName, merged.clientPhone);
    const notifications = notifListUpdate.map(n => ({ ...n, appointmentId: id, status: 'queued', attempts: 0, createdAt: dayjs.utc().toISOString(), updatedAt: dayjs.utc().toISOString() }));
    const batch2 = db.batch();
    for (const n of notifications) batch2.set(db.collection('notificationQueue').doc(), n);
    await batch2.commit();

    const updated = await ref.get();
    res.json({ id, ...updated.data() });
  } catch (err) {
    res.status(400).json(errorResponse('VALIDATION_ERROR', err.message));
  }
});

router.delete('/:id', async (req, res) => {
  const db = getDb();
  const id = req.params.id;
  const ref = db.collection('appointments').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json(errorResponse('NOT_FOUND','Appointment not found'));
  await ref.update({ status: 'cancelled', updatedAt: dayjs.utc().toISOString() });
  const ns = await db.collection('notificationQueue').where('appointmentId','==', id).where('status','in', ['queued','processing']).get();
  const batch = db.batch();
  for (const d of ns.docs) batch.update(d.ref, { status: 'error', errorMessage: 'cancelled', updatedAt: dayjs.utc().toISOString() });
  await batch.commit();
  res.json({ ok: true });
});

export default router;
