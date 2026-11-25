// `quest show` says the budget, the ceilings in force and the stamina bar (PS-28b): the ceilings computed as the
// breakers compute them, with the reason when they are not the budget; the bar folded from the journal's notch lines,
// ten cells with the reminder mark, then the sentence that it measures the way to the cut, not the work left.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../__fixtures__/quest.ts';
import { ended, journal, moved, notch, started } from '../__fixtures__/stamina.ts';
import { barText } from './stamina-view.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const AT = '2026-11-06T08:30:00+07:00';
const LEGEND = 'Stamina measures how far the session is from being cut, not how much work is left.';
/** The estimate times the default factor 1.82 is above the budget of 400 000; the budget at creation was 600 000. */
const BIG = { estimate: { tokens: 300_000, minutes: 30 } };
const entry = (role: 'assignee' | 'verifier', character: string, session: string, ended_at?: string) => ({
  n: 1,
  character,
  role,
  started_at: AT,
  session_id: session,
  run_dir: role === 'verifier' ? `.runs/${QUEST_ID}-1/verify` : `.runs/${QUEST_ID}-1`,
  ...(ended_at === undefined ? {} : { ended_at, outcome: 'submitted' }),
});
const WORKING = { ...BIG, assignee: 'thorn', attempts: 1, attempt_log: [entry('assignee', 'thorn', 's-1')] };

describe('the stamina bar', () => {
  it('draws ten cells of what is left, with the reminder mark between two of them', () => {
    expect(barText(100, 43.3)).toBe('████|██████');
    expect(barText(26.7, 43.3)).toBe('███░|░░░░░░');
    expect(barText(0, 43.3)).toBe('░░░░|░░░░░░');
    expect(barText(70.4, undefined)).toBe('███████░░░');
  });
});

