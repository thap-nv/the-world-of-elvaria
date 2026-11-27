// (88) of the owner's settlements, (5) of fix/amendment-flow (fix/session-notes): a run that ends on its amendment
// with work the Steward could not take (its patch refused, or its submit commit refused by a hook) leaves the quest
// waiting with the work uncommitted in the plot. The reason goes on the quest's blocked line, and the session after
// the decision reads it, as a session after the infirmary reads a refused patch (P1-31): resumed, after the
// decision; fresh, in its continuation. A later wait of the same run, its work committed, says nothing of it.
import { openEventLog } from '@elvaria/eventlog';
import type { Event, TerritoryId } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { authorJob } from '../__fixtures__/author.ts';
import { PASS, bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { letter, writing } from '../__fixtures__/letters.ts';
import { plotsWith, statusIs } from '../__fixtures__/review.ts';
import type { Decide } from '../__fixtures__/author.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Letters } from '../__fixtures__/letters.ts';
import type { Plots, Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

interface Setup {
  readonly title: string;
  readonly letters: Letters;
  readonly plots?: (kingdom: Bench) => Partial<Plots>;
  /** laws.patch_paths of dc1-se-team, when its assignees may leave a patch. */
  readonly patchPaths?: readonly string[];
  /** False: the tribe's adapter cannot resume, so the session after the decision is a fresh one. */
  readonly resume?: boolean;
}

const accept: Decide = () => ({ decision: 'accepted', note: 'Đúng: tách file spec là việc của quest này.' });

async function open({ title, letters, plots = () => ({}), patchPaths, resume = true }: Setup) {
  current = await bench({ plays: { verdicts: { [title]: [PASS] } } });
  const made = current;
  if (patchPaths !== undefined) {
    const read = await made.store.territories.read('dc1-se-team' as TerritoryId);
    if (!read.ok) throw new Error('fixture: no territory');
    await made.store.territories.write({
      ...read.value,
      laws: { ...read.value.laws, patch_paths: [...patchPaths] },
    });
  }
  const claude = writing(made.runners.claude, letters, () => undefined);
  const capabilities = { ...claude.capabilities, resume };
  const runners = {
    claude: { ...claude, capabilities },
    gemini: writing(made.runners.gemini, letters, () => undefined),
  };
  const job = authorJob(() => made, accept);
  running = made.steward({ runners, onCall: [job], plots: plotsWith(made.root, plots(made)) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: made, steward: running };
}

const AMENDMENT =
  '- amendment: Đề bài: chỉ sửa src/. Đề nghị: tách breakers.spec.ts (309 dòng, lint đỏ). refs: package.json';
const AGAIN = '- amendment: Đề bài vẫn sai: README không có mục cài đặt. refs: README.md';
const HOOK = 'max-lines: breakers.spec.ts has 309 lines (300 allowed)';
const CHANCELLOR = { created_by: 'chancellor', scope_paths: ['src/**'] };
const COMMIT_HEADING = '## The commit that was refused';
const PATCH_HEADING = '## The patch that was not applied';
const DECISION_HEADING = '## The decision on your amendment';
const fencedText = (text: string) => `\`\`\`text\n${text}\n\`\`\``;

const blockedLines = async (kingdom: Bench): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter(({ type }) => type === 'quest.blocked');
const assigneeRuns = (kingdom: Bench, title: string) =>
  kingdom.requests.filter(({ role, quest }) => role === 'assignee' && quest?.title === title);

/** The hook refuses the submit commits of `title` numbered in `refusing` (1-based), as commitPlot sees its exit. */
function refusingCommits(kingdom: Bench, title: string, refusing: readonly number[]): Partial<Plots> {
  let submits = 0;
  const base = plotsWith(kingdom.root, {});
  return {
    commit: async (plot, message, rescue) => {
      const quest = await kingdom.quest(title);
      if (message.includes('submit') && quest.plot.branch === plot.branch) {
        submits += 1;
        if (refusing.includes(submits)) throw new Error(HOOK);
      }
      return base.commit(plot, message, rescue);
    },
  };
}

describe('a run that ended on its amendment with its commit refused', () => {
  it('says why on the blocked line, and the resumed session reads it after the decision', async () => {
    const { kingdom, steward } = await open({
      title: 'Refused',
      letters: (title, nth) => letter(title === 'Refused' && nth === 1 ? AMENDMENT : '-'),
      plots: (k) => refusingCommits(k, 'Refused', [1]),
    });
    await kingdom.command('create_quest', questPayload('Refused', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Refused', 'done'));
    const [blocked, ...others] = await blockedLines(kingdom);
    expect(others).toEqual([]);
    expect(blocked?.data).toMatchObject({ refused_commit: HOOK });
    expect(blocked?.data).not.toHaveProperty('refused_patch');
    const [first, next] = assigneeRuns(kingdom, 'Refused');
    expect(first?.prompt.user).not.toContain(COMMIT_HEADING);
    expect(next?.resume).toBeDefined();
    const user = next?.prompt.user ?? '';
    expect(user).toMatch(/^# Going on/);
    expect(user).toContain(fencedText(HOOK));
    expect(user).toContain('That work is still in your plot, staged and uncommitted.');
    expect(user.indexOf(DECISION_HEADING)).toBeGreaterThan(-1);
    expect(user.indexOf(DECISION_HEADING)).toBeLessThan(user.indexOf(COMMIT_HEADING));
  });

  it('is read by a fresh session in its continuation, after the revival', async () => {
    const { kingdom, steward } = await open({
      title: 'Fresh',
      letters: (title, nth) => letter(title === 'Fresh' && nth === 1 ? AMENDMENT : '-'),
      plots: (k) => refusingCommits(k, 'Fresh', [1]),
      resume: false,
    });
    await kingdom.command('create_quest', questPayload('Fresh', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Fresh', 'done'));
    const next = assigneeRuns(kingdom, 'Fresh')[1];
    expect(next?.resume).toBeUndefined();
    const user = next?.prompt.user ?? '';
    expect(user).toContain(fencedText(HOOK));
    expect(user.indexOf('# Picking up the quest')).toBeGreaterThan(-1);
    expect(user.indexOf('# Picking up the quest')).toBeLessThan(user.indexOf(COMMIT_HEADING));
    expect(user.indexOf(COMMIT_HEADING)).toBeLessThan(user.indexOf(DECISION_HEADING));
  });

  it('is not read again after a later wait of the same run whose work was committed', async () => {
    const { kingdom, steward } = await open({
      title: 'Twice',
      letters: (_, nth) => letter(nth === 1 ? AMENDMENT : nth === 2 ? AGAIN : '-'),
      plots: (k) => refusingCommits(k, 'Twice', [1]),
    });
    await kingdom.command('create_quest', questPayload('Twice', CHANCELLOR));
    const toOwner = async () => (await kingdom.quest('Twice')).blocked?.amendment?.by === 'owner';
    await tickUntil(steward, kingdom.clock, toOwner);
    const quest = await kingdom.quest('Twice');
    await kingdom.command('decide_memo', {
      memo: quest.blocked?.amendment?.memo,
      decision: 'rejected',
      note: 'Giữ đề.',
    });
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Twice', 'done'));
    const lines = await blockedLines(kingdom);
    expect(lines.map(({ attempt, data }) => [attempt, data.refused_commit])).toEqual([
      [1, HOOK],
      [1, undefined],
    ]);
    const [, second, third] = assigneeRuns(kingdom, 'Twice').map(({ prompt }) => prompt.user);
    expect(second).toContain(COMMIT_HEADING);
    expect(third).toContain('The owner answered it:');
    expect(third).not.toContain(COMMIT_HEADING);
  });
});

describe('a run that ended on its amendment with its patch refused', () => {
  it('says why on the blocked line, and the session after the decision reads it', async () => {
    const { kingdom, steward } = await open({
      title: 'Patched',
      letters: (title, nth) => letter(title === 'Patched' && nth === 1 ? AMENDMENT : '-'),
      plots: (k) => {
        let refused = false;
        return {
          applyPatch: (plot, paths) => {
            if (refused) return plotsWith(k.root, {}).applyPatch(plot, paths);
            refused = true;
            return Promise.resolve({
              status: 'refused',
              detail: 'it does not apply',
              reason: { code: 'breaker:patch_conflict', params: { file: 'elvaria.patch' } },
            });
          },
        };
      },
      patchPaths: ['.husky/**'],
    });
    await kingdom.command('create_quest', questPayload('Patched', CHANCELLOR));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Patched', 'done'));
    const [blocked] = await blockedLines(kingdom);
    expect(blocked?.data).toMatchObject({ refused_patch: 'it does not apply' });
    expect(blocked?.data).not.toHaveProperty('refused_commit');
    const user = assigneeRuns(kingdom, 'Patched')[1]?.prompt.user ?? '';
    expect(user).toContain(PATCH_HEADING);
    expect(user).toContain('the Steward did not apply it, so nothing of that session was committed');
    expect(user).toContain(fencedText('it does not apply'));
    expect(user).not.toContain(COMMIT_HEADING);
  });
});
