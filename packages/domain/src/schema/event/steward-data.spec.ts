// The lines a Steward writes about itself and about setup in a quest's plot, and the quest.edited fields (LL-04).
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';
import { SHA_NEW as SHA } from './__fixtures__/valid-data.ts';
import { QUEST_VIEW } from '../../world/__fixtures__/examples.ts';

const VIEW = QUEST_VIEW;

const line = (type: string, data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-28T15:00:00+07:00',
  type,
  actor: { kind: 'steward' },
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? [])
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

describe('steward.* data', () => {
  it.each([
    { build: SHA, previous: 'clean', down_minutes: 0 },
    { build: null, previous: 'unclean', down_minutes: 95 },
    { build: null, previous: 'first' },
  ])('accepts a start after $previous', (data) => {
    expect(issuesOf(line('steward.started', data))).toBe('');
  });

  it('wants the time down after another Steward, and none on a first start', () => {
    expect(issuesOf(line('steward.started', { build: null, previous: 'unclean' }))).toContain(
      'data.down_minutes: a start after another Steward',
    );
    expect(issuesOf(line('steward.started', { build: null, previous: 'first', down_minutes: 3 }))).toContain(
      'data.down_minutes',
    );
  });

  it('refuses a stop with no reason it knows', () => {
    expect(issuesOf(line('steward.stopped', { reason: 'signal', sessions: 0 }))).toBe('');
    expect(issuesOf(line('steward.stopped', { reason: 'crash', sessions: 0 }))).toContain('data.reason');
    expect(issuesOf(line('steward.stopped', { reason: 'owner' }))).toContain('data.sessions');
  });
});

describe('plot.setup data', () => {
  it('accepts a pass with its time and a failure with its detail', () => {
    const log = '.runs/q_20261106_7k3m2a-setup.log';
    expect(
      issuesOf(line('plot.setup', { trigger: 'changed', pass: true, duration_ms: 1200, log_path: log })),
    ).toBe('');
    expect(issuesOf(line('plot.setup', { trigger: 'first', pass: false, log_path: log, detail: 'x' }))).toBe(
      '',
    );
    expect(issuesOf(line('plot.setup', { trigger: 'later', pass: true, log_path: log }))).toContain(
      'data.trigger',
    );
  });
});

describe('quest.edited data', () => {
  it('reads a line with no fields, as one written before LL-04', () => {
    expect(issuesOf(line('quest.edited', { quest: VIEW }))).toBe('');
  });

  it('names fields, and only names', () => {
    expect(issuesOf(line('quest.edited', { quest: VIEW, fields: [] }))).toBe('');
    expect(issuesOf(line('quest.edited', { quest: VIEW, fields: ['description', 'held'] }))).toBe('');
    expect(issuesOf(line('quest.edited', { quest: VIEW, fields: ['Description: new'] }))).toContain(
      'data.fields.0',
    );
  });

  it('keeps fields off the other quest lines', () => {
    expect(issuesOf(line('quest.started', { quest: VIEW, fields: ['description'] }))).toContain('data');
  });
});
