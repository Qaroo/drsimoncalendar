import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import { initFirebase } from './utils/firebase.js';
import consultantsRouter from './routes/consultants.js';
import appointmentsRouter from './routes/appointments.js';
import whatsappRouter from './routes/whatsapp.js';
import settingsRouter from './routes/settings.js';
import { initWhatsApp, getWhatsAppStatus, onQr, onStatus } from './services/whatsapp.js';
import { startWorker } from './services/worker.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET','POST','PATCH','DELETE'] }
});

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*'}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/consultants', consultantsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/settings', settingsRouter);

initFirebase();

io.on('connection', (socket) => {
  const status = getWhatsAppStatus();
  if (status) socket.emit('whatsapp:status', status);
  const qrListener = (qr) => socket.emit('whatsapp:qr', { type: 'qr', data: qr });
  const statusListener = (s) => socket.emit('whatsapp:status', s);
  onQr(qrListener);
  onStatus(statusListener);
  socket.on('disconnect', () => {
    onQr(null, qrListener);
    onStatus(null, statusListener);
  });
});

initWhatsApp(io).catch(console.error);
startWorker();

const port = process.env.PORT || 5001;
server.listen(port, () => console.log(`API listening on :${port}`));
