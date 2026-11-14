// What the Steward's commit does for work its character could not tidy (P1-55, (e) of the P1-50 report): a scratch
// file at the plot's root stays out of the submit commit and is set aside in the run's folder; work the territory's
// hook refuses is copied to a patch there, and a quest whose session left no letter gets a minimal one. Real git repos
// and PlotManager; FakeRunners whose assignee leaves files in its plot, and a pre-commit hook that refuses.
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { WIP_PATCH_FILE } from '@elvaria/runner-core';
import type { AgentRunner } from '@elvaria/runner-core';
import { fromPortable, inKingdom, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { leavingRunners } from './__fixtures__/deliver.ts';
import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import { handoverPath } from './files.ts';
import type { Leaves } from './__fixtures__/deliver.ts';
import type { Bench, Plays } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: string[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, RM_TEMP)));
  running = undefined;
  current = undefined;
});

const HOOK = '#!/bin/sh\necho "lint failed: src/app.ts" >&2\nexit 1\n';

const HOOK_LINES = Array.from({ length: 300 }, (_, index) => `echo "error ${index}: lint failed" >&2`);
const LONG_HOOK = `#!/bin/sh\n${HOOK_LINES.join('\n')}\nexit 1\n`;

/** The fake session writes its letter when it starts; this one's is gone once it ends, as when a session was cut. */
const withoutLetter = (runner: AgentRunner): AgentRunner => ({
  ...runner,
  spawn: async (req) => {
    const session = await runner.spawn(req);
    return {
      ...session,
      wait: async () => {
        const result = await session.wait();
        if (req.role === 'assignee' && req.handover !== undefined) await rm(req.handover, { force: true });
        return result;
      },
    };
  },
});

interface Options {
  /** The repo's pre-commit hook, which refuses everything when it is the given script. */
  readonly hook?: string;
  /** false: the session ends with no letter in the kingdom. */
  readonly letter?: boolean;
  readonly plays?: Plays;
}

/** dc1-se-team on a git repo, its assignee leaving `leaves` in the plot. */
async function open(leaves: Leaves, { hook, letter = true, plays = {} }: Options = {}) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria letter repo '));
  folders.push(repo);
  await gitRepoWith(repo, { 'src/app.ts': 'export const app = 1;\n' });
  if (hook !== undefined) {
    const file = path.join(repo, '.git', 'hooks', 'pre-commit');
    await writeFile(file, hook);
    await chmod(file, 0o755);
  }
  current = await bench({ plays });
  await onRepo(current, repo, []);
  const made = leavingRunners(current, leaves);
  const runners = letter ? made : { claude: withoutLetter(made.claude), gemini: withoutLetter(made.gemini) };
  running = current.steward({ plots: gitPlots(current.root), runners });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, repo };
}

const WORK = { 'src/app.ts': 'export const app = 2;\n' };

