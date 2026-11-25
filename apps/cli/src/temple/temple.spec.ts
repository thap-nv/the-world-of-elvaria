// PS-12f: `elvaria temple run`, with a scripted Monk (no mana). It reads the evidence pack, asks one session with no
// tool, and leaves one temple_report in the inbox: a rung `scripture` becomes a line the next session of an assignee
// loads. Nothing to decide calls no model; a text reply that breaks the contract is tried once more, both sessions
// counted; a reply that cannot be used writes no command; each run writes `temple.ran`. No Monk, or a held tribe:
// no session.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseScripture, selectLessons } from '@elvaria/domain';
import type { TribeHold } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, tempDir, testIo } from '../__fixtures__/cli.ts';
import {
  FAILED,
  HOLD,
  LETTER_AND_LINE_REPLY,
  LETTER_REPLY,
  LINE_REPLY,
  LINE_TEXT,
  MONK_TOKENS,
  addMonk,
  fenced,
  inboxOf,
  monkRunner,
  stageFailures,
  stewardOf,
  templeRanOf,
} from '../__fixtures__/temple.ts';
import { templeRunCommand } from './run.ts';
import type { TempDir, TestIo } from '../__fixtures__/cli.ts';
import type { MonkRunner } from '../__fixtures__/temple.ts';

