// `quest edit --max-tokens` says what the new figure does (PS-28b, TL5): the command is sent whatever the figure, then
// the CLI computes the ceiling before and after on the edited quest. With the default factor 1.82 below
// mana_multiplier 2, thorn's session on a quest estimated at 300 000 tokens is held to 546 000, and a budget counts as a
// raise only above the 600 000 the quest was created with.
import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import { journal, notch } from '../__fixtures__/stamina.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const AT = '2026-11-06T08:30:00+07:00';
const BIG = { estimate: { tokens: 300_000, minutes: 30 } };
const entry = (role: 'assignee' | 'verifier', character: string, ended_at?: string) => ({
  n: 1,
  character,
  role,
  started_at: AT,
  run_dir: role === 'verifier' ? `.runs/${QUEST_ID}-1/verify` : `.runs/${QUEST_ID}-1`,
  ...(ended_at === undefined ? {} : { ended_at, outcome: 'submitted' }),
});
const WORKING = { ...BIG, assignee: 'thorn', attempts: 1, attempt_log: [entry('assignee', 'thorn')] };
/** The owner raised it to a million before: the ceiling is the raise. */
const RAISED = { ...WORKING, budget: { max_minutes: 45, max_tokens: 1_000_000, max_attempts: 3 } };

describe('elvaria quest edit --max-tokens', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    for (const [id, cls] of [
      ['thorn', 'knight'],
      ['sable', 'judge'],
    ] as const)
      await run(testIo(), 'character', 'add', id, '--class', cls, '--tribe', 'claude', '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  const said = async (tokens: number) => {
    const io = testIo();
    const args = [
      'quest',
      'edit',
      QUEST_ID,
      '--max-tokens',
      String(tokens),
      '--kingdom',
      kingdom,
      '--locale',
      'en',
    ];
    expect(await run(io, ...args)).toBe(0);
    return io.printed.out.slice(1).filter((line) => !line.startsWith('Command '));
  };
  const sent = async () =>
    (await openKingdom(kingdom).inbox.read()).flatMap(({ command }) =>
      command.ok && command.value.kind === 'edit_quest' ? [command.value.payload.changes] : [],
    );

  it('sends a figure that lifts nothing, says so, and names the smallest one that would', async () => {
    await plantQuests(kingdom, questFixture('working', QUEST_ID, WORKING));
    expect(await said(580_000)).toEqual([
      "The new token budget 580000 changes nothing: assignee thorn's session is still held to 546000 tokens (the estimate times the claude tribe's factor). The smallest budget that lifts it is 600001. The command was sent all the same: the figure stays a valid budget for later sessions, once the tribe's factor moves.",
    ]);
    expect(await sent()).toEqual([{ budget: { max_tokens: 580_000 } }]);
  });

  it('gives the running session the raised ceiling from the next tick, with the figure it is cut past', async () => {
    await plantQuests(kingdom, questFixture('working', QUEST_ID, WORKING));
    expect(await said(700_000)).toEqual([
      `Quest ${QUEST_ID} has a session running: from the Steward's next tick it may use up to 700000 tokens (was 546000), and is cut past 1050000.`,
    ]);
  });

  it('warns when the running session already used more than the new cut, and only lowers it otherwise', async () => {
    const quest = questFixture('working', QUEST_ID, RAISED);
    await plantQuests(kingdom, quest);
    await journal(kingdom, quest, [
      notch(quest, 's-1', { role: 'assignee', measure: 'tokens', used: 300_000, limit: 1_000_000 }),
    ]);
    expect(await said(100_000)).toEqual([
      `Quest ${QUEST_ID} has a session running: from the Steward's next tick its ceiling is 546000 tokens (was 1000000), and it is cut past 819000.`,
    ]);
    await journal(kingdom, quest, [
      notch(quest, 's-1', { role: 'assignee', measure: 'tokens', used: 900_000, limit: 1_000_000 }),
    ]);
    expect(await said(100_000)).toEqual([
      `Warning: the session working quest ${QUEST_ID} has used at least 900000 tokens, past the new cut at 819000: the Steward cuts it at its next tick, as the token breaker does. If it made progress, a fresh session goes on from its commit.`,
    ]);
  });

  it("holds a judge to its own ceiling, the budget's times verifier_tokens_multiplier", async () => {
    const judged = {
      ...RAISED,
      verifier: 'sable',
      attempt_log: [entry('assignee', 'thorn', AT), entry('verifier', 'sable')],
    };
    const quest = questFixture('review', QUEST_ID, judged);
    await plantQuests(kingdom, quest);
    await journal(kingdom, quest, [
      notch(quest, 's-2', { role: 'verifier', measure: 'tokens', used: 1_700_000, limit: 2_000_000 }),
    ]);
    expect(await said(100_000)).toEqual([
      `Warning: the judge's session on quest ${QUEST_ID} has used at least 1700000 tokens, past the new cut at 1638000: the Steward cuts it at its next tick; the judge leaves and the next one takes the review, under the new ceiling.`,
    ]);
  });

  it('says nothing of a session when none runs: only a figure that lifts nothing for the next one', async () => {
    const returned = { ...WORKING, attempt_log: [entry('assignee', 'thorn', AT)] };
    await plantQuests(kingdom, questFixture('returned', QUEST_ID, returned));
    expect(await said(700_000)).toEqual([]);
    expect(await said(580_000)).toEqual([
      "The new token budget 580000 changes nothing: assignee thorn's next session is still held to 546000 tokens (the estimate times the claude tribe's factor). The smallest budget that lifts it is 600001. The command was sent all the same: the figure stays a valid budget for later sessions, once the tribe's factor moves.",
    ]);
    await plantQuests(kingdom, questFixture('open', QUEST_ID, BIG));
    expect(await said(580_000)).toEqual([]);
    expect(await said(400_000)).toEqual([]);
  });
});
