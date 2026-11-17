// The screens of a review reach its judge (PS-11b): a quest tagged `visual` (its ritual asks for eyes) gets the machine
// check `screens` after the territory's, and its judge, of a tribe that reads images, gets exactly the images the
// territory's check left in `.runs/<quest>-<n>/screens/`, by policy and in its prompt. A fake capture check stands in
// for Playwright: it writes PNGs of the vision spike's generator where ELVARIA_SCREENS_DIR would point.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { TribeIdSchema } from '@elvaria/domain';
import type { VerdictId } from '@elvaria/domain';
import { SCREEN_MAX_FILES, screensDirOf } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { FAIL, bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { verdictIn } from '../__fixtures__/review.ts';
import { capturingPlots } from '../__fixtures__/screens.ts';
import type { Bench, Plays } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/** thorn (claude) does the work; orin judges, of the gemini tribe, whose runner here reads images. */
async function open(names: readonly string[], plays: Plays = {}) {
  current = await bench({
    cast: [
      { id: 'thorn', cls: 'knight', level: 5 },
      { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-4-argon-medium' },
    ],
    plays,
  });
  const kingdom = current;
  const { gemini } = kingdom.runners;
  const seeing = { ...gemini, capabilities: { ...gemini.capabilities, vision: true } };
  running = kingdom.steward({
    runners: { ...kingdom.runners, [TribeIdSchema.parse('gemini')]: seeing },
    plots: capturingPlots(names)(kingdom.root),
  });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom, steward: running };
}

const VISUAL = { tags: ['frontend', 'visual'] };
/** The verdict of the quest's first run is written. */
const judged = (kingdom: Bench, title: string) => async () => {
  const { id } = await kingdom.quest(title);
  return (await kingdom.store.verdicts.read(`${id}-1` as VerdictId)).ok;
};
const judgeRequests = (kingdom: Bench) => kingdom.requests.filter(({ role }) => role === 'verifier');

describe('the screens of a quest judged by eye (PS-11b)', () => {
  it('reach its judge by policy and in its prompt, and stay in .runs once it is done', async () => {
    const { kingdom, steward } = await open(['home.png', 'home.ref.png']);
    await kingdom.command('create_quest', questPayload('Paint the button', VISUAL));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Paint the button')).status === 'done',
    );
    const quest = await kingdom.quest('Paint the button');
    const dir = inKingdom(kingdom.root, screensDirOf(`.runs/${quest.id}-1`));
    const [request] = judgeRequests(kingdom);
    expect(request?.character.id).toBe('orin');
    expect(request?.permissions.images).toEqual([path.join(dir, 'home.png'), path.join(dir, 'home.ref.png')]);
    expect(request?.prompt.user).toContain('# Screens');
    expect(request?.prompt.user).toContain(`  - reference: \`${path.join(dir, 'home.ref.png')}\``);
    expect(quest.checks_run).toContain('screens');
    expect((await verdictIn(kingdom, `${quest.id}-1`)).checks).toContainEqual(
      expect.objectContaining({ id: 'screens', pass: true }),
    );
    // Outside the plot: the plot is as its commit had it, and the images stay as the evidence of the review.
    expect((await readdir(dir)).sort()).toEqual(['home.png', 'home.ref.png']);
    expect(path.relative(kingdom.root, dir).split(path.sep)[0]).toBe('.runs');
  });

  it('fails the screens check when the checks captured none, and the quest goes back with why', async () => {
    const { kingdom, steward } = await open([]);
    await kingdom.command('create_quest', questPayload('Blind', VISUAL));
    await tickUntil(steward, kingdom.clock, judged(kingdom, 'Blind'));
    const quest = await kingdom.quest('Blind');
    const verdict = await verdictIn(kingdom, `${quest.id}-1`);
    expect(verdict).toMatchObject({ result: 'fail', fail_kind: 'tests_fail' });
    expect(verdict.notes).toContain(`✗ screens: .runs/${quest.id}-1/checks/screens.log`);
    const log = await readFile(inKingdom(kingdom.root, `.runs/${quest.id}-1/checks/screens.log`), 'utf8');
    expect(log).toContain('no check of the territory captured a screen');
    expect(log).toContain('ELVARIA_SCREENS_DIR');
    expect(judgeRequests(kingdom)[0]?.permissions.images).toBeUndefined();
  });

  it('fails it on more images than a review holds, and shows the judge the first of them only', async () => {
    const names = Array.from(
      { length: SCREEN_MAX_FILES + 1 },
      (_, index) => `s-${String(index).padStart(2, '0')}.png`,
    );
    const { kingdom, steward } = await open(names);
    await kingdom.command('create_quest', questPayload('Too many', VISUAL));
    await tickUntil(steward, kingdom.clock, judged(kingdom, 'Too many'));
    const quest = await kingdom.quest('Too many');
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({ result: 'fail' });
    const log = await readFile(inKingdom(kingdom.root, `.runs/${quest.id}-1/checks/screens.log`), 'utf8');
    expect(log).toContain(
      `✗ ${SCREEN_MAX_FILES + 1} images, over the ceiling of ${SCREEN_MAX_FILES} a review`,
    );
    expect(judgeRequests(kingdom)[0]?.permissions.images).toHaveLength(SCREEN_MAX_FILES);
  });

  it("goes back with the judge's note when a screen differs from its reference", async () => {
    const note = 'home.png: the button is blue, its reference home.ref.png shows it red at the top right.';
    const verdicts = { 'Off design': [{ ...FAIL, notes: note }] };
    const { kingdom, steward } = await open(['home.png', 'home.ref.png'], { verdicts });
    await kingdom.command('create_quest', questPayload('Off design', VISUAL));
    await tickUntil(steward, kingdom.clock, judged(kingdom, 'Off design'));
    const quest = await kingdom.quest('Off design');
    expect(await verdictIn(kingdom, `${quest.id}-1`)).toMatchObject({ result: 'fail', notes: note });
    // Returned: the next session of the work reads the note that names the image.
    await tickUntil(steward, kingdom.clock, () =>
      Promise.resolve(kingdom.requests.filter(({ role }) => role === 'assignee').length > 1),
    );
    const [, again] = kingdom.requests.filter(({ role }) => role === 'assignee');
    expect(again?.character.id).toBe('thorn');
    expect(again?.prompt.user).toContain(note);
  });

  it('gives no screens, no check and no image to the judge of a quest not judged by eye', async () => {
    const { kingdom, steward } = await open(['home.png']);
    await kingdom.command('create_quest', questPayload('Plain work', { tags: ['frontend'] }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Plain work')).status === 'done',
    );
    const quest = await kingdom.quest('Plain work');
    expect(quest.checks_run).not.toContain('screens');
    const [request] = judgeRequests(kingdom);
    expect(request?.permissions).not.toHaveProperty('images');
    expect(request?.prompt.user).not.toContain('# Screens');
  });
});
