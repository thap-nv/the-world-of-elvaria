import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { WORLD_STATE_VERSION } from './constants.ts';
import { readSnapshot, snapshotOf } from './snapshot.ts';
import { worldStateOf } from './world-state.ts';
import type { Ulid } from '../core/ids.ts';

const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: QUESTS,
  campaigns: CAMPAIGNS,
});
const LAST = { id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB' as Ulid, ts: '2026-11-06T12:00:00+07:00' };

/** What .state/ gives back: the snapshot written as JSON and read again. */
const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('snapshotOf and readSnapshot', () => {
  it('read back what was written, at the current version', () => {
    const snapshot = snapshotOf(STATE, LAST);
    expect(snapshot.version).toBe(WORLD_STATE_VERSION);
    expect(readSnapshot(stored(snapshot))).toEqual({ ok: true, value: snapshot });
  });

  it('take a state before any line', () => {
    expect(readSnapshot(stored(snapshotOf(STATE, null)))).toMatchObject({
      ok: true,
      value: { last_event: null },
    });
  });

  it.each([
    ['before pools kept their sleep reset', { ...snapshotOf(STATE, LAST), version: 2 }, 2],
    [
      'another version',
      { ...snapshotOf(STATE, LAST), version: WORLD_STATE_VERSION + 1 },
      WORLD_STATE_VERSION + 1,
    ],
    ['no version', { state: STATE }, undefined],
    ['not an object', 'world', undefined],
    ['null', null, undefined],
  ])('drop a snapshot with %s, to rebuild it from the files and the log', (_, value, version) => {
    expect(readSnapshot(value)).toEqual({ ok: false, error: { code: 'stale_version', version } });
  });

  it('drop a snapshot of this version that no longer parses, and say why', () => {
    const broken = { ...snapshotOf(STATE, LAST), state: { ...STATE, sandbox: 'no' } };
    expect(readSnapshot(stored(broken))).toEqual({
      ok: false,
      error: { code: 'invalid', issues: ['state.sandbox: Invalid input: expected boolean, received string'] },
    });
  });
});
