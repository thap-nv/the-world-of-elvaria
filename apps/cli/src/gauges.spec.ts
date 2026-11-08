// The mana gauges the Steward logged (P1-32): folded from its `mana.*` lines, then shown by `character list` (the
// characters a sleeping gauge binds are marked) and `doctor` (every gauge, its readings and resets).
import { EventSchema, InstantSchema } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NOW, foundKingdom, printed, run, tempDir, testIo } from '../test/cli.ts';
import { gaugesOf } from './gauges.ts';
import type { TempDir } from '../test/cli.ts';

const READ_AT = '2026-11-06T08:30:00+07:00';
const RESETS = '2026-11-06T13:01:26+07:00';
const CLAUDE = { tribe: 'claude', pool: 'claude' };
const GEMINI = { tribe: 'gemini', pool: 'gemini_models' };
const ARGON = { ...GEMINI, model: 'argon' };

let next = 0;
function manaLine(type: string, data: Record<string, unknown>, ts = READ_AT): Event {
  next += 1;
  return EventSchema.parse({
    v: 1,
    id: `01M6RQ5Y000000000000001${String(next).padStart(3, '0')}`,
    ts,
    type,
    actor: { kind: 'steward' },
    data,
  });
}

const level = (pool: object, window: string, used: number, resets?: string, source = 'rate_limits') =>
  manaLine('mana.level', {
    ...pool,
    window,
    used_pct: used,
    source,
    ...(resets ? { resets_at: resets } : {}),
  });

/** Claude's pool asleep with its readings, Argon's cap asleep unread, the Gemini group awake and read. */
const DAY = (): Event[] => [
  manaLine('mana.exhausted', GEMINI, '2026-11-06T07:00:00+07:00'),
  manaLine('mana.restored', GEMINI, '2026-11-06T07:30:00+07:00'),
  level(GEMINI, 'weekly', 70, '2026-11-06T08:00:00+07:00'),
  level(GEMINI, 'five_hour', 20),
  level(CLAUDE, 'weekly', 30, '2026-11-10T09:00:00+07:00'),
  level(CLAUDE, 'five_hour', 90, RESETS),
  level(CLAUDE, 'five_hour', 100, RESETS, 'signal'),
  manaLine('mana.exhausted', CLAUDE),
  manaLine('mana.exhausted', ARGON),
];

describe('gaugesOf', () => {
  it('keeps whether each gauge sleeps and the latest reading of each window still in force', () => {
    const gauges = gaugesOf(DAY(), NOW);
    expect(gauges.map(({ tribe, pool, model, asleep }) => [tribe, pool, model, asleep])).toEqual([
      ['gemini', 'gemini_models', undefined, false],
      ['claude', 'claude', undefined, true],
      ['gemini', 'gemini_models', 'argon', true],
    ]);
    // The weekly reading of the group reset at 08:00, before now (09:00): it says nothing any more.
    expect(gauges[0]?.readings.map(({ window }) => window)).toEqual(['five_hour']);
    expect(gauges[1]?.readings).toEqual([
      {
        window: 'weekly',
        used_pct: 30,
        resets_at: '2026-11-10T09:00:00+07:00',
        source: 'rate_limits',
        observed_at: READ_AT,
      },
      { window: 'five_hour', used_pct: 100, resets_at: RESETS, source: 'signal', observed_at: READ_AT },
    ]);
    expect(gauges[2]?.readings).toEqual([]);
  });

  it("takes one model's readings from its warnings, apart from its pool's", () => {
    const warning = { ...ARGON, window: 'weekly', used_pct: 92, source: 'rate_limits', resets_at: RESETS };
    const [gauge] = gaugesOf([manaLine('mana.warning', warning)], NOW);
    expect(gauge).toMatchObject({ ...ARGON, asleep: false, readings: [{ window: 'weekly', used_pct: 92 }] });
  });

  it('names no gauge when the log has no mana line', () => {
    expect(gaugesOf([], InstantSchema.parse(0))).toEqual([]);
  });
});

describe('elvaria character list and doctor with the gauges the Steward logged', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const summon = (...args: string[]) => run(testIo(), 'character', 'add', ...args, '--kingdom', kingdom);
    await summon('thorn', '--class', 'knight', '--tribe', 'claude', '--model', 'claude-sonnet-5-5');
    await summon('quill', '--class', 'scribe', '--tribe', 'gemini', '--model', 'gemini-4-argon-medium');
    await summon('wren', '--class', 'scribe', '--tribe', 'gemini', '--model', 'gemini-3.8-flash-high');
  });
  afterEach(() => dir.remove());

  const asleepClaude =
    'Mana gauge asleep: tribe claude, pool claude. The characters it binds take no work until the Steward finds the mana back.';
  const asleepArgon =
    "Mana gauge asleep: tribe gemini, pool gemini_models, argon's own cap. The characters it binds take no work until the Steward finds the mana back.";
  const claudeFull = `5-hour window: 100% used, resets at ${RESETS} (read at ${READ_AT}, source signal).`;
  const unmeasured = 'Not measured: the log has no reading of this gauge still in force.';

  it('marks the characters a sleeping gauge binds, then names the gauge with its readings and reset', async () => {
    await openEventLog(kingdom).append(DAY());
    const io = testIo();
    expect(await run(io, 'character', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const [, ...rows] = io.printed.out;
    expect(rows.find((row) => row.startsWith('thorn'))).toMatch(
      /Idle \(blocked: tribe claude, pool claude asleep\)$/,
    );
    expect(rows.find((row) => row.startsWith('quill'))).toMatch(
      /blocked: tribe gemini, pool gemini_models, argon's own cap asleep\)$/,
    );
    expect(rows.find((row) => row.startsWith('wren'))).toMatch(/Idle$/);
    expect(io.printed.out.slice(-6)).toEqual([
      '',
      asleepClaude,
      `    weekly window: 30% used, resets at 2026-11-10T09:00:00+07:00 (read at ${READ_AT}, source rate_limits).`,
      `    ${claudeFull}`,
      asleepArgon,
      `    ${unmeasured}`,
    ]);
  });

  it('doctor warns of each sleeping gauge with its reset, and gives the awake ones their readings', async () => {
    await openEventLog(kingdom).append(DAY());
    const io = testIo();
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    const text = printed(io);
    expect(text).toContain(`! ${asleepClaude}\n`);
    expect(text).toContain(`    ${claudeFull}`);
    expect(text).toContain(`! ${asleepArgon}\n    ${unmeasured}`);
    expect(text).toContain(
      `✓ Mana gauge: tribe gemini, pool gemini_models.\n    5-hour window: 20% used, reset time unknown (read at ${READ_AT}, source rate_limits).`,
    );
    // A warning, not an error: a sleeping gauge does not make the machine unready.
    expect(text).not.toContain('✗ Mana');
  });

  it('says mana is not measured yet when the Steward has logged nothing, and marks nobody', async () => {
    const doctor = testIo();
    await run(doctor, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    expect(printed(doctor)).toContain(
      '✓ Mana: not measured; the Steward has logged no reading and no gauge asleep yet (elvaria run reads mana while there is work).',
    );
    const list = testIo();
    expect(await run(list, 'character', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(list.printed.out).toHaveLength(4);
    expect(list.printed.out.join('\n')).not.toContain('blocked');
  });
});
