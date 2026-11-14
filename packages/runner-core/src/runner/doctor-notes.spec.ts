import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DOCTOR_NOTES, DOCTOR_NOTE_PARAMS, callNote, doctorNoteOf, hookNote } from './doctor-notes.ts';
import { withHookProblem } from './hook-built.ts';

describe('doctor notes', () => {
  it('has required parameter keys for every code, in catalog order', () => {
    expect(Object.keys(DOCTOR_NOTE_PARAMS)).toEqual(DOCTOR_NOTES);
    expect(doctorNoteOf('doctor:terms_not_acknowledged')).toEqual({
      code: 'doctor:terms_not_acknowledged',
      params: {},
    });
  });

  it('distinguishes timeouts, start failures and completed commands', () => {
    expect(callNote('cli login', { timed_out: true, failure: 'killed' }, 2000)).toEqual(
      doctorNoteOf('doctor:command_timed_out', { command: 'cli login', seconds: 2 }),
    );
    expect(callNote('cli', { timed_out: false, failure: 'ENOENT' }, 2000)).toEqual(
      doctorNoteOf('doctor:command_not_started', { command: 'cli', error: 'ENOENT' }),
    );
    expect(callNote('cli', { timed_out: false }, 2000)).toBeUndefined();
  });

  it('checks missing scripts, existing files, directories and unspecified scripts', async () => {
    const missing = path.join(tmpdir(), 'elvaria missing hook', 'missing.js');
    expect(await hookNote(missing)).toEqual(doctorNoteOf('doctor:hook_missing', { file: missing }));
    expect(await hookNote(tmpdir())).toEqual(doctorNoteOf('doctor:hook_missing', { file: tmpdir() }));
    expect(await hookNote(import.meta.filename)).toBeUndefined();
    expect(await hookNote(undefined)).toBeUndefined();
  });

  it('appends a hook note while preserving external text and existing notes', () => {
    const first = doctorNoteOf('doctor:no_version', { command: 'cli' });
    const hook = doctorNoteOf('doctor:hook_missing', { file: 'hook.js' });
    const info = { path: 'cli', version: '1', auth_ok: true, detail: 'external', notes: [first] };
    expect(withHookProblem(info, undefined)).toBe(info);
    expect(withHookProblem(info, hook)).toEqual({ ...info, auth_ok: false, notes: [first, hook] });
  });
});
