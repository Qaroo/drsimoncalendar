import dotenv from 'dotenv';
dotenv.config();
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { initFirebase, getDb } from '../src/utils/firebase.js';

dayjs.extend(utc);

initFirebase();
const db = getDb();

async function run() {
  const now = dayjs.utc().toISOString();
  const consultant = { fullName: 'יועץ לדוגמה', phone: '+972501234567', isActive: true, createdAt: now, updatedAt: now };
  const cRef = await db.collection('consultants').add(consultant);

  const appt1 = { clientName: 'דני', clientPhone: '+972541112222', consultantId: cRef.id, start: dayjs.utc().add(2,'day').hour(10).minute(0).second(0).toISOString(), end: dayjs.utc().add(2,'day').hour(10).minute(45).toISOString(), durationMinutes: 45, title: 'דני — יועץ לדוגמה', status: 'scheduled', createdAt: now, updatedAt: now };
  const appt2 = { clientName: 'רות', clientPhone: '+972541113333', consultantId: cRef.id, start: dayjs.utc().add(2,'day').hour(12).minute(0).toISOString(), end: dayjs.utc().add(2,'day').hour(12).minute(45).toISOString(), durationMinutes: 45, title: 'רות — יועץ לדוגמה', status: 'scheduled', createdAt: now, updatedAt: now };
  await db.collection('appointments').add(appt1);
  await db.collection('appointments').add(appt2);
  console.log('Seeded consultant and appointments.');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
