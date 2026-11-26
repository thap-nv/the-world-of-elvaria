/** The observations Elvaria composes; a CLI's own words belong in `cli_text` (LL-06). */
export const PROBE_NOTES = [
  'probe:usage_full',
  'probe:ping_limited',
  'probe:ping_failed',
  'probe:usage_unprinted',
  'probe:no_answer',
  'probe:account_blocked',
  'probe:window_empty',
  'probe:usage_failed',
  'probe:usage_exit',
  'probe:threw',
] as const;

export type ProbeNoteCode = (typeof PROBE_NOTES)[number];
export interface ProbeNote {
  readonly code: ProbeNoteCode;
  readonly params: Readonly<Record<string, string | number>>;
}

export const PROBE_NOTE_PARAMS: Readonly<Record<ProbeNoteCode, readonly string[]>> = {
  'probe:usage_full': ['windows'],
  'probe:ping_limited': [],
  'probe:ping_failed': ['exit'],
  'probe:usage_unprinted': ['command'],
  'probe:no_answer': ['request'],
  'probe:account_blocked': ['reason'],
  'probe:window_empty': ['windows'],
  'probe:usage_failed': ['command'],
  'probe:usage_exit': ['command', 'exit'],
  'probe:threw': [],
};

export const probeNoteOf = (code: ProbeNoteCode, params: ProbeNote['params'] = {}): ProbeNote => ({
  code,
  params,
});
