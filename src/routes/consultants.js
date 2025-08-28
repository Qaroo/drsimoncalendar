import express from 'express';
import dayjs from 'dayjs';
import { getDb } from '../utils/firebase.js';
import { consultantSchema, errorResponse } from '../utils/validation.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const snap = await getDb().collection('consultants').orderBy('createdAt','desc').get();
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json(data);
});

router.post('/', async (req, res) => {
  try {
    const parsed = consultantSchema.parse(req.body);
    const now = dayjs.utc().toISOString();
    const doc = {
      ...parsed,
      isActive: parsed.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    const ref = await getDb().collection('consultants').add(doc);
    res.status(201).json({ id: ref.id, ...doc });
  } catch (err) {
    res.status(400).json(errorResponse('VALIDATION_ERROR', err.message));
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const updates = consultantSchema.partial().parse(req.body);
    const ref = getDb().collection('consultants').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json(errorResponse('NOT_FOUND','Consultant not found'));
    await ref.update({ ...updates, updatedAt: dayjs.utc().toISOString() });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (err) {
    res.status(400).json(errorResponse('VALIDATION_ERROR', err.message));
  }
});

router.delete('/:id', async (req, res) => {
  const db = getDb();
  const id = req.params.id;
  const apptSnap = await db.collection('appointments').where('consultantId','==', id).limit(1).get();
  const ref = db.collection('consultants').doc(id);
  if (apptSnap.empty) {
    await ref.delete();
    return res.json({ ok: true, deleted: true });
  }
  await ref.update({ isActive: false, updatedAt: dayjs.utc().toISOString() });
  res.json({ ok: true, deleted: false });
});

export default router;
