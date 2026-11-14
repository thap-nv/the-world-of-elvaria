import { DOCTOR_NOTES, DOCTOR_NOTE_PARAMS, doctorNoteOf } from '../runner/doctor-notes.ts';
import type { DoctorNote, DoctorNoteCode } from '../runner/doctor-notes.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Adapter files are untyped: malformed notes become data rather than breaking doctor. */
function checkedNote(value: unknown): DoctorNote {
  const code = isRecord(value) ? value.code : undefined;
  const bad = () => doctorNoteOf('doctor:bad_note', { code: typeof code === 'string' ? code : '?' });
  if (typeof code !== 'string' || !(DOCTOR_NOTES as readonly string[]).includes(code)) return bad();
  const params = isRecord(value) ? value.params : undefined;
  if (!isRecord(params)) return bad();
  const keys = DOCTOR_NOTE_PARAMS[code as DoctorNoteCode];
  if (Object.keys(params).length !== keys.length) return bad();
  if (!keys.every((key) => Object.hasOwn(params, key))) return bad();
  if (!Object.values(params).every((item) => typeof item === 'string' || Number.isInteger(item)))
    return bad();
  return value as DoctorNote;
}

export function checkedDoctorNotes(value: unknown): readonly DoctorNote[] | undefined {
  if (value === undefined) return undefined;
  return (Array.isArray(value) ? value : [value]).map(checkedNote);
}
