import { stat } from 'node:fs/promises';

export const DOCTOR_NOTES = [
  'doctor:not_found',
  'doctor:no_version',
  'doctor:command_timed_out',
  'doctor:command_not_started',
  'doctor:not_signed_in',
  'doctor:sign_in_ending',
  'doctor:terms_not_acknowledged',
  'doctor:hook_missing',
  'doctor:bad_note',
] as const;

export type DoctorNoteCode = (typeof DOCTOR_NOTES)[number];
export interface DoctorNote {
  readonly code: DoctorNoteCode;
  readonly params: Readonly<Record<string, string | number>>;
}

export const DOCTOR_NOTE_PARAMS: Readonly<Record<DoctorNoteCode, readonly string[]>> = {
  'doctor:not_found': ['cli', 'places'],
  'doctor:no_version': ['command'],
  'doctor:command_timed_out': ['command', 'seconds'],
  'doctor:command_not_started': ['command', 'error'],
  'doctor:not_signed_in': ['command', 'login'],
  'doctor:sign_in_ending': ['date', 'login'],
  'doctor:terms_not_acknowledged': [],
  'doctor:hook_missing': ['file'],
  'doctor:bad_note': ['code'],
};

export const doctorNoteOf = (code: DoctorNoteCode, params: DoctorNote['params'] = {}): DoctorNote => ({
  code,
  params,
});

const MS_PER_SECOND = 1000;

/** A timeout takes precedence over a failure caused by stopping the command. */
export function callNote(
  command: string,
  run: { readonly timed_out: boolean; readonly failure?: string },
  timeoutMs: number,
): DoctorNote | undefined {
  if (run.timed_out)
    return doctorNoteOf('doctor:command_timed_out', { command, seconds: timeoutMs / MS_PER_SECOND });
  return run.failure === undefined
    ? undefined
    : doctorNoteOf('doctor:command_not_started', { command, error: run.failure });
}

/** Whether the hook script named by this run is missing or is not a file. */
export async function hookNote(script: string | undefined): Promise<DoctorNote | undefined> {
  if (script === undefined) return undefined;
  const built = await stat(script).then(
    (info) => info.isFile(),
    () => false,
  );
  return built ? undefined : doctorNoteOf('doctor:hook_missing', { file: script });
}
