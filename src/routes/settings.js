import express from 'express';
import { getSettings, saveSettings, settingsSchema } from '../utils/settings.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const s = await getSettings();
  res.json(s);
});

router.put('/', async (req, res) => {
  try {
    const body = settingsSchema.parse(req.body);
    const saved = await saveSettings(body);
    res.json(saved);
  } catch (e) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: String(e.message || e) });
  }
});

export default router;

