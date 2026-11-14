import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVENT_VERSION, EVENT_DATA_SCHEMAS, EventSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { DAY_1, makeEvent } from '../__fixtures__/events.ts';
import { readEventFile } from '../read-file.ts';
import { parseEventLine } from '../parse-line.ts';
import { CURRENT_EVENT_VERSION, EVENT_MIGRATIONS } from './index.ts';
import { currentEventVersion, migrateEvent, versionOfLine } from './run.ts';
import { v1ToV2 } from './v1-to-v2.ts';
import type { EventMigrationChain } from './run.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = readdirSync(HERE).filter((name) => /^v\d+\.jsonl$/.test(name));

// A made-up v1 → v2 step, to prove the chain without changing the real schema.
const RENAME_SESSION: EventMigrationChain = [
  (old) => {
    const { session, ...rest } = old as Record<string, unknown>;
    return { ...rest, v: 2, ...(session === undefined ? {} : { session_id: session }) };
  },
];

describe('event line migrations', () => {
  it('reads v1 infirmary reasons as legacy without rewriting the log or changing trip and detail', async () => {
    const file = path.join(HERE, 'v1.jsonl');
    const original = readFileSync(file, 'utf8');
    const raw = original
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const read = await readEventFile(file);
    for (const old of raw) {
      const current = read.events.find(({ id }) => id === old.id);
      const data = old.data as Record<string, unknown>;
      expect(current).toEqual({
        ...old,
        v: EVENT_VERSION,
        data:
          old.type === 'quest.infirmary'
            ? { ...data, reason: { code: 'legacy', params: { text: data.reason } } }
            : data,
      });
    }
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('leaves malformed and already structured infirmary data for schema validation', () => {
    for (const data of [null, {}, 'invalid', { reason: { code: 'legacy', params: { text: 'old' } } }]) {
      const old = { v: 1, type: 'quest.infirmary', data };
      expect(v1ToV2(old)).toEqual({ ...old, v: EVENT_VERSION });
    }
  });

  it('keeps the hook writer version aligned with the domain schema', () => {
    expect(CURRENT_EVENT_VERSION).toBe(EVENT_VERSION);
  });

  it('ends at the v that EventSchema accepts: a schema bump without a step fails here', () => {
    expect(CURRENT_EVENT_VERSION).toBe(EVENT_MIGRATIONS.length + 1);
    const event = makeEvent(DAY_1, 1);
    expect(EventSchema.safeParse({ ...event, v: CURRENT_EVENT_VERSION }).success).toBe(true);
    expect(EventSchema.safeParse({ ...event, v: CURRENT_EVENT_VERSION + 1 }).success).toBe(false);
  });

  it.each(FIXTURES)('reads every line of the old fixture %s with the current reader', async (name) => {
    const read = await readEventFile(path.join(HERE, name));
    expect(read.issues).toEqual([]);
    expect(read.pending).toBe(0);
    expect(read.events.length).toBeGreaterThan(0);
  });

  it('the v1 fixture has a line of every type with a data schema', async () => {
    const read = await readEventFile(path.join(HERE, 'v1.jsonl'));
    const types = new Set(read.events.map((event) => event.type));
    for (const type of Object.keys(EVENT_DATA_SCHEMAS)) expect(types).toContain(type);
  });

  // Tasks that add lines in parallel have picked the same id before (P1-22 took the id of a command.applied line).
  it.each(FIXTURES)('gives every line of %s an id of its own', async (name) => {
    const ids = (await readEventFile(path.join(HERE, name))).events.map(({ id }) => id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  // Optional fields added with `v` still 1 (P1-32): the fixture keeps a line from before each beside one with it.
  it.each([
    ['quest.infirmary', 'trip'],
    ['quest.infirmary', 'detail'],
    ['mana.exhausted', 'resets_at'],
    ['mana.level', 'model'],
  ])('keeps a %s line without %s beside one with it', async (type, field) => {
    const read = await readEventFile(path.join(HERE, 'v1.jsonl'));
    const lines = read.events.filter((event) => event.type === type).map(({ data }) => data);
    expect(lines.some((data) => data[field] === undefined)).toBe(true);
    expect(lines.some((data) => data[field] !== undefined)).toBe(true);
  });

  it('runs every step from the line v up to the current one', () => {
    const line = { v: 1, id: 'x', session: 's-1' };
    expect(migrateEvent(line, RENAME_SESSION)).toEqual({
      ok: true,
      value: { v: 2, id: 'x', session_id: 's-1' },
    });
    expect(migrateEvent({ v: 2, id: 'y' }, RENAME_SESSION)).toEqual({ ok: true, value: { v: 2, id: 'y' } });
    expect(currentEventVersion(RENAME_SESSION)).toBe(2);
  });

  it('reports a line without v, a line from a newer Elvaria, and a step that fails or forgets v', () => {
    expect(migrateEvent({ id: 'x' }, [])).toEqual({ ok: false, error: { code: 'missing_version' } });
    expect(migrateEvent({ v: 0 }, [])).toEqual({ ok: false, error: { code: 'missing_version' } });
    expect(migrateEvent('text', [])).toEqual({ ok: false, error: { code: 'missing_version' } });
    expect(migrateEvent({ v: 3 }, RENAME_SESSION)).toEqual({
      ok: false,
      error: { code: 'future_version', v: 3, current: 2 },
    });
    const throws: EventMigrationChain = [
      () => {
        throw new Error('unexpected shape');
      },
    ];
    expect(migrateEvent({ v: 1 }, throws)).toEqual({
      ok: false,
      error: { code: 'migration_failed', from: 1, message: 'unexpected shape' },
    });
    expect(migrateEvent({ v: 1 }, [() => 'not an object'])).toMatchObject({
      error: { code: 'migration_failed', message: 'did not set v 2' },
    });
    const throwsText: EventMigrationChain = [
      () => {
        // A step written in plain JS may throw anything.
        throw 'bare string' as unknown as Error;
      },
    ];
    expect(migrateEvent({ v: 1 }, throwsText)).toMatchObject({
      error: { message: 'bare string' },
    });
    expect(versionOfLine({ v: EVENT_VERSION + 0.5 })).toBeUndefined();
  });

  it('upgrades a line before the schema sees it', () => {
    const text = JSON.stringify(makeEvent(DAY_1, 1));
    expect(parseEventLine(text, EventSchema).ok).toBe(true);
    // An upgrade beyond the current schema is rejected at `v`.
    const toV2: EventMigrationChain = [
      ...EVENT_MIGRATIONS,
      (old) => ({ ...(old as object), v: EVENT_VERSION + 1 }),
    ];
    const upgraded = parseEventLine(text, EventSchema, toV2);
    expect(upgraded).toMatchObject({ ok: false, error: { code: 'invalid', details: [{ path: ['v'] }] } });
    const broken = parseEventLine(text, EventSchema, [...EVENT_MIGRATIONS, () => 'x']);
    expect(broken).toMatchObject({ ok: false, error: { code: 'migration_failed' } });
  });
});
