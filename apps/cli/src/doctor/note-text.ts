// What an adapter's `doctor()` says of its CLI, in the owner's language (contract infirmary-reason-codes §4.4): each
// coded note goes through `t('cli.doctor.note.<name>', params)`, then the CLI's own words (`ToolInfo.detail`) follow
// verbatim, since Elvaria does not translate what an outside program printed.
import type { DoctorNote, DoctorNoteCode, ToolInfo } from '@elvaria/runner-core';
import type { MessageKey, Translate } from '@elvaria/i18n';

/** One key per code: the record makes a code without a key a type error. */
export const DOCTOR_NOTE_KEYS: Readonly<Record<DoctorNoteCode, MessageKey>> = {
  'doctor:not_found': 'cli.doctor.note.not_found',
  'doctor:no_version': 'cli.doctor.note.no_version',
  'doctor:command_timed_out': 'cli.doctor.note.command_timed_out',
  'doctor:command_not_started': 'cli.doctor.note.command_not_started',
  'doctor:not_signed_in': 'cli.doctor.note.not_signed_in',
  'doctor:sign_in_ending': 'cli.doctor.note.sign_in_ending',
  'doctor:terms_not_acknowledged': 'cli.doctor.note.terms_not_acknowledged',
  'doctor:hook_missing': 'cli.doctor.note.hook_missing',
  'doctor:bad_note': 'cli.doctor.note.bad_note',
};

export const noteText = (t: Translate, note: DoctorNote): string =>
  t(DOCTOR_NOTE_KEYS[note.code], note.params);

/** The notes in order, then the CLI's words; undefined when the adapter said nothing. */
export function infoText(t: Translate, info: Pick<ToolInfo, 'notes' | 'detail'>): string | undefined {
  const parts = [
    ...(info.notes ?? []).map((note) => noteText(t, note)),
    ...(info.detail === undefined ? [] : [info.detail]),
  ];
  return parts.length === 0 ? undefined : parts.join('; ');
}
