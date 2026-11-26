import { PROBE_NOTES, PROBE_NOTE_PARAMS } from '@elvaria/runner-core';
import type { ProbeNote, ProbeNoteCode } from '@elvaria/runner-core';
import type { MessageKey, Translate } from '@elvaria/i18n';

export const PROBE_NOTE_KEYS: Readonly<Record<ProbeNoteCode, MessageKey>> = {
  'probe:usage_full': 'cli.sandbox.probe.usage_full',
  'probe:ping_limited': 'cli.sandbox.probe.ping_limited',
  'probe:ping_failed': 'cli.sandbox.probe.ping_failed',
  'probe:usage_unprinted': 'cli.sandbox.probe.usage_unprinted',
  'probe:no_answer': 'cli.sandbox.probe.no_answer',
  'probe:account_blocked': 'cli.sandbox.probe.account_blocked',
  'probe:window_empty': 'cli.sandbox.probe.window_empty',
  'probe:usage_failed': 'cli.sandbox.probe.usage_failed',
  'probe:usage_exit': 'cli.sandbox.probe.usage_exit',
  'probe:threw': 'cli.sandbox.probe.threw',
};

export const probeNoteText = (t: Translate, note: ProbeNote): string =>
  t(PROBE_NOTE_KEYS[note.code], note.params);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `mana.probe` data is open, including historical lines: only known, complete notes can be translated. */
function noteOf(value: unknown): ProbeNote | undefined {
  if (!isRecord(value) || !isRecord(value.params)) return undefined;
  const code = PROBE_NOTES.find((candidate) => candidate === value.code);
  if (code === undefined) return undefined;
  const params = value.params;
  if (!Object.values(params).every((param) => typeof param === 'string' || typeof param === 'number'))
    return undefined;
  if (!PROBE_NOTE_PARAMS[code].every((key) => Object.hasOwn(params, key))) return undefined;
  return { code, params: params as ProbeNote['params'] };
}

/** Keep outside text verbatim, including pre-LL-06 detail, after the translated observation. */
export function probeDataText(t: Translate, data: Readonly<Record<string, unknown>>): string {
  const note = noteOf(data.note);
  return [
    ...(note === undefined ? [] : [probeNoteText(t, note)]),
    ...(typeof data.cli_text === 'string' ? [data.cli_text] : []),
    ...(typeof data.detail === 'string' ? [data.detail] : []),
  ].join('; ');
}
