import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { getSettings, renderTemplate } from './settings.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Jerusalem';

export function computeDefaultEnd(startIso, durationMinutes = 45) {
  return dayjs.utc(startIso).add(durationMinutes, 'minute').toISOString();
}

// Convert user input (which may be local like 2025-08-28T10:00) to UTC ISO.
// If the string already includes Z or an offset, use it as-is; otherwise assume Asia/Jerusalem.
export function toUtcIsoFromInput(inputIsoLike) {
  if (!inputIsoLike) return inputIsoLike;
  const s = String(inputIsoLike);
  const hasZone = /Z|[+-]\d{2}:?\d{2}$/.test(s);
  return hasZone
    ? dayjs.utc(s).toISOString()
    : dayjs.tz(s, TZ).utc().toISOString();
}

export function scheduleNotifications(startIso, clientName, consultantName, toE164) {
  // Backward-compatible default schedule. If settings are added, routes will call the async variant instead.
  const startJerusalem = dayjs.utc(startIso).tz(TZ);
  const dateHe = startJerusalem.format('DD/MM/YYYY');
  const timeHe = startJerusalem.format('HH:mm');
  const nowUtc = dayjs.utc();

  const createdText = `שלום ${clientName}, נקבעה לך פגישה בתאריך ${dateHe} בשעה ${timeHe} עם ${consultantName}. אם אינך יכול/ה להגיע אנא עדכן/ני.`;
  const dayBeforeText = `תזכורת: מחר בשעה ${timeHe} יש לך פגישה עם ${consultantName}. נתראה!`;
  const morningOfText = `בוקר טוב! היום בשעה ${timeHe} נקבעה פגישה עם ${consultantName}. בהצלחה!`;

  const dayBeforeJer = startJerusalem.subtract(1, 'day').hour(8).minute(0).second(0).millisecond(0);
  const morningOfJer = startJerusalem.hour(8).minute(0).second(0).millisecond(0);

  let dayBeforeUtc = dayBeforeJer.tz('UTC', true);
  let morningOfUtc = morningOfJer.tz('UTC', true);

  if (dayBeforeUtc.isBefore(nowUtc) && startJerusalem.isAfter(nowUtc.tz(TZ))) {
    dayBeforeUtc = nowUtc;
  }
  if (morningOfUtc.isBefore(nowUtc) && startJerusalem.isAfter(nowUtc.tz(TZ))) {
    morningOfUtc = nowUtc;
  }

  return [
    { type: 'created', to: toE164, sendAt: nowUtc.toISOString(), payload: { messageText: createdText } },
    { type: 'dayBefore', to: toE164, sendAt: dayBeforeUtc.toISOString(), payload: { messageText: dayBeforeText } },
    { type: 'morningOf', to: toE164, sendAt: morningOfUtc.toISOString(), payload: { messageText: morningOfText } }
  ];
}

export const TZ_NAME = TZ;

// Settings-aware notifications with de-duplication when multiple reminders collapse to "now"
export async function scheduleNotificationsWithSettings(startIso, clientName, consultantName, toE164) {
  const settings = await getSettings();
  const startJerusalem = dayjs.utc(startIso).tz(TZ);
  const dateHe = startJerusalem.format('DD/MM/YYYY');
  const timeHe = startJerusalem.format('HH:mm');
  const nowUtc = dayjs.utc();

  const tokens = { clientName, consultantName, dateHe, timeHe };
  const items = [];

  for (const r of settings.reminders) {
    if (!r.active) continue;
    let sendUtc;
    if (r.immediate) {
      sendUtc = nowUtc;
    } else {
      const sendJer = startJerusalem.add(r.offsetDays, 'day').hour(r.hour).minute(r.minute).second(0).millisecond(0);
      sendUtc = sendJer.tz('UTC', true);
      if (sendUtc.isBefore(nowUtc) && startJerusalem.isAfter(nowUtc.tz(TZ))) {
        // If reminder time already passed but appointment is in the future, send now
        sendUtc = nowUtc;
      }
    }
    items.push({
      type: r.immediate ? 'created' : `offset_${r.offsetDays}_${r.hour}:${r.minute}`,
      to: toE164,
      sendAt: sendUtc.toISOString(),
      payload: { messageText: renderTemplate(r.template, tokens) }
    });
  }

  // De-duplicate: if multiple reminders collapse to the same minute (e.g., created + day-before => now),
  // keep only one (prefer the 'created' one).
  const byMinute = new Map();
  for (const it of items) {
    const minuteKey = dayjs.utc(it.sendAt).second(0).millisecond(0).toISOString();
    const prev = byMinute.get(minuteKey);
    if (!prev) {
      byMinute.set(minuteKey, it);
    } else {
      // Prefer created; otherwise keep first
      if (it.type === 'created') byMinute.set(minuteKey, it);
    }
  }
  return Array.from(byMinute.values());
}
