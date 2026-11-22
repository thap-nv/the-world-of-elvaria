// The gaps the phase-2 council run met (fix/council-run-gaps): a mage shown a tag no judge could see to (a), and a
// plan's sub-quests whose plots lacked the plan file (154) or one side of a diamond (155), on a real git repo.
import path from 'node:path';

import { TribeIdSchema, isEventOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { git } from '../__fixtures__/git-plots.ts';
import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { list, part, partyBench, worktreeOf } from '../__fixtures__/party.ts';
import { PLAN_FILE_PATH } from '../__fixtures__/template.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { PartyBench } from '../__fixtures__/party.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
let party: PartyBench | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await party?.remove();
  running = undefined;
  current = undefined;
  party = undefined;
});

const planPayload = (title: string) =>
  questPayload(title, { kind: 'plan', class_required: 'mage', tags: ['backend'], seal_required: false });

describe("a plan quest's mage and the tag that asks for eyes (fix/council-run-gaps (a))", () => {
  it('lists visual among the words of a sub-quest only once a tribe that works reads images', async () => {
    const tags = async (vision: boolean): Promise<string | undefined> => {
      current = await bench({ cast: [{ id: 'merle', cls: 'mage' }] });
      const { gemini } = current.runners;
      const seeing = { ...gemini, capabilities: { ...gemini.capabilities, vision } };
      running = current.steward({ runners: { ...current.runners, [TribeIdSchema.parse('gemini')]: seeing } });
      expect(await running.start({ loop: false })).toEqual({ ok: true });
      await current.command('create_quest', planPayload('Plan the screens'));
      await running.tick();
      const mage = current.requests.find(({ role }) => role === 'assignee');
      const line = mage?.prompt.user.split('\n').find((text) => text.startsWith('- Tags: frontend'));
      await running.stop();
      await current.remove();
      running = undefined;
      current = undefined;
      return line;
    };
    expect(await tags(false)).not.toContain('visual');
    expect(await tags(true)).toContain('visual');
  });
});

/** A step of a plan that is no party: a knight's build with a scope of its own. */
const step = (ref: string, title: string, fields: Record<string, unknown> = {}) =>
  part(ref, title, { party_role: undefined, contract: undefined, ...fields });

describe("a plan's sub-quests build on what they wait for (fix/council-run-gaps (d))", () => {
  it('starts the first parts on the plan branch, without its list, and merges both sides into a diamond', async () => {
    party = await partyBench({
      'Plan the rooms': {
        [SUBQUESTS_FILE]: list(
          step('d1', 'Left', { scope_paths: ['a/**'] }),
          step('d2', 'Right', { scope_paths: ['b/**'] }),
          step('d3', 'Both', { scope_paths: ['c/**'], depends_on_refs: ['d1', 'd2'] }),
        ),
      },
      Left: { 'a/left.ts': 'export const left = 1;\n' },
      Right: { 'b/right.ts': 'export const right = 2;\n' },
      Both: { 'c/both.ts': 'export const both = 3;\n' },
    });
    const { kingdom, steward } = party;
    await kingdom.command('create_quest', planPayload('Plan the rooms'));
    const done = async () =>
      (await kingdom.quests()).some(({ title, status }) => title === 'Both' && status === 'done');
    await tickUntil(steward, kingdom.clock, done, 300);
    const plan = await kingdom.quest('Plan the rooms');
    const [left, right, both] = await Promise.all(['Left', 'Right', 'Both'].map((t) => kingdom.quest(t)));
    if (left === undefined || right === undefined || both === undefined) throw new Error('three parts');
    // (154): a part that waits for no part waits for the plan, and its plot holds the plan file, not the list.
    expect(left.depends_on).toEqual([plan.id]);
    expect(right.depends_on).toEqual([plan.id]);
    expect(both.depends_on).toEqual([left.id, right.id]);
    expect(git(worktreeOf(plan), 'log', '-1', '--format=%s')).toBe(
      `chore: remove ${SUBQUESTS_FILE} of ${plan.id}, its parts are open`,
    );
    expect(await pathExists(path.join(worktreeOf(left), PLAN_FILE_PATH))).toBe(true);
    expect(await pathExists(path.join(worktreeOf(left), SUBQUESTS_FILE))).toBe(false);
    // (155): the diamond starts on one side and gets the other merged in; its own work is all it is judged on.
    for (const file of [PLAN_FILE_PATH, 'a/left.ts', 'b/right.ts', 'c/both.ts'])
      expect(await pathExists(path.join(worktreeOf(both), file))).toBe(true);
    const { events } = await openEventLog(kingdom.root).read();
    const merged = events.filter((event) => isEventOf(event, 'plot.merged') && event.quest === both.id);
    expect(merged.map(({ data }) => data)).toEqual([
      { into: `quest/${both.id}`, merged: [`quest/${right.id}`], pending: [] },
    ]);
    const submitted = events.find((event) => isEventOf(event, 'quest.submitted') && event.quest === both.id);
    expect(submitted).toBeDefined();
    expect(submitted?.data.out_of_scope ?? []).toEqual([]);
    const judge = kingdom.requests.find(({ role, quest }) => role === 'verifier' && quest?.id === both.id);
    expect(judge?.prompt.user).toContain('c/both.ts');
    expect(judge?.prompt.user).not.toContain('b/right.ts');
    // Four quests on a real repo, as party.spec.ts: a busy machine needs more than the default.
  }, 180_000);
});
