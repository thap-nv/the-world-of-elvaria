// Mana per bucket (implementation-plan §3.5, §8 P1-22): a usage limit is read from the account at once and sleeps
// only the gauges it spent (the cap of one model stops only that model's characters); a gauge nearing the cap warns
// once; a pool the account gives no figure for is estimated; a quest asleep too long changes hands; the owner moves
// a character to another model of its tribe.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { KINGDOM, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions, CastMember } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { Event } from '@elvaria/domain';
import type { ProbeOptions, ProbeResult } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(options: BenchOptions = {}) {
  current = await bench(options);
  running = current.steward();
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const lines = async (kingdom: Bench): Promise<readonly Event[]> =>
  (await openEventLog(kingdom.root).read()).events;
const linesOf = async (kingdom: Bench, type: string) =>
  (await lines(kingdom)).filter((event) => event.type === type);
const statusOf = async (kingdom: Bench, title: string) => (await kingdom.quest(title)).status;

const JUDGES: readonly CastMember[] = [
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
];
const FABLE_RESET = '2026-11-14T00:00:00Z';

describe('a usage limit, per bucket (P1-22)', () => {
  it("sleeps only the model's own cap the account shows spent: the other models of the pool go on", async () => {
    let reads = 0;
    /** The account's /usage: Fable's weekly cap fills up with the first session. */
    const claude = ({ ping = true }: ProbeOptions): ProbeResult => {
      if (ping) return { status: 'ok' };
      reads += 1;
      const fable = {
        window: 'weekly',
        used_pct: reads > 1 ? 100 : 40,
        model: 'Fable',
        resets_at: FABLE_RESET,
      } as const;
      return { status: 'ok', windows: [fable, { window: 'five_hour', used_pct: 30 }] };
    };
    const cast = [
      { id: 'thorn', cls: 'knight', model: 'claude-fable-5-1', level: 5 },
      { id: 'kael', cls: 'knight' },
      ...JUDGES,
    ];
    const { kingdom, steward } = await open({
      cast,
      plays: { work: { 'Fable runs dry': ['rate_limit', 'submit'] } },
      probes: { claude },
    });
    await kingdom.command('create_quest', questPayload('Fable runs dry', { assignee: 'thorn' }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Fable runs dry')) === 'paused_mana',
    );
    // The line names the reset the bell says too, and the cap's own reading is logged (P1-32).
    const asleep = await linesOf(kingdom, 'mana.exhausted');
    const fable = { tribe: 'claude', pool: 'claude', model: 'fable' };
    expect(asleep.map(({ data }) => data)).toEqual([{ ...fable, resets_at: FABLE_RESET }]);
    const levels = (await linesOf(kingdom, 'mana.level')).map(({ data }) => data);
    expect(levels).toContainEqual(expect.objectContaining({ ...fable, window: 'weekly', used_pct: 100 }));
    expect(kingdom.notices).toContainEqual({
      kind: 'mana_asleep',
      tribe: 'claude',
      pool: 'claude',
      model: 'fable',
      resets_at: FABLE_RESET,
    });
    expect((await kingdom.character('thorn')).status).toBe('sleeping_mana');
    expect((await kingdom.character('kael')).status).toBe('idle');
    // Sonnet is not Fable: kael takes work while Fable's cap sleeps.
    await kingdom.command('create_quest', questPayload('Sonnet goes on', { assignee: 'kael' }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Sonnet goes on')) === 'done',
    );
    expect(await statusOf(kingdom, 'Fable runs dry')).toBe('paused_mana');
  });

  it('sleeps the whole pool when the account cannot be read', async () => {
    const { kingdom, steward } = await open({
      cast: [{ id: 'kael', cls: 'knight' }, ...JUDGES],
      plays: { work: { 'Runs dry': ['rate_limit', 'submit'] } },
      probes: { claude: () => ({ status: 'error', detail: 'no /usage' }) },
    });
    await kingdom.command('create_quest', questPayload('Runs dry'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Runs dry')) === 'paused_mana',
    );
    expect((await linesOf(kingdom, 'mana.exhausted')).map(({ data }) => data)).toEqual([
      { tribe: 'claude', pool: 'claude' },
    ]);
    expect(kingdom.notices).toContainEqual({ kind: 'mana_asleep', tribe: 'claude', pool: 'claude' });
  });
});

describe('the owner hears the gauges (P1-22)', () => {
  it('warns once when a gauge the world draws on nears the cap', async () => {
    const window = { window: 'five_hour', used_pct: 90, resets_at: '2026-11-07T13:00:00Z' } as const;
    const claude = ({ ping = true }: ProbeOptions): ProbeResult =>
      ping ? { status: 'ok' } : { status: 'ok', windows: [window] };
    const { kingdom, steward } = await open({ plays: { work: { Waits: ['hang'] } }, probes: { claude } });
    await kingdom.command('create_quest', questPayload('Waits'));
    await steward.tick();
    kingdom.clock.advance(20);
    await steward.tick();
    const warned = await linesOf(kingdom, 'mana.warning');
    expect(warned.map(({ data }) => data)).toEqual([
      {
        tribe: 'claude',
        pool: 'claude',
        window: 'five_hour',
        used_pct: 90,
        source: 'rate_limits',
        resets_at: '2026-11-07T13:00:00Z',
      },
    ]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'mana_warning')).toEqual([
      {
        kind: 'mana_warning',
        tribe: 'claude',
        pool: 'claude',
        window: 'five_hour',
        used_pct: 90,
        resets_at: '2026-11-07T13:00:00Z',
      },
    ]);
  });

  it('estimates a pool the account gives no figure for, from the tokens of its sessions', async () => {
    const { kingdom, steward } = await open();
    const tribes = KINGDOM.tribes.map((tribe) =>
      tribe.id === 'claude' ? { ...tribe, budget: { tokens_5h: 1_000_000 } } : tribe,
    );
    await kingdom.store.kingdom.write({ ...KINGDOM, tribes });
    await kingdom.command('create_quest', questPayload('Spends tokens'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Spends tokens')) === 'done',
    );
    await steward.tick();
    const estimates = (await linesOf(kingdom, 'mana.level'))
      .map(({ data }) => data as { tribe: string; window: string; source: string })
      .filter(({ source }) => source === 'estimate');
    expect(estimates.map(({ tribe, window }) => [tribe, window])).toContainEqual(['claude', 'five_hour']);
    expect(estimates.some(({ window }) => window === 'weekly')).toBe(false);
  });
});

describe('mana.reassign_after_hours (P1-22)', () => {
  it('gives a quest asleep past the limit to a free character of its class whose mana is open', async () => {
    const { kingdom, steward } = await open({
      cast: [
        { id: 'kael', cls: 'knight' },
        { id: 'quill', cls: 'knight', tribe: 'gemini', model: 'gemini-4-argon-medium' },
        ...JUDGES,
      ],
      plays: { work: { 'Sleeps long': ['rate_limit', 'submit'] } },
      probes: { claude: ({ ping = true }) => (ping ? { status: 'rate_limited' } : { status: 'ok' }) },
    });
    await kingdom.store.kingdom.write({ ...KINGDOM, mana: { ...KINGDOM.mana, reassign_after_hours: 1 } });
    await kingdom.command('create_quest', questPayload('Sleeps long', { assignee: 'kael' }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Sleeps long')) === 'paused_mana',
    );
    await steward.tick();
    expect(await statusOf(kingdom, 'Sleeps long')).toBe('paused_mana');
    kingdom.clock.advance(61);
    await steward.tick();
    expect(await kingdom.quest('Sleeps long')).toMatchObject({ status: 'working', assignee: 'quill' });
    expect(await kingdom.character('kael')).toMatchObject({ status: 'sleeping_mana', current: null });
    const claimed = await linesOf(kingdom, 'quest.claimed');
    expect(claimed.at(-1)?.actor).toEqual({ kind: 'steward' });
  });
});

describe('set_model (P1-22)', () => {
  it("moves a character to another model of its tribe, and refuses the model it has or another tribe's", async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('set_model', { character: 'wren', model: 'gemini-3.8-flash-high' });
    await steward.tick();
    expect((await kingdom.character('wren')).model).toBe('gemini-3.8-flash-high');
    const changed = await linesOf(kingdom, 'character.model_changed');
    expect(changed.map(({ actor }) => actor)).toEqual([{ kind: 'user' }]);
    await kingdom.command('set_model', { character: 'wren', model: 'gemini-3.8-flash-high' });
    await kingdom.command('set_model', { character: 'kael', model: 'gemini-4-argon-medium' });
    await kingdom.command('set_model', { character: 'nobody', model: 'claude-opus-5-5' });
    await steward.tick();
    const reasons = (await linesOf(kingdom, 'command.rejected')).map(
      ({ data }) => (data as { reason?: string }).reason,
    );
    expect(reasons).toEqual(['same_model', 'model_not_of_tribe', 'unknown_character']);
  });
});
