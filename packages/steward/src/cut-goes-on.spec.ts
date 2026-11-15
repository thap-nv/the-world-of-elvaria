// The soft and the hard ceiling in the Steward ((F) of phase 2, ADR 0030): a session past `soft_pct` is told once, in
// `wrap-up.json` and one `agent.session.wrap_up` line; a session cut at `hard_pct` is measured for progress, and the quest
// goes on in a fresh session of the same run, or to the infirmary after two cuts in a row without progress. The other
// trips (`commit`, `secrets`, `forbidden_paths`, `no_session`) never go on by themselves, whatever the branch holds.
import { ok } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CLEAN,
  movingTip,
  plotsOf,
  spending,
  withoutUsage,
  wrapUpFile,
  wrapUpLines,
} from './__fixtures__/cuts.ts';
import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, statusIs } from './__fixtures__/review.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';

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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HANGS = { work: { Cut: ['hang', 'hang', 'hang'] as const } };
/** Rank D: 45 minutes, so 85 % is 38.25 and 150 % is 67.5. */
const SOFT = 40;
const HARD = 67.5;
const hangingJudge = (req: { readonly role: string }) => (req.role === 'verifier' ? 'hang' : 'submit');
const assigneeSessions = (kingdom: Bench) => kingdom.requests.filter(({ role }) => role === 'assignee');

