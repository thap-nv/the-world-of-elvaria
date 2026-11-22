// The secret scan before a push, commit by commit (fix/push-scan, (212); ADR 0013, 0023), on a real git repo whose
// origin is a bare repo, with a fake forge: `git push` sends every commit of quest/<id>, so a secret one commit adds
// and a later one takes away stops the delivery as one the branch still holds does, and the line names the commit.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git } from '../__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { Leaves } from '../__fixtures__/deliver.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const PR = { mode: 'pr' };
const TITLE = 'Rooms API';
const CONFIG = 'src/config.ts';
const CLEAN = 'export const key = process.env.KEY;\n';
/** Built in parts, so no scanner of this repo takes the spec for a leak. */
const ANTHROPIC_KEY = ['sk-ant-', 'api03-', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('');
const LEAKED = `export const key = '${ANTHROPIC_KEY}';\n`;

const write = (cwd: string, file: string, text: string): void => {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), text);
};

/**
 * An assignee that commits `step` in its plot itself (a WIP commit, or a merge), then leaves `then` for the Steward's
 * commit; `made.sha` is the commit `step` made.
 */
function committing(
  step: (cwd: string) => void,
  then: Readonly<Record<string, string>>,
  made: { sha?: string },
): Leaves {
  return ({ cwd }) => {
    step(cwd);
    made.sha = git(cwd, 'rev-parse', 'HEAD');
    return then;
  };
}

const wipCommit =
  (file: string, text: string) =>
  (cwd: string): void => {
    write(cwd, file, text);
    git(cwd, 'add', '--all');
    git(cwd, 'commit', '-q', '-m', 'wip');
  };

/** A merge of a side branch whose result adds what neither side holds: `file` with `text`. */
const mergeAdding =
  (file: string, text: string) =>
  (cwd: string): void => {
    const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
    git(cwd, 'switch', '-q', '-c', 'side');
    write(cwd, 'side.txt', 'side\n');
    git(cwd, 'add', '--all');
    git(cwd, 'commit', '-q', '-m', 'side');
    git(cwd, 'switch', '-q', branch);
    git(cwd, 'merge', '-q', '--no-ff', '--no-commit', 'side');
    write(cwd, file, text);
    git(cwd, 'add', '--all');
    git(cwd, 'commit', '-q', '-m', 'merge side');
  };

/** A quest on dc1-se-team taken to its delivery's first outcome; the quest and its branch. */
async function deliverOne(bench: ForgeBench) {
  const steward = await bench.start();
  await bench.kingdom.command('create_quest', questPayload(TITLE));
  await tickUntil(steward, bench.kingdom.clock, async () => {
    const outcomes = [...(await bench.lines('delivery.pushed')), ...(await bench.lines('delivery.failed'))];
    return outcomes.length > 0;
  });
  const quest = await bench.kingdom.quest(TITLE);
  return { quest, branch: `quest/${quest.id}` };
}

describe('the scan reads every commit the push sends', () => {
  it.each([
    ['a commit adds a secret that a later commit takes away', wipCommit],
    ['a merge adds a secret neither side holds, that a later commit takes away', mergeAdding],
  ])('stops the delivery when %s, naming that commit', async (_, step) => {
    const made: { sha?: string } = {};
    current = await forgeBench({
      delivery: PR,
      leaves: committing(step(CONFIG, LEAKED), { [CONFIG]: CLEAN }, made),
    });
    const { quest, branch } = await deliverOne(current);
    // The branch's last tree holds no secret: the whole diff alone would have pushed it.
    expect(git(current.repo, 'show', `${branch}:${CONFIG}`)).toBe(CLEAN.trim());
    expect(current.remoteTip(branch)).toBe('');
    expect(current.forge.calls).toEqual([]);
    const [line, ...more] = await current.lines('delivery.failed');
    expect(more).toEqual([]);
    expect(line?.data).toEqual({
      quest: quest.id,
      territory: 'dc1-se-team',
      stage: 'scan',
      reason: 'secret',
      branch,
      paths: [CONFIG],
      detail: `commit ${made.sha ?? ''} adds a secret to ${CONFIG}`,
    });
    expect(await current.holds(ANTHROPIC_KEY)).toBe(false);
  });

  it('reads the a/ and b/ paths it knows whatever the repo’s diff settings say', async () => {
    current = await forgeBench({ delivery: PR, leaves: () => ({ [CONFIG]: LEAKED }) });
    git(current.repo, 'config', 'diff.noprefix', 'true');
    git(current.repo, 'config', 'diff.mnemonicPrefix', 'true');
    const { branch } = await deliverOne(current);
    expect(current.remoteTip(branch)).toBe('');
    const [line] = await current.lines('delivery.failed');
    expect(line?.data).toMatchObject({ stage: 'scan', reason: 'secret', paths: [CONFIG] });
  });

  it('pushes a branch of clean commits, warning of a shared pattern a later commit took away', async () => {
    const made: { sha?: string } = {};
    const spec = 'src/auth.spec.ts';
    const leaves = committing(
      wipCommit(spec, 'const token = "abcdefghijklmnop";\n'),
      { [spec]: 'export {};\n' },
      made,
    );
    current = await forgeBench({ delivery: PR, leaves });
    const { branch } = await deliverOne(current);
    expect(git(current.repo, 'rev-list', '--count', `main..${branch}`)).toBe('2');
    expect(current.remoteTip(branch)).toBe(git(current.repo, 'rev-parse', branch));
    expect(await current.lines('delivery.failed')).toEqual([]);
    const [line] = await current.lines('delivery.pushed');
    expect(line?.data).toMatchObject({ warnings: [spec] });
  });
});
