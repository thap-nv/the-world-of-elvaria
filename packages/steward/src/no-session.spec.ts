// A session that could not open (fix/review-no-session). On PS-07's kingdom an agy judge whose prompt was longer than
// Windows takes was chosen every tick for 16 minutes, with a warning and nothing else; a Codex judge whose CLI failed
// in a second was chosen again and took both turns of the review. Now a judge whose session never opens leaves the
// review as one that crashed (§2.5 `review.no_session`): passed over, counted toward REVIEW_BREAKS_MAX, the infirmary
// and one bell at the ceiling. An assignee's quest goes to the infirmary at once, with why (trip `no_session`).
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { FAIL, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, SpawnRequest } from '@elvaria/runner-core';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench(options);
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** What agy said on PS-07's kingdom, on two lines as a thrown error may be. */
const TOO_LONG =
  'agy takes its prompt on the command line, and this one would be about 39636 characters; Windows stops at 32767\n    at spawnOf';

/** A runner whose sessions of `role` never open from the `from`-th on; `tries` names whose did not. */
function unopenable(runner: AgentRunner, role: SpawnRequest['role'], from = 1) {
  let seen = 0;
  const tries: string[] = [];
  const spawn: AgentRunner['spawn'] = (req) => {
    if (req.role !== role) return runner.spawn(req);
    seen += 1;
    if (seen < from) return runner.spawn(req);
    tries.push(req.character.id);
    return Promise.reject(new Error(TOO_LONG));
  };
  return { tries, runner: { ...runner, spawn } };
}

const judgesOf = (quest: Quest) => quest.attempt_log.filter(({ role }) => role === 'verifier');
const typesOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);
const statusIs = (kingdom: Bench, title: string, status: Quest['status']) => async () =>
  (await kingdom.quest(title)).status === status;
const infirmaries = (kingdom: Bench) => kingdom.notices.filter(({ kind }) => kind === 'infirmary');

/** A few more ticks: nothing more may happen to a quest that waits for the owner. */
async function idleTicks(kingdom: Bench, steward: Steward): Promise<void> {
  for (let tick = 0; tick < 3; tick += 1) {
    kingdom.clock.advance(1);
    await steward.tick();
  }
}

