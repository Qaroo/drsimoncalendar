import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneE164(input) {
  // Default to IL if no country code provided
  const trimmed = (input || '').trim();
  const phone = trimmed.startsWith('+')
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, 'IL');
  if (!phone || !phone.isValid()) throw new Error('Invalid phone number');
  return phone.number; // E.164
}

export const consultantSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1).transform((val, ctx) => {
    try { return normalizePhoneE164(val); } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid E.164 phone' }); return z.NEVER; }
  }),
  specialties: z.array(z.string()).optional(),
  isActive: z.boolean().optional()
});

export const appointmentSchema = z.object({
  clientName: z.string().min(1),
  clientPhone: z.string().min(1).transform((val, ctx) => {
    try { return normalizePhoneE164(val); } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid E.164 phone' }); return z.NEVER; }
  }),
  consultantId: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  notes: z.string().optional()
});

export function errorResponse(code, message, details) {
  return { code, message, ...(details ? { details } : {}) };
}
