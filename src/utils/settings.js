import { z } from 'zod';
import { getDb } from './firebase.js';

export const reminderSchema = z.object({
  id: z.string().optional(),
  active: z.boolean().default(true),
  immediate: z.boolean().default(false),
  offsetDays: z.number().int().default(0),
  hour: z.number().int().min(0).max(23).default(8),
  minute: z.number().int().min(0).max(59).default(0),
  template: z.string().min(1)
});

export const settingsSchema = z.object({
  reminders: z.array(reminderSchema).min(1),
  placeholders: z.object({
    clientName: z.string().default('{שם}'),
    consultantName: z.string().default('{יועץ}'),
    dateHe: z.string().default('{תאריך}'),
    timeHe: z.string().default('{שעה}')
  }).default({})
});

const DEFAULT_SETTINGS = {
  reminders: [
    { active: true, immediate: true, offsetDays: 0, hour: 0, minute: 0, template: 'שלום {שם}, נקבעה לך פגישה בתאריך {תאריך} בשעה {שעה} עם {יועץ}. אם אינך יכול/ה להגיע אנא עדכן/ני.' },
    { active: true, immediate: false, offsetDays: -1, hour: 8, minute: 0, template: 'תזכורת: מחר בשעה {שעה} יש לך פגישה עם {יועץ}. נתראה!' },
    { active: true, immediate: false, offsetDays: 0, hour: 8, minute: 0, template: 'בוקר טוב! היום בשעה {שעה} נקבעה פגישה עם {יועץ}. בהצלחה!' }
  ],
  placeholders: { clientName: '{שם}', consultantName: '{יועץ}', dateHe: '{תאריך}', timeHe: '{שעה}' }
};

let cached;
let cachedAt = 0;
const CACHE_MS = 10000;

export async function getSettings() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;
  const db = getDb();
  const ref = db.collection('appConfig').doc('settings');
  const snap = await ref.get();
  if (!snap.exists) {
    cached = DEFAULT_SETTINGS;
    cachedAt = now;
    return cached;
  }
  const data = snap.data();
  const parsed = settingsSchema.safeParse(data);
  cached = parsed.success ? parsed.data : DEFAULT_SETTINGS;
  cachedAt = now;
  return cached;
}

export async function saveSettings(input) {
  const parsed = settingsSchema.parse(input);
  const db = getDb();
  await db.collection('appConfig').doc('settings').set(parsed, { merge: true });
  cached = parsed;
  cachedAt = Date.now();
  return parsed;
}

export function renderTemplate(template, tokens) {
  return template
    .replaceAll('{שם}', tokens.clientName)
    .replaceAll('{יועץ}', tokens.consultantName)
    .replaceAll('{תאריך}', tokens.dateHe)
    .replaceAll('{שעה}', tokens.timeHe);
}

