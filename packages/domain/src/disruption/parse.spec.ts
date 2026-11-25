import { describe, expect, it } from 'vitest';

import examples from '../../examples/disruption-kind.json' with { type: 'json' };
import { parseDisruptionKinds } from './parse.ts';

const NAMES = { name_vi: 'Mẫu', name_en: 'Sample', description: 'A sample kind.' };
const event = (id: string, type: string) => ({ id, ...NAMES, shape: 'event', type });
const sequence = (fields: Record<string, unknown>) => ({
  id: 'pair',
  ...NAMES,
  shape: 'sequence',
  first: { type: 'quest.edited' },
  then: { type: 'agent.session.end' },
  same: ['quest'],
  ...fields,
});
const file = (...disruptions: unknown[]) => ({ version: 1, disruptions });
const codes = (json: unknown) => {
  const parsed = parseDisruptionKinds(json);
  return parsed.ok ? [] : parsed.error.map(({ path, code }) => ({ path, code }));
};

describe('parseDisruptionKinds', () => {
  it('returns the kinds of a valid file in file order', () => {
    const parsed = parseDisruptionKinds(examples[0]);
    expect(parsed.ok && parsed.value.map((kind) => kind.id)).toEqual(['commit_refused', 'guest_waited']);
  });

  it('is an error, not a throw, for a file that is not one', () => {
    expect(codes(null)).toEqual([{ path: [], code: 'invalid' }]);
    expect(codes(file())).toEqual([{ path: ['disruptions'], code: 'invalid' }]);
  });

  it('wants exactly one of within_seconds and after_minutes on a sequence', () => {
    expect(codes(file(sequence({ within_seconds: 60 })))).toEqual([]);
    const issue = [{ path: ['disruptions', 0, 'within_seconds'], code: 'invalid' }];
    expect(codes(file(sequence({})))).toEqual(issue);
    expect(codes(file(sequence({ within_seconds: 60, after_minutes: 5 })))).toEqual(issue);
  });

  it('refuses a condition with two operations, a path that is not one, and a cause on neither event', () => {
    const where = [{ path: 'data.outcome', in: ['killed'], exists: true }];
    expect(codes(file({ ...event('a', 'quest.edited'), where }))).toEqual([
      { path: ['disruptions', 0, 'where', 0], code: 'invalid' },
    ]);
    expect(codes(file({ ...event('a', 'quest.edited'), cause: 'data..code' }))).toEqual([
      { path: ['disruptions', 0, 'cause'], code: 'invalid' },
    ]);
    expect(codes(file(sequence({ within_seconds: 60, cause: 'data.outcome' })))).toEqual([
      { path: ['disruptions', 0, 'cause'], code: 'invalid' },
    ]);
  });

  it('refuses a repeated id and an event type outside the catalog, wherever a match names it', () => {
    const typo = sequence({
      within_seconds: 60,
      then: { type: 'agent.session.ended' },
      unless: { type: 'quest.nope' },
    });
    expect(codes(file(event('a', 'quest.edited'), event('a', 'quest.edit'), typo))).toEqual([
      { path: ['disruptions', 1, 'id'], code: 'duplicate_id' },
      { path: ['disruptions', 1, 'type'], code: 'unknown_event' },
      { path: ['disruptions', 2, 'then', 'type'], code: 'unknown_event' },
      { path: ['disruptions', 2, 'unless', 'type'], code: 'unknown_event' },
    ]);
  });
});
