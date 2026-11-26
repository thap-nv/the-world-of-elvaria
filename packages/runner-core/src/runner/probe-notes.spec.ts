import { describe, expect, it } from 'vitest';

import { PROBE_NOTES, PROBE_NOTE_PARAMS, probeNoteOf } from './probe-notes.ts';

describe('probe notes', () => {
  it('defines the parameter contract for every code in catalog order', () => {
    expect(Object.keys(PROBE_NOTE_PARAMS)).toEqual(PROBE_NOTES);
    expect(PROBE_NOTE_PARAMS).toEqual({
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
    });
    expect(probeNoteOf('probe:ping_limited')).toEqual({ code: 'probe:ping_limited', params: {} });
    expect(probeNoteOf('probe:ping_failed', { exit: 1 })).toEqual({
      code: 'probe:ping_failed',
      params: { exit: 1 },
    });
  });
});