describe('elvaria temple run (PS-12f)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const cli = (io: TestIo) => ({ io, locale: 'en' as const, localeFromFlag: true, t: translator('en') });
  const templeRun = (io: TestIo, runner: MonkRunner, holds: readonly TribeHold[] = []) =>
    templeRunCommand({
      runnersOf: () => ({ [runner.tribe]: runner }),
      holdsOf: () => Promise.resolve(holds),
    }).run({ values: { kingdom }, positionals: [] }, cli(io));

  async function stewardTick(): Promise<void> {
    const steward = await stewardOf(kingdom, testIo());
    const report = await steward.tick();
    await steward.stop();
    expect(report.commands.rejected).toBe(0);
  }

  it('calls no model when nothing repeats, and still writes temple.ran with 0 tokens', async () => {
    await addMonk(kingdom);
    const runner = monkRunner([{ structured: LETTER_REPLY }]);
    const io = testIo();
    expect(await templeRun(io, runner)).toBe(0);
    expect(io.printed.out).toEqual([
      'Nothing for the Temple to decide: no repeated failure and no line worth a review. No model was called.',
    ]);
    expect(runner.heard).toEqual([]);
    const [ran] = await templeRanOf(kingdom);
    expect(ran?.actor).toEqual({ kind: 'user' });
    expect(ran?.data).toEqual({
      trigger: 'owner',
      evidence_hash: ran?.data.evidence_hash,
      day: ran?.ts.slice(0, 10),
      groups: 0,
      operations: 0,
      letters: 0,
      tokens: 0,
    });
    expect(ran?.data.evidence_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('turns rung scripture into one temple_report, whose line the next session of an assignee loads', async () => {
    await stageFailures(kingdom);
    await addMonk(kingdom);
    const runner = monkRunner([{ structured: LINE_REPLY }]);
    const io = testIo();
    expect(await templeRun(io, runner)).toBe(0);
    expect(io.printed.out).toEqual([
      'Monk Sage reads 1 repeated failures and 0 lines worth a review…',
      "The Temple's report is in the inbox: 1 operations on scripture, 0 letters. The Steward applies it at its next tick.",
    ]);
    const [request] = runner.heard;
    expect(request).toMatchObject({ role: 'monk', budget: { max_turns: 3, max_minutes: 10 } });
    expect(request?.permissions.tools).toEqual([]);
    expect(request?.prompt.user).toContain('pnpm test fails: the new handler has no test.');
    const [command] = await inboxOf(kingdom);
    expect(command).toMatchObject({ kind: 'temple_report', source: 'monk' });
    expect(command?.payload).toEqual({
      character: 'sage',
      operations: [
        {
          op: 'add',
          owner: 'temple',
          scope: { role: ['assignee'] },
          fail_kind: 'tests_fail',
          text: LINE_TEXT,
          source_verdict: FAILED,
        },
      ],
      letters: [],
    });
    const [ran] = await templeRanOf(kingdom);
    expect(ran?.actor).toEqual({ kind: 'character', id: 'sage' });
    expect(ran?.data).toMatchObject({ trigger: 'owner', groups: 1, operations: 1, letters: 0 });
    expect(ran?.data).toMatchObject({ tribe: 'gemini', tokens: MONK_TOKENS, session: 'monk-1' });

    await stewardTick();
    const text = await readFile(path.join(kingdom, 'temple', 'scripture.md'), 'utf8');
    const lines = parseScripture(text, 'temple').lessons;
    const vocabulary = { classes: ['knight'], tribes: ['claude'], territories: ['dc1'], tags: [] };
    const session = {
      role: 'assignee' as const,
      class: 'knight',
      tribe: 'claude',
      os: 'win32',
      territory: 'dc1',
      tags: [],
    };
    expect(selectLessons(lines, session, vocabulary).loaded.map((line) => line.text)).toEqual([LINE_TEXT]);
    expect(selectLessons(lines, { ...session, role: 'verifier' }, vocabulary).loaded).toEqual([]);
  });

  it('tries a text reply that breaks the contract once more, and counts both sessions', async () => {
    await stageFailures(kingdom);
    await addMonk(kingdom);
    const answers = [{ text: fenced(LETTER_AND_LINE_REPLY) }, { text: fenced(LETTER_REPLY) }];
    const runner = monkRunner(answers, 'gemini', false);
    expect(await templeRun(testIo(), runner)).toBe(0);
    expect(runner.heard).toHaveLength(2);
    expect(runner.heard[1]?.prompt.user).toContain('rung check takes a letter only');
    const [command] = await inboxOf(kingdom);
    expect(command?.payload).toMatchObject({
      operations: [],
      letters: [{ rung: 'check', to: 'chancellor' }],
    });
    const [ran] = await templeRanOf(kingdom);
    expect(ran?.data).toMatchObject({
      operations: 0,
      letters: 1,
      tokens: 2 * MONK_TOKENS,
      session: 'monk-1',
    });
  });

  it('writes no command when the reply cannot be used, and still counts the session', async () => {
    await stageFailures(kingdom);
    await addMonk(kingdom);
    const io = testIo();
    expect(await templeRun(io, monkRunner([{ structured: LETTER_AND_LINE_REPLY }]))).toBe(1);
    expect(io.printed.err[0]).toBe(
      "The Monk gave no reply to use (invalid_reply). Nothing went to the inbox; the session's tokens are counted, and the Temple runs again at its next trigger.",
    );
    expect(io.printed.err).toContain('  decisions.0.letter: rung check takes a letter only');
    expect(await inboxOf(kingdom)).toEqual([]);
    const [ran] = await templeRanOf(kingdom);
    expect(ran?.data).toMatchObject({ groups: 1, operations: 0, letters: 0, tokens: MONK_TOKENS });
  });

  it('opens no session without a Monk, nor when its tribe is held', async () => {
    await stageFailures(kingdom);
    const runner = monkRunner([{ structured: LETTER_REPLY }]);
    const alone = testIo();
    expect(await templeRun(alone, runner)).toBe(1);
    expect(alone.printed.err).toEqual([
      'No Monk can run the Temple: no character of a Monk class that is not suspended and whose tribe works. Add one: elvaria character add <id> --class monk --model <model>',
    ]);
    await addMonk(kingdom);
    const held = testIo();
    expect(await templeRun(held, runner, [HOLD])).toBe(1);
    expect(held.printed.err[0]).toBe("The Monk's tribe is held by its CLI's version; no session opened:");
    expect(runner.heard).toEqual([]);
    expect(await templeRanOf(kingdom)).toEqual([]);
  });
});
