// fix/plot-setup-on-lockfile: a quest that changes a file commands.setup reads (AH-07b1 and AH-07b2 added a workspace
// dependency to package.json and the lockfile) gets setup again before the Steward's submit commit, so the territory's
// hook does not run on the modules installed when the plot was made. Real git and PlotManager, a FakeRunner whose
// assignee leaves package.json changed, a setup that "installs" package.json into node_modules, and a pre-commit hook
// that refuses while node_modules is older than package.json.
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { fromPortable } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { leavingRunners } from '../__fixtures__/deliver.ts';
import { git, gitPlots, gitRepoWith, onRepo } from '../__fixtures__/git-plots.ts';
import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import { statusIs } from '../__fixtures__/review.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: TempDir[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((folder) => folder.remove()));
  running = undefined;
  current = undefined;
});

const SETUP = [
  "import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';",
  "if (readFileSync('package.json', 'utf8').includes('broken')) process.exit(3);",
  "mkdirSync('node_modules', { recursive: true });",
  "copyFileSync('package.json', 'node_modules/.installed');",
  '',
].join('\n');

const HOOK = [
  '#!/bin/sh',
  'if [ "$(cat package.json)" != "$(cat node_modules/.installed 2>/dev/null)" ]; then',
  '  echo "error: Cannot find module b: node_modules is older than package.json" >&2',
  '  exit 1',
  'fi',
  '',
].join('\n');

/** dc1-se-team on a repo with that setup and hook, `commands` its territory's; the assignee leaves package.json. */
async function open(commands: Readonly<Record<string, unknown>>, manifest: string) {
  const folder = await tempDir('setup on commit');
  const repo = folder.root;
  folders.push(folder);
  await gitRepoWith(repo, {
    '.gitignore': 'node_modules/\n',
    'package.json': '{ "name": "demo" }\n',
    'setup.mjs': SETUP,
  });
  const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
  await writeFile(hook, HOOK);
  await chmod(hook, 0o755);
  current = await bench();
  await onRepo(current, repo, [], { commands });
  running = current.steward({
    plots: gitPlots(current.root),
    runners: leavingRunners(current, () => ({ 'package.json': manifest })),
  });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, repo };
}

const WATCHED = { setup: 'node setup.mjs', setup_when: ['pnpm-lock.yaml', '**/package.json'] };
const DEPENDENCY = '{ "name": "demo", "dependencies": { "b": "workspace:*" } }\n';

describe('commands.setup_when before the submit commit', () => {
  // Real git, a pre-commit hook and a setup run for real and the Steward's ticks: as the other flows on real git,
  // a few seconds alone, room for a busy machine.
  it('installs what the work added before the hook runs, and the work is submitted', async () => {
    const { kingdom, steward, repo } = await open(WATCHED, DEPENDENCY);
    await kingdom.command('create_quest', questPayload('Adds a dependency'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Adds a dependency', 'review'));

    const quest = await kingdom.quest('Adds a dependency');
    expect(git(repo, 'show', '--name-only', '--format=', `quest/${quest.id}`)).toBe('package.json');
  }, 120_000);

  // Real git, a pre-commit hook run for real and the Steward's ticks, as above.
  it('leaves the hook to refuse as before on a territory without setup_when', async () => {
    const { kingdom, steward, repo } = await open({ setup: 'node setup.mjs' }, DEPENDENCY);
    await kingdom.command('create_quest', questPayload('Stale modules'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Stale modules', 'infirmary'));

    const quest = await kingdom.quest('Stale modules');
    expect(git(repo, 'rev-list', '--count', `main..quest/${quest.id}`)).toBe('0');
    expect(kingdom.notices.at(-1)).toMatchObject({ reason: { code: 'breaker:commit_errors' } });
  }, 120_000);

  // Real git, a setup run for real and the Steward's ticks, as above.
  it('sends the quest to the infirmary with the setup log when setup fails, nothing committed', async () => {
    const { kingdom, steward, repo } = await open(WATCHED, '{ "name": "broken" }\n');
    await kingdom.command('create_quest', questPayload('Breaks setup'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Breaks setup', 'infirmary'));

    const quest = await kingdom.quest('Breaks setup');
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason: {
        code: 'breaker:setup',
        params: { detail: 'node setup.mjs: ended with 3', log: `.runs/${quest.id}-setup.log` },
      },
    });
    expect(git(repo, 'rev-list', '--count', `main..quest/${quest.id}`)).toBe('0');
    expect(git(fromPortable(quest.plot.path ?? ''), 'status', '--porcelain')).toBe('M package.json');
  }, 120_000);
});