describe('a judge whose session cannot open', () => {
  it('leaves the review once, and the next judge judges it (PS-07 (B))', async () => {
    let gemini: ReturnType<typeof unopenable> | undefined;
    const { kingdom, steward } = await open({}, (k) => {
      gemini = unopenable(k.runners.gemini, 'verifier');
      return { runners: { claude: k.runners.claude, gemini: gemini.runner } };
    });
    await kingdom.command('create_quest', questPayload('Long diff'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Long diff', 'done'));
    const judges = judgesOf(await kingdom.quest('Long diff'));
    expect(judges.map(({ character, outcome }) => [character, outcome])).toEqual([
      ['orin', 'no_session'],
      ['sable', 'submitted'],
    ]);
    expect(gemini?.tries).toEqual(['orin']);
    expect(kingdom.warnings.join('\n')).toContain(
      'no session for orin: agy takes its prompt on the command line',
    );
    expect(infirmaries(kingdom)).toEqual([]);
  });

  it('sends the review to the infirmary with one bell once no judge could open one', async () => {
    let tries: string[][] = [];
    const { kingdom, steward } = await open({}, (k) => {
      const claude = unopenable(k.runners.claude, 'verifier');
      const gemini = unopenable(k.runners.gemini, 'verifier');
      tries = [gemini.tries, claude.tries];
      return { runners: { claude: claude.runner, gemini: gemini.runner } };
    });
    await kingdom.command('create_quest', questPayload('Never judged'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Never judged', 'infirmary'));
    const quest = await kingdom.quest('Never judged');
    expect(judgesOf(quest).map(({ outcome }) => outcome)).toEqual(['no_session', 'no_session']);
    expect(quest).toMatchObject({ verifier: null, attempts: 1 });
    expect(infirmaries(kingdom)).toEqual([
      expect.objectContaining({
        trip: 'no_verdict',
        detail: { verifiers_stopped: 2 },
        reason: {
          code: 'judge:no_session',
          params: { error: expect.stringMatching(/^agy takes .* 32767$/) as unknown, stopped: 2, run: 1 },
        },
      }),
    ]);
    await idleTicks(kingdom, steward);
    expect(tries.flat()).toEqual(['orin', 'sable']);
    expect(infirmaries(kingdom)).toHaveLength(1);
  });

  it('stalls a review the last Steward left without its move to the infirmary, at the next start (P1-44)', async () => {
    const kingdom = (current = await bench());
    const { quests } = kingdom.store;
    // The Steward stops between the two moves of the stall: its write of the infirmary fails.
    const write: typeof quests.write = (quest) =>
      quest.status === 'infirmary'
        ? Promise.resolve({ ok: false, error: { code: 'locked', file: 'quests', message: 'held' } })
        : quests.write(quest);
    const runners = {
      claude: unopenable(kingdom.runners.claude, 'verifier').runner,
      gemini: unopenable(kingdom.runners.gemini, 'verifier').runner,
    };
    const first = kingdom.steward({ store: { ...kingdom.store, quests: { ...quests, write } }, runners });
    expect(await first.start({ loop: false })).toEqual({ ok: true });
    await kingdom.command('create_quest', questPayload('Left stalled'));
    await tickUntil(
      first,
      kingdom.clock,
      async () => judgesOf(await kingdom.quest('Left stalled')).length === 2,
    );
    await first.stop();
    expect(await kingdom.quest('Left stalled')).toMatchObject({ status: 'review', verifier: null });

    running = kingdom.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect(await kingdom.quest('Left stalled')).toMatchObject({ status: 'infirmary' });
    expect(infirmaries(kingdom).at(-1)).toMatchObject({
      trip: 'no_verdict',
      detail: { verifiers_stopped: 2 },
      reason: { code: 'restart:no_verdict', params: { stopped: 2 } },
    });
  });
});

describe("an assignee's session that cannot open", () => {
  it('sends a claimed quest to the infirmary with why and one bell, instead of a claim every tick', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      runners: { claude: unopenable(k.runners.claude, 'assignee').runner, gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Never starts'));
    await steward.tick();
    const quest = await kingdom.quest('Never starts');
    expect(quest).toMatchObject({ status: 'infirmary', attempts: 0, attempt_log: [] });
    expect((await typesOf(kingdom)).slice(-2)).toEqual(['quest.claimed', 'quest.infirmary']);
    expect(infirmaries(kingdom)).toEqual([
      expect.objectContaining({
        trip: 'no_session',
        reason: {
          code: 'breaker:no_session',
          params: {
            error:
              'agy takes its prompt on the command line, and this one would be about 39636 characters; Windows stops at 32767',
          },
        },
      }),
    ]);
    await idleTicks(kingdom, steward);
    expect((await typesOf(kingdom)).filter((type) => type === 'quest.claimed')).toHaveLength(1);
    expect(infirmaries(kingdom)).toHaveLength(1);
  });

  it('sends a returned quest whose next session cannot open to the infirmary', async () => {
    let claude: ReturnType<typeof unopenable> | undefined;
    const { kingdom, steward } = await open({ plays: { verdicts: { 'Fails once': [FAIL] } } }, (k) => {
      claude = unopenable(k.runners.claude, 'assignee', 2);
      return { runners: { claude: claude.runner, gemini: k.runners.gemini } };
    });
    await kingdom.command('create_quest', questPayload('Fails once'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Fails once', 'infirmary'));
    expect(await kingdom.quest('Fails once')).toMatchObject({ attempts: 1 });
    expect(infirmaries(kingdom)).toEqual([expect.objectContaining({ trip: 'no_session' })]);
    await idleTicks(kingdom, steward);
    expect(claude?.tries).toHaveLength(1);
  });

  it("refuses the owner's answer whose session cannot open: the quest stays blocked", async () => {
    const { kingdom, steward } = await open({ plays: { work: { Asks: ['ask', 'submit'] } } }, (k) => ({
      runners: { claude: unopenable(k.runners.claude, 'assignee', 2).runner, gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Asks'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Asks', 'blocked'));
    await kingdom.command('answer', { quest: (await kingdom.quest('Asks')).id, answer: 'Yes.' });
    await steward.tick();
    expect(await kingdom.quest('Asks')).toMatchObject({ status: 'blocked', attempts: 1 });
    expect(infirmaries(kingdom)).toEqual([]);
  });

  it('lets the claim go, as before, when the Steward stops while the session opens (P1-49)', async () => {
    let stopping: Promise<void> | undefined;
    const { kingdom, steward } = await open({}, (k) => ({
      runners: {
        claude: {
          ...k.runners.claude,
          spawn: () => {
            stopping = running?.stop();
            return Promise.reject(new Error('the setup was cut short'));
          },
        },
        gemini: k.runners.gemini,
      },
    }));
    await kingdom.command('create_quest', questPayload('Stopped'));
    await steward.tick();
    await stopping;
    running = undefined;
    expect(await kingdom.quest('Stopped')).toMatchObject({ status: 'open', assignee: null, attempts: 0 });
    expect((await typesOf(kingdom)).slice(-2)).toEqual(['quest.claimed', 'quest.released']);
    expect(infirmaries(kingdom)).toEqual([]);
  });
});
