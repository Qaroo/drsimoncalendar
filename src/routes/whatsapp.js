import express from 'express';
import { getLatestQr, getWhatsAppStatus, logoutWhatsApp, refreshWhatsApp } from '../services/whatsapp.js';

const router = express.Router();

router.get('/qr', (req, res) => {
  const qr = getLatestQr();
  if (!qr) return res.status(404).json({ code: 'NO_QR', message: 'No QR available' });
  res.json({ type: 'qr', data: qr });
});

router.get('/status', (req, res) => {
  const status = getWhatsAppStatus();
  res.json(status || { type: 'unknown' });
});

router.post('/logout', async (req, res) => {
  const r = await logoutWhatsApp();
  res.json(r);
});

router.post('/refresh', (req, res) => {
  const r = refreshWhatsApp();
  res.json(r);
});

export default router;
