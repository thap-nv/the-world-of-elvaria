// The mana gauges the Steward logged (P1-32): folded from its `mana.*` lines, then shown by `character list` (the
// characters the Steward put to sleep are marked with their gauge) and `doctor` (every gauge, readings, resets).
import { EventSchema, InstantSchema } from '@elvaria/domain';
import type { CharacterId, Event } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NOW, foundKingdom, printed, run, tempDir, testIo } from '../test/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../test/quest.ts';
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

/**
 * Claude's pool asleep with its readings and the reset its sleep named (P1-32); Argon's cap asleep unread, as a
 * line written before P1-32 says it; the Gemini group awake and read.
 */
const DAY = (): Event[] => [
  manaLine('mana.exhausted', GEMINI, '2026-11-06T07:00:00+07:00'),
  manaLine('mana.restored', GEMINI, '2026-11-06T07:30:00+07:00'),
  level(GEMINI, 'weekly', 70, '2026-11-06T08:00:00+07:00'),
  level(GEMINI, 'five_hour', 20),
  level(CLAUDE, 'weekly', 30, '2026-11-10T09:00:00+07:00'),
  level(CLAUDE, 'five_hour', 90, RESETS),
  level(CLAUDE, 'five_hour', 100, RESETS, 'signal'),
  manaLine('mana.exhausted', { ...CLAUDE, resets_at: RESETS }),
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
    // The reset Claude's sleep named; Argon's sleep named none.
    expect(gauges[1]?.resets_at).toBe(RESETS);
    expect(gauges[2]).not.toHaveProperty('resets_at');
  });

  it('forgets the reset of a sleep once the gauge wakes', () => {
    const woke = [
      manaLine('mana.exhausted', { ...ARGON, resets_at: RESETS }),
      manaLine('mana.restored', ARGON),
    ];
    expect(gaugesOf(woke, NOW)).toEqual([{ ...ARGON, asleep: false, readings: [] }]);
  });

  it.each([
    ['its own mana.level (P1-32)', level(ARGON, 'weekly', 92, RESETS)],
    [
      'a warning, as before P1-32',
      manaLine('mana.warning', { ...ARGON, window: 'weekly', used_pct: 92, source: 'rate_limits' }),
    ],
  ])("takes one model's readings from %s, apart from its pool's", (_, line) => {
    const [gauge] = gaugesOf([line], NOW);
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

  // The reset its sleep named heads the gauge (P1-32).
  const asleepClaude = `Mana gauge asleep: tribe claude, pool claude, resets at ${RESETS}. The characters it binds take no work until the Steward finds the mana back; it probes just after that time.`;
  const asleepArgon =
    "Mana gauge asleep: tribe gemini, pool gemini_models, argon's own cap. The characters it binds take no work until the Steward finds the mana back.";
  const claudeFull = `5-hour window: 100% used, resets at ${RESETS} (read at ${READ_AT}, source signal).`;
  const unmeasured = 'Not measured: the log has no reading of this gauge still in force.';

  /** What the Steward's settleSleepers writes for a character a sleeping gauge binds. */
  async function putToSleep(id: string): Promise<void> {
    const store = openKingdom(kingdom);
    const read = await store.characters.read(id as CharacterId);
    if (!read.ok) throw new Error(`no character ${id}`);
    const asleep = { status: 'sleeping_mana', status_before_sleep: 'idle', status_since: READ_AT } as const;
    const written = await store.characters.write({ ...read.value, ...asleep });
    if (!written.ok) throw new Error(written.error.message);
  }

  it('marks the characters the Steward put to sleep with the gauge they wait for, then lists the gauges', async () => {
    // Argon's cap and the whole Gemini group both asleep, Claude's pool too.
    await openEventLog(kingdom).append([...DAY(), manaLine('mana.exhausted', GEMINI)]);
    // A second Argon character the Steward left awake: the account does not list Argon in the group, the prefix
    // table would (gemini-*). It is not marked: the Steward's word, its status, decides.
    await run(
      testIo(),
      'character',
      'add',
      'sage',
      '--class',
      'scribe',
      '--tribe',
      'gemini',
      '--model',
      'gemini-4-argon-medium',
      '--kingdom',
      kingdom,
    );
    for (const id of ['thorn', 'quill', 'wren']) await putToSleep(id);
    const io = testIo();
    expect(await run(io, 'character', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    const row = (id: string) => io.printed.out.find((line) => line.startsWith(id));
    expect(row('thorn')).toMatch(/Asleep \(out of mana\) \(blocked: tribe claude, pool claude asleep\)$/);
    // Its own cap, not the group the prefix table would also give it.
    expect(row('quill')).toMatch(/\(blocked: tribe gemini, pool gemini_models, argon's own cap asleep\)$/);
    expect(row('wren')).toMatch(/\(blocked: tribe gemini, pool gemini_models asleep\)$/);
    expect(row('sage')).toMatch(/Idle$/);
    const under = io.printed.out.slice(io.printed.out.indexOf('') + 1);
    expect(under.filter((line) => !line.startsWith(' '))).toEqual([
      'Mana gauge asleep: tribe gemini, pool gemini_models. The characters it binds take no work until the Steward finds the mana back.',
      asleepClaude,
      asleepArgon,
    ]);
    expect(under).toContain(`    ${claudeFull}`);
    expect(under.at(-1)).toBe(`    ${unmeasured}`);
  });

  it('marks nobody the Steward has not put to sleep, even when a sleeping gauge would bind them', async () => {
    await openEventLog(kingdom).append(DAY());
    const io = testIo();
    expect(await run(io, 'character', 'list', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(io.printed.out.join('\n')).not.toContain('blocked');
    expect(io.printed.out).toContain(asleepClaude);
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

  it('doctor gives what a session took of each window, and warns of a gauge closed early or at the cap (P1-49)', async () => {
    // thorn's session ended between two readings of Claude's 5-hour window: 30% then 36%, so a session took 6%.
    const ended = {
      n: 1,
      character: 'thorn',
      role: 'assignee',
      started_at: '2026-11-06T07:10:00+07:00',
      ended_at: '2026-11-06T07:30:00+07:00',
      outcome: 'submitted',
      run_dir: `.runs/${QUEST_ID}-1`,
    };
    await plantQuests(
      kingdom,
      questFixture('done', QUEST_ID, { assignee: 'thorn', attempts: 1, attempt_log: [ended] }),
    );
    const at = (hour: string) => `2026-11-06T${hour}:00+07:00`;
    const read = (pool: object, window: string, used: number, ts: string, resets = RESETS) =>
      manaLine(
        'mana.level',
        { ...pool, window, used_pct: used, source: 'rate_limits', resets_at: resets },
        ts,
      );
    const weekly = '2026-11-10T09:00:00+07:00';
    await openEventLog(kingdom).append([
      read(CLAUDE, 'five_hour', 30, at('07:00')),
      read(CLAUDE, 'five_hour', 36, at('08:00')),
      read(GEMINI, 'weekly', 92, at('08:00'), weekly),
      read(ARGON, 'weekly', 98, at('08:00'), weekly),
    ]);
    const io = testIo();
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    const text = printed(io);
    expect(text).toContain(
      '✓ Mana gauge: tribe claude, pool claude.\n    5-hour window: 36% used, resets at ' +
        `${RESETS} (read at ${at('08:00')}, source rate_limits).\n` +
        '    One session took up to 6% of the 5-hour window (measured from the log).',
    );
    expect(text).toContain(
      '! Mana gauge closed one session early: tribe gemini, pool gemini_models. Its weekly window is at 92%, and one more session (7%) would take it to 98%',
    );
    expect(text).toContain(
      "    One session's share of the weekly window is not measured yet: the Steward counts 7%.",
    );
    expect(text).toContain(
      "! Mana gauge closed: tribe gemini, pool gemini_models, argon's own cap. Its weekly window is at 98%, at or past 98%",
    );
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
