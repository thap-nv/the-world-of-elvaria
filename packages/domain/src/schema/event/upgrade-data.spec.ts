// The upgrade.* lines (PS-04b): what a build is named by, and what each line must carry.
import { describe, expect, it } from 'vitest';

import { EventSchema } from './event.ts';
import { CommitShaSchema, UPGRADE_STEPS } from './upgrade-data.ts';

const SHA_OLD = '4bc14e9d0c2a7f1e3b5d6a8c9e0f1a2b3c4d5e6f';
const SHA_NEW = 'b0b2605a1c3e5f7a9b1d3f5a7c9e1b3d5f7a9c1e';

const line = (type: string, data: Record<string, unknown>) => ({
  v: 1,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-12T15:00:00+07:00',
  type,
  actor: { kind: 'user' },
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? [])
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

describe('CommitShaSchema', () => {
  it.each([SHA_OLD, `${SHA_NEW}${'0'.repeat(24)}`])('accepts a full commit id %s', (sha) => {
    expect(CommitShaSchema.safeParse(sha).success).toBe(true);
  });

  it.each(['4bc14e9', SHA_OLD.toUpperCase(), `${SHA_OLD}0`, 'main'])('refuses %s', (sha) => {
    expect(CommitShaSchema.safeParse(sha).success).toBe(false);
  });
});

describe('upgrade.* data', () => {
  it('names the steps of a trial in the order they run', () => {
    expect(UPGRADE_STEPS).toEqual(['prepare', 'doctor', 'conformance', 'trial']);
  });

  it('accepts the first upgrade of a kingdom, which has no build to come from', () => {
    expect(issuesOf(line('upgrade.started', { ref: 'main', to: SHA_NEW, from: null }))).toBe('');
  });

  it.each([
    ['upgrade.started', { ref: '', to: SHA_NEW, from: null }, 'data.ref'],
    ['upgrade.started', { ref: 'main', to: 'main', from: null }, 'data.to'],
    ['upgrade.started', { ref: 'main', to: SHA_NEW }, 'data.from'],
    ['upgrade.switched', { to: SHA_NEW, from: SHA_OLD, ref: 'main' }, 'Unrecognized key: "ref"'],
    ['upgrade.rolled_back', { from: null, to: SHA_OLD }, 'data.from'],
    ['upgrade.failed', { to: SHA_NEW, step: 'install', reason: 'exit 1' }, 'data.step'],
    ['upgrade.failed', { to: SHA_NEW, step: 'doctor', reason: '' }, 'data.reason'],
  ])('rejects %s with data %j', (type, data, expected) => {
    expect(issuesOf(line(type, data))).toContain(expected);
  });
});