describe('elvaria quest show: budget, ceilings in force and stamina', () => {
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

  const show = async () => {
    const io = testIo();
    expect(await run(io, 'quest', 'show', QUEST_ID, '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    return io.printed.out;
  };

  it('prints the budget and the ceilings by the budget while nobody holds a seat, and no stamina', async () => {
    await plantQuests(kingdom, questFixture('open'));
    const out = await show();
    expect(out.find((line) => line.startsWith('Budget'))).toMatch(
      /^Budget +400000 tokens · 45 minutes · 3 attempts$/,
    );
    expect(out.join('\n')).toContain(
      [
        'Ceilings in force, computed as the breakers compute them. At the mark the assignee is told to wrap up and your bell rings; at the cut the session is stopped:',
        '  Assignee (none yet): 400000 tokens (mark 340000, cut at 600000) · 45 minutes (mark 38.3, cut at 67.5)',
        '    The token ceiling still depends on the tribe of whoever takes the seat; until then the breakers go by the budget. A --max-tokens raise takes effect from 400001 up.',
        '  Judge (none chosen yet): 800000 tokens (mark 680000, cut at 1200000) · 45 minutes (mark 38.3, cut at 67.5)',
        "    The token ceiling still depends on the tribe of whoever takes the seat; until then the breakers go by the budget. A judge's token ceiling is 2 times that (verifier_tokens_multiplier): it reads the whole diff and runs the checks again. A --max-tokens raise takes effect from 400001 up.",
      ].join('\n'),
    );
    expect(out.some((line) => line.startsWith('Stamina'))).toBe(false);
  });

  it("prints the working session's bar from its three notch lines, past the mark, and the calibrated ceiling", async () => {
    const quest = questFixture('working', QUEST_ID, WORKING);
    await plantQuests(kingdom, quest);
    const tokens = (used: number) =>
      notch(quest, 's-1', { role: 'assignee', measure: 'tokens', used, limit: 546_000 });
    const last = tokens(600_000);
    await journal(kingdom, quest, [
      moved(quest, 'quest.started', 'working', 's-1'),
      started(quest, 's-1', 'thorn'),
      tokens(100_000),
      tokens(300_000),
      last,
    ]);
    const out = await show();
    const at = out.indexOf(
      '  Assignee thorn (tribe claude): 546000 tokens (mark 464100, cut at 819000) · 45 minutes (mark 38.3, cut at 67.5)',
    );
    expect(at).toBeGreaterThan(0);
    expect(out[at + 1]).toBe(
      "    The token ceiling is not the budget's 400000: the breakers take the estimate of 300000 tokens times the claude tribe's factor 1.82 (the default, as the tribe has 0 of the 10 measured runs it needs). A --max-tokens raise takes effect from 600001 up.",
    );
    const bar = out.findIndex((line) => line.startsWith('Stamina'));
    expect(out.slice(bar, bar + 2)).toEqual([
      `Stamina: ███░|░░░░░░ 27 % left · assignee thorn's session · tokens gauge: 600000 of 546000, cut at 819000 (notch line at ${last.ts}) · past the reminder mark`,
      LEGEND,
    ]);
  });

  it("prints a judge's bar without the mark, and its ceiling times verifier_tokens_multiplier", async () => {
    const judged = {
      ...BIG,
      assignee: 'thorn',
      verifier: 'sable',
      attempts: 1,
      attempt_log: [entry('assignee', 'thorn', 's-1', AT), entry('verifier', 'sable', 's-2')],
    };
    const quest = questFixture('review', QUEST_ID, judged);
    await plantQuests(kingdom, quest);
    const line = notch(quest, 's-2', { role: 'verifier', measure: 'time', used: 20, limit: 45 });
    await journal(kingdom, quest, [moved(quest, 'quest.submitted', 'review', 's-2'), line]);
    const out = await show();
    expect(out).toContain(
      '  Judge sable (tribe claude): 1092000 tokens (mark 928200, cut at 1638000) · 45 minutes (mark 38.3, cut at 67.5)',
    );
    expect(out).toContain(
      `Stamina: ███████░░░ 70 % left · judge sable's session · minutes gauge: 20 of 45, cut at 67.5 (notch line at ${line.ts})`,
    );
  });

  it('says the session before was cut and gone on from, on a full bar of its own', async () => {
    const quest = questFixture('working', QUEST_ID, {
      ...WORKING,
      attempt_log: [
        { ...entry('assignee', 'thorn', 's-1', AT), outcome: 'breaker' },
        entry('assignee', 'thorn', 's-2'),
      ],
    });
    await plantQuests(kingdom, quest);
    await journal(kingdom, quest, [
      moved(quest, 'quest.started', 'working', 's-1'),
      started(quest, 's-1', 'thorn'),
      notch(quest, 's-1', { role: 'assignee', measure: 'tokens', used: 800_000, limit: 546_000 }),
      ended(quest, 's-1', 'thorn', 'killed'),
      moved(quest, 'quest.returned', 'returned'),
      moved(quest, 'quest.started', 'working', 's-2'),
      started(quest, 's-2', 'thorn'),
    ]);
    const out = await show();
    const bar = out.findIndex((line) => line.startsWith('Stamina'));
    expect(out.slice(bar, bar + 3)).toEqual([
      "Stamina: ████|██████ 100 % left · assignee thorn's session · no notch line yet: a fresh session starts full",
      LEGEND,
      "The session before in run 1 was cut on its tokens gauge. Its committed work stays. This session read the handover letter and git again, so its stamina is full again, but the last session's memory is gone.",
    ]);
  });

  it('draws no bar when the quest file says no session runs, whatever its journal last said', async () => {
    const quest = questFixture('returned', QUEST_ID, {
      ...WORKING,
      attempt_log: [entry('assignee', 'thorn', 's-1', AT)],
    });
    await plantQuests(kingdom, quest);
    await journal(kingdom, quest, [
      moved(quest, 'quest.started', 'working', 's-1'),
      started(quest, 's-1', 'thorn'),
    ]);
    expect((await show()).some((line) => line.startsWith('Stamina'))).toBe(false);
  });
});
