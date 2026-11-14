import { describe, expect, it } from 'vitest';

import { doctorNoteOf } from '../runner/doctor-notes.ts';
import { checkedDoctorNotes } from './doctor-notes.ts';

describe('checkedDoctorNotes', () => {
  it('does not throw when a note has a broken property accessor', () => {
    const broken = Object.defineProperty({}, 'code', {
      get: () => {
        throw new Error('broken adapter');
      },
    });
    expect(checkedDoctorNotes([broken])).toEqual([doctorNoteOf('doctor:bad_note', { code: '?' })]);
  });

  it.each([null, [], 'params', { command: true }, { command: Number.NaN }, { command: {} }])(
    'rejects malformed params %j without throwing',
    (params) => {
      expect(checkedDoctorNotes([{ code: 'doctor:no_version', params }])).toEqual([
        doctorNoteOf('doctor:bad_note', { code: 'doctor:no_version' }),
      ]);
    },
  );
});