describe('a session past the soft ceiling', () => {
  it('gets wrap-up.json and one line, once, and goes on until the hard ceiling', async () => {
    const { kingdom, steward } = await open({ plays: HANGS });
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    expect(await wrapUpFile(kingdom, quest.id)).toBeUndefined();
    kingdom.clock.advance(SOFT);
    await steward.tick();
    const told = { measure: 'minutes', used: SOFT, limit: 45, pct: (SOFT * 100) / 45 };
    expect(await wrapUpFile(kingdom, quest.id)).toEqual({ version: 1, ...told });
    expect(await wrapUpLines(kingdom)).toMatchObject([
      { quest: quest.id, data: { measure: 'time', used: SOFT, limit: 45 } },
    ]);
    kingdom.clock.advance(5);
    await steward.tick();
    expect(await wrapUpLines(kingdom)).toHaveLength(1);
    expect((await kingdom.quest('Cut')).status).toBe('working');
  });

  it('is told of tokens too, in the file under the name of the measure', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({
      runners: { claude: spending(k.runners.claude, 410_000), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    await pause(20);
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    expect(await wrapUpFile(kingdom, quest.id)).toMatchObject({
      measure: 'tokens',
      used: 410_000,
      limit: 480_000,
    });
  });

  it('is told only of minutes when its tribe reports no usage, and the tokens never cut it', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({
      runners: { claude: spending(withoutUsage(k.runners.claude), 9_000_000), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    await pause(20);
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    expect(quest.status).toBe('working');
    expect(await wrapUpFile(kingdom, quest.id)).toBeUndefined();
    kingdom.clock.advance(SOFT);
    await steward.tick();
    expect(await wrapUpFile(kingdom, quest.id)).toMatchObject({ measure: 'minutes' });
    kingdom.clock.advance(HARD);
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('returned');
  });

  it('does not give a judge the reminder, and still leaves the review to the next one at the hard ceiling', async () => {
    const { kingdom, steward } = await open({ plays: { work: {} } }, (k) => ({
      runners: {
        claude: k.fake({ tribe: 'claude' as never, scenarioOf: hangingJudge }),
        gemini: k.fake({ tribe: 'gemini' as never, scenarioOf: hangingJudge }),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged'));
    await tickUntil(steward, kingdom.clock, async () => {
      const quest = await kingdom.quest('Judged');
      return quest.status === 'review' && typeof quest.verifier === 'string';
    });
    kingdom.clock.advance(SOFT * 2);
    await steward.tick();
    expect(await wrapUpLines(kingdom)).toEqual([]);
    kingdom.clock.advance(HARD);
    await steward.tick();
    expect(await kingdom.quest('Judged')).toMatchObject({ status: 'review', verifier: null });
    expect(kingdom.notices).toEqual([]);
  });
});

describe('an assignee cut at the hard ceiling', () => {
  it('goes on in a fresh session of the same run when it left a commit, with no bell', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({ plots: plotsOf(k, true) }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    const started = await kingdom.quest('Cut');
    kingdom.clock.advance(HARD);
    await steward.tick();
    const cut = await kingdom.quest('Cut');
    expect(cut).toMatchObject({ status: 'returned', attempts: 1, assignee: started.assignee });
    expect(cut.attempt_log).toMatchObject([{ n: 1, outcome: 'timeout', progress: true }]);
    expect(kingdom.notices).toEqual([]);
    expect((await kingdom.character(started.assignee ?? '')).status).toBe('idle');
    await steward.tick();
    const again = await kingdom.quest('Cut');
    expect(again).toMatchObject({ status: 'working', attempts: 1, assignee: started.assignee });
    expect(again.attempt_log).toMatchObject([{ n: 1 }, { n: 1 }]);
    const user = assigneeSessions(kingdom).at(-1)?.prompt.user ?? '';
    expect(user).toContain('# Picking up the quest');
    expect(user).toContain('it was cut at the hard ceiling of its time, tokens or turns');
    expect(kingdom.notices).toEqual([]);
  });

  it('goes on once without progress, then goes to the infirmary with the bell when the next cut has none either', async () => {
    const commits: string[] = [];
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({ plots: plotsOf(k, false, commits) }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    kingdom.clock.advance(HARD);
    await steward.tick();
    expect(await kingdom.quest('Cut')).toMatchObject({
      status: 'returned',
      attempt_log: [{ progress: false }],
    });
    expect(kingdom.notices).toEqual([]);
    await steward.tick();
    expect(await kingdom.quest('Cut')).toMatchObject({ status: 'working', attempts: 1 });
    kingdom.clock.advance(HARD);
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log).toMatchObject([
      { n: 1, progress: false },
      { n: 1, progress: false },
    ]);
    expect(kingdom.notices).toEqual([
      expect.objectContaining({
        kind: 'infirmary',
        trip: 'time',
        reason: { code: 'breaker:no_progress', params: { trip: 'time', run: 1 } },
      }),
    ]);
    expect(commits).toHaveLength(2);
    // The quest waits for the owner: no third session, no second bell.
    await steward.tick();
    expect(assigneeSessions(kingdom)).toHaveLength(2);
    expect(kingdom.notices).toHaveLength(1);
  });

  it('goes on after a cut at the tokens ceiling too', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({
      runners: { claude: spending(k.runners.claude, 720_001), gemini: k.runners.gemini },
      plots: plotsOf(k, true),
    }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    await pause(20);
    await steward.tick();
    expect(await kingdom.quest('Cut')).toMatchObject({
      status: 'returned',
      attempts: 1,
      attempt_log: [{ outcome: 'breaker', progress: true }],
    });
  });
});

describe('the trips that are not a ceiling never go on by themselves, even with a new commit on the branch', () => {
  const noProgressMeasured = async (kingdom: Bench, title: string, trip: string) => {
    const quest = await kingdom.quest(title);
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log.every((entry) => entry.progress === undefined)).toBe(true);
    expect(kingdom.notices).toEqual([expect.objectContaining({ kind: 'infirmary', trip })]);
    const sessions = assigneeSessions(kingdom).length;
    await running?.tick();
    await running?.tick();
    expect(assigneeSessions(kingdom)).toHaveLength(sessions);
    expect((await kingdom.quest(title)).status).toBe('infirmary');
  };

  it('commit: the territory hook refuses the work of a submit', async () => {
    const refusing = (k: Bench) =>
      plotsWith(k.root, { head: movingTip(), commit: () => Promise.reject(new Error('husky refused')) });
    const { kingdom, steward } = await open({}, (k) => ({ plots: refusing(k) }));
    await kingdom.command('create_quest', questPayload('Refused'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Refused', 'infirmary'));
    await noProgressMeasured(kingdom, 'Refused', 'commit');
  });

  it('forbidden_paths: a program of the session wrote under a forbidden path', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      plots: plotsWith(k.root, {
        head: movingTip(),
        touched: () => Promise.resolve(['infra/secrets/key.txt']),
      }),
    }));
    await kingdom.store.territories.update('dc1-se-team' as never, (territory) =>
      ok({ ...territory, laws: { ...territory.laws, forbidden_paths: ['infra/secrets/**'] } }),
    );
    await kingdom.command('create_quest', questPayload('Forbidden'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Forbidden', 'infirmary'));
    await noProgressMeasured(kingdom, 'Forbidden', 'forbidden_paths');
  });

  it('secrets: the treasury lacks one the quest asks for', async () => {
    const { kingdom, steward } = await open({ treasury: {} }, (k) => ({
      plots: plotsWith(k.root, { head: movingTip(), commit: () => Promise.resolve(CLEAN) }),
    }));
    await kingdom.command('create_quest', questPayload('Secret', { secrets_required: ['npm_token'] }));
    await steward.tick();
    await noProgressMeasured(kingdom, 'Secret', 'secrets');
  });

  it('no_session: the CLI of the tribe is gone', async () => {
    const gone = (fake: Bench['runners']['claude']) => ({
      ...fake,
      spawn: () => Promise.reject(new Error('the CLI is gone')),
    });
    const { kingdom, steward } = await open({}, (k) => ({
      runners: { claude: gone(k.runners.claude), gemini: gone(k.runners.gemini) },
      plots: plotsWith(k.root, { head: movingTip() }),
    }));
    await kingdom.command('create_quest', questPayload('Gone'));
    await steward.tick();
    await noProgressMeasured(kingdom, 'Gone', 'no_session');
  });
});
