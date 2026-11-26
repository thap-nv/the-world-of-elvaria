// One heal per run in the Steward (ADR 0034, HL-02): a submit commit the territory's hooks refuse goes back, with no
// bell and nothing asked of the owner, to a fresh session of the same character in the same run, whose prompt carries
// the hook's log; the commit after it sends the quest to review, a second refusal to the infirmary with the bell and
// both logs. kingdom.heal.enabled false keeps every refusal for the infirmary.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isEventOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { CLEAN, movingTip } from '../__fixtures__/cuts.ts';
import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { plotsWith, statusIs } from '../__fixtures__/review.ts';
import { HEAL_LOG_MAX_CHARS } from './continuation.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';
import { hookOutputHead } from '@elvaria/runner-core';
import type { CommitOutcome } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const HOOK = ['husky - pre-commit script failed (code 1)', 'src/app.ts', '  3:7  error  no-unused-vars'];
/** A long lint run: the first lines are the ones the heal reads, cut at HEAL_LOG_MAX_CHARS. */
const LONG = [
  ...HOOK,
  ...Array.from({ length: 120 }, (_, at) => `  ${at + 4}:1  error  max-len and more words`),
];

/** The plots of a territory whose hooks refuse the first `refusals` submit commits, then take the work. */
function refusing(kingdom: Bench, refusals: number) {
  let commits = 0;
  const commit = (): Promise<CommitOutcome> => {
    commits += 1;
    return commits <= refusals ? Promise.reject(new Error(LONG.join('\n'))) : Promise.resolve(CLEAN);
  };
  return plotsWith(kingdom.root, { head: movingTip(), commit });
}

async function open(refusals: number, heal = true) {
  current = await bench();
  const settings = await current.store.kingdom.read();
  if (!settings.ok) throw new Error('fixture: kingdom.json');
  await current.store.kingdom.write({ ...settings.value, heal: { ...settings.value.heal, enabled: heal } });
  running = current.steward({ plots: refusing(current, refusals) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await current.command('create_quest', questPayload('Linted'));
  return { kingdom: current, steward: running };
}

const assigneeRequests = (kingdom: Bench) => kingdom.requests.filter(({ role }) => role === 'assignee');

async function linesOf(kingdom: Bench, id: string) {
  return (await openJournal(kingdom.root, id).read()).events;
}

describe('a submit the hooks refuse, with kingdom.heal on', () => {
  it('goes back to the same character in the same run, with no bell, and on to review once committed', async () => {
    const { kingdom, steward } = await open(1);
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Linted', 'review'));
    const quest = await kingdom.quest('Linted');
    expect(kingdom.notices).toEqual([]);
    expect(quest.attempts).toBe(1);
    expect(quest.attempt_log.filter(({ role }) => role === 'assignee')).toMatchObject([
      { n: 1, heal: 'due', outcome: 'breaker' },
      { n: 1, heal: 'session' },
    ]);
    const [first, healer] = assigneeRequests(kingdom);
    expect(healer?.character.id).toBe(first?.character.id);
    expect(healer?.run_dir).toBe(first?.run_dir);
    const due = (await linesOf(kingdom, quest.id)).filter((line) => isEventOf(line, 'quest.heal_due'));
    expect(due).toHaveLength(1);
    expect(due[0]?.data).toMatchObject({
      reason: { code: 'breaker:commit_errors', params: { log: `.runs/${quest.id}-1/pre-commit.log` } },
    });
    expect((await linesOf(kingdom, quest.id)).some((line) => line.type === 'quest.infirmary')).toBe(false);
  });

  it("gives the heal session the hook's log, from its first lines, cut at 4 000 characters", async () => {
    const { kingdom, steward } = await open(1);
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Linted', 'review'));
    const [first, healer] = assigneeRequests(kingdom);
    expect(first?.prompt.user).not.toContain('## The commit that was refused');
    const user = healer?.prompt.user ?? '';
    expect(user).toContain('## The commit that was refused');
    expect(user).toContain(HOOK.join('\n'));
    const fenced = /```text\n([\s\S]*?)\n```/u.exec(
      user.slice(user.indexOf('## The commit that was refused')),
    );
    expect(fenced?.[1]?.length).toBeLessThanOrEqual(HEAL_LOG_MAX_CHARS);
    expect(fenced?.[1]).not.toContain(LONG.at(-1));
  });

  it('sends a second refusal of the run to the infirmary, with the bell and both logs', async () => {
    const { kingdom, steward } = await open(2);
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Linted', 'infirmary'));
    const quest = await kingdom.quest('Linted');
    expect(assigneeRequests(kingdom)).toHaveLength(2);
    expect(kingdom.notices).toEqual([expect.objectContaining({ kind: 'infirmary', trip: 'commit' })]);
    const run = `.runs/${quest.id}-1`;
    const sick = (await linesOf(kingdom, quest.id)).findLast((line) => isEventOf(line, 'quest.infirmary'));
    expect(sick?.data).toMatchObject({ reason: { params: { log: `${run}/heal/pre-commit.log` } } });
    for (const log of [`${run}/pre-commit.log`, `${run}/heal/pre-commit.log`])
      expect(await readFile(path.join(kingdom.root, log), 'utf8')).toContain(HOOK[2]);
    await steward.tick();
    expect(assigneeRequests(kingdom)).toHaveLength(2);
  });
});

describe('a submit the hooks refuse, with kingdom.heal off', () => {
  it('goes to the infirmary as before, with the bell, and no session heals it', async () => {
    const { kingdom, steward } = await open(1, false);
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Linted', 'infirmary'));
    const quest = await kingdom.quest('Linted');
    expect(assigneeRequests(kingdom)).toHaveLength(1);
    expect(quest.attempt_log.every(({ heal }) => heal === undefined)).toBe(true);
    expect(kingdom.notices).toEqual([expect.objectContaining({ kind: 'infirmary', trip: 'commit' })]);
  });
});

// HL-05, from the coordinator's run (quest zatpdc, 2026-11-25 12:47): a commit git gave up on (killed at
// GIT_TIMEOUT_MS, or it never started) carries breaker:commit like a hook's refusal, but names no error to mend.
describe('a submit commit git gave up on, with kingdom.heal on', () => {
  it('goes to the infirmary as before, with the bell, and no session heals it', async () => {
    current = await bench();
    const said = 'git commit timed out after 120000 ms';
    const commit = (): Promise<CommitOutcome> =>
      Promise.resolve({ status: 'refused', detail: said, head: hookOutputHead(said), timed_out: true });
    running = current.steward({ plots: plotsWith(current.root, { head: movingTip(), commit }) });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Linted'));
    await tickUntil(running, current.clock, statusIs(current, 'Linted', 'infirmary'));
    const quest = await current.quest('Linted');
    expect(assigneeRequests(current)).toHaveLength(1);
    expect(quest.attempt_log.every(({ heal }) => heal === undefined)).toBe(true);
    expect(current.notices).toHaveLength(1);
    expect(current.notices[0]).toMatchObject({
      kind: 'infirmary',
      trip: 'commit',
      reason: { code: 'breaker:commit' },
    });
  });
});