describe('a scratch file at the plot root (P1-55)', () => {
  it('stays out of the submit commit, and is set aside in the run folder', async () => {
    const { kingdom, steward, repo } = await open(() => ({ ...WORK, 'quests-handover-tmp.txt': 'x\n' }));
    await kingdom.command('create_quest', questPayload('Careless knight'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Careless knight', 'done'));

    const quest = await kingdom.quest('Careless knight');
    const worktree = fromPortable(quest.plot.path ?? '');
    expect(git(repo, 'show', '--name-only', '--format=', `quest/${quest.id}`)).toBe('src/app.ts');
    // Moved, not deleted; the plot is clean, so nothing of it is left for a merge or a release to refuse.
    const aside = inKingdom(kingdom.root, `.runs/${quest.id}-1/set-aside/quests-handover-tmp.txt`);
    expect(await readFile(aside, 'utf8')).toBe('x\n');
    expect(await pathExists(path.join(worktree, 'quests-handover-tmp.txt'))).toBe(false);
    expect(git(worktree, 'status', '--porcelain')).toBe('');
    expect(kingdom.warnings.join('\n')).toMatch(
      /left out of the commit and set aside in .*quests-handover-tmp\.txt/,
    );
  }, 120_000);
});

describe("work the territory's hook refuses (P1-55)", () => {
  it('keeps a 300-line hook log and reports its head and counts', async () => {
    const { kingdom, steward } = await open(() => WORK, { hook: LONG_HOOK });
    await kingdom.command('create_quest', questPayload('Long hook'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Long hook', 'infirmary'));
    const quest = await kingdom.quest('Long hook');
    const log = `.runs/${quest.id}-1/pre-commit.log`;
    const lines = Array.from({ length: 5 }, (_, index) => `error ${index}: lint failed`).join('\n');
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: {
        code: 'breaker:commit_errors',
        params: { lines, errors: 300, total_lines: 300, log },
      },
    });
    const output = await readFile(path.join(kingdom.root, log), 'utf8');
    expect(output.split(/\r?\n/)).toHaveLength(300);
    expect(output).toContain('error 299: lint failed');
  }, 120_000);

  it('is kept as a patch, and a quest with no letter gets a minimal one', async () => {
    const { kingdom, steward, repo } = await open(() => WORK, { hook: HOOK, letter: false });
    await kingdom.command('create_quest', questPayload('Refused by lint'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Refused by lint', 'infirmary'));

    const quest = await kingdom.quest('Refused by lint');
    expect(git(repo, 'rev-list', '--count', `main..quest/${quest.id}`)).toBe('0');
    const patch = await readFile(inKingdom(kingdom.root, `.runs/${quest.id}-1/${WIP_PATCH_FILE}`), 'utf8');
    expect(patch).toContain('+export const app = 2;');
    const letter = await readFile(handoverPath(kingdom.root, quest.id), 'utf8');
    expect(letter).toContain(`# Handover · ${quest.id}`);
    expect(letter).toContain('Written by the Steward');
    expect(letter).toContain('- src/app.ts');
    expect(letter).toContain('lint failed: src/app.ts');
    expect(letter).toContain(WIP_PATCH_FILE);
    // The template's headings, ending on an empty Question: nothing to read back as a question.
    expect(letter).toMatch(/## Next step[\s\S]*## Question\s*$/);
    // The work stays staged in the plot as well.
    expect(git(fromPortable(quest.plot.path ?? ''), 'status', '--porcelain')).toContain('src/app.ts');
  }, 120_000);

  it('also keeps the work of a session a breaker cut, whose WIP commit it refused', async () => {
    const options = { hook: HOOK, letter: false, plays: { work: { 'Cut by time': ['hang' as const] } } };
    const { kingdom, steward, repo } = await open(() => WORK, options);
    await kingdom.command('create_quest', questPayload('Cut by time'));
    await steward.tick();
    kingdom.clock.advance(45);
    await steward.tick();

    const quest = await kingdom.quest('Cut by time');
    expect(quest.status).toBe('infirmary');
    expect(git(repo, 'rev-list', '--count', `main..quest/${quest.id}`)).toBe('0');
    const patch = await readFile(inKingdom(kingdom.root, `.runs/${quest.id}-1/${WIP_PATCH_FILE}`), 'utf8');
    expect(patch).toContain('+export const app = 2;');
    expect(await readFile(handoverPath(kingdom.root, quest.id), 'utf8')).toContain('Written by the Steward');
  }, 120_000);

  // Gap 23 of the PS-07 report: two sessions cut at their token ceiling left no letter, and no hook refused anything.
  it('writes a minimal letter for a session a breaker cut whose WIP commit went in', async () => {
    const options = { letter: false, plays: { work: { 'Cut, committed': ['hang' as const] } } };
    const { kingdom, steward, repo } = await open(() => WORK, options);
    await kingdom.command('create_quest', questPayload('Cut, committed'));
    await steward.tick();
    kingdom.clock.advance(45);
    await steward.tick();

    const quest = await kingdom.quest('Cut, committed');
    expect(quest.status).toBe('infirmary');
    const wip = git(repo, 'rev-parse', `quest/${quest.id}`);
    expect(git(repo, 'log', '-1', '--format=%s', wip)).toBe(`chore: wip ${quest.id} (time)`);
    const letter = await readFile(handoverPath(kingdom.root, quest.id), 'utf8');
    expect(letter).toContain(`# Handover · ${quest.id}`);
    expect(letter).toContain('its session ended (time) before a letter was written');
    expect(letter).toContain(`as WIP ${wip} on the quest's branch`);
    expect(letter).toContain('in 1 file(s), committed or not:\n\n- src/app.ts\n');
    expect(letter).toMatch(/## Next step[\s\S]*## Question\s*$/);
  }, 120_000);

  it('never overwrites the letter its character wrote, and keeps the copy of the work all the same', async () => {
    const { kingdom, steward } = await open(() => WORK, { hook: HOOK });
    await kingdom.command('create_quest', questPayload('Has its letter'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Has its letter', 'infirmary'));

    const quest = await kingdom.quest('Has its letter');
    const letter = await readFile(handoverPath(kingdom.root, quest.id), 'utf8');
    expect(letter).toContain('A fake session of the conformance suite.');
    expect(letter).not.toContain('Written by the Steward');
    expect(await pathExists(inKingdom(kingdom.root, `.runs/${quest.id}-1/${WIP_PATCH_FILE}`))).toBe(true);
  }, 120_000);
});
