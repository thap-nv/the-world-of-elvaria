import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { reduce } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { CAST, RM_TEMP, bench, questPayload, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import { delivered, leavingRunners, moveTerritory, noteOf, worktreePlots } from './__fixtures__/deliver.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Leaves } from './__fixtures__/deliver.ts';
import type { Steward, StewardDeps } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: string[] = [];

/** A scout, a bard and a mage join the bench's knights, scribe and judges. */
const WIDER_CAST = [
  ...CAST,
  { id: 'pike', cls: 'scout' },
  { id: 'lyra', cls: 'bard' },
  { id: 'merle', cls: 'mage' },
];

async function folder(name: string): Promise<string> {
  const made = await mkdtemp(path.join(os.tmpdir(), `elvaria ${name}-`));
  folders.push(made);
  return made;
}

async function open(
  options: BenchOptions,
  overrides: (kingdom: Bench) => Promise<Partial<StewardDeps>> | Partial<StewardDeps>,
) {
  current = await bench({ cast: WIDER_CAST, ...options });
  running = current.steward(await overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, RM_TEMP)));
  running = undefined;
  current = undefined;
});

const typesOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);

/** A git territory dc1-se-team in a temp folder, its quests in worktree-like plots, assignees leaving `leaves`. */
async function onGit(leaves: Leaves = () => ({})) {
  const repo = await folder('repo');
  return open({}, async (kingdom) => {
    await moveTerritory(kingdom, 'dc1-se-team', repo, {
      type: 'git',
      default_branch: 'main',
      remote: 'git@example.com:owner/dc1.git',
    });
    return { plots: worktreePlots(repo), runners: leavingRunners(kingdom, leaves) };
  }).then((opened) => ({ ...opened, repo }));
}

describe('delivering work on a git territory', () => {
  it('delivers a build as its branch, with a note that is the pull request and says how to merge', async () => {
    const { kingdom, steward, repo } = await onGit();
    await kingdom.command('create_quest', questPayload('Add the orders API'));
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Add the orders API'));
    const quest = await kingdom.quest('Add the orders API');
    expect(quest.deliverable).toEqual({
      type: 'branch',
      branch: `quest/${quest.id}`,
      path: `.runs/${quest.id}-delivery.md`,
      delivered_at: quest.updated_at,
    });
    const note = await noteOf(kingdom, quest);
    expect(note).toContain('# Add the orders API\n');
    expect(note).toContain(`- Branch: \`quest/${quest.id}\`, from \`main\``);
    expect(note).toContain("Fake quest «Add the orders API» of the Steward's specs.");
    expect(note).toContain(`### \`${quest.id}-1\`: pass`);
    // The letter's headings sit two levels down, under the note's own section.
    expect(note).toContain('## Handover letter\n\n#### Where I am');
    const repoPath = repo.split(path.sep).join('/');
    expect(note).toContain(`git -C "${repoPath}" merge --no-ff quest/${quest.id}`);
    expect(note).toContain(`git -C "${repoPath}" push origin quest/${quest.id}`);
    expect(note).not.toContain('## Draft');
    // Once: later ticks find it delivered.
    await steward.tick();
    expect((await typesOf(kingdom)).filter((type) => type === 'quest.delivered')).toHaveLength(1);
    const log = await openEventLog(kingdom.root).read();
    expect(reduce(await kingdom.morning(), log.events)).toEqual(await worldOfFiles(kingdom.store));
    expect(kingdom.warnings).toEqual([]);
  });

  it('delivers a report as a file on its branch, the note naming who judged it', async () => {
    const { kingdom, steward } = await onGit((req) =>
      req.quest?.title === 'Survey the queues' ? { 'docs/queues.md': '# Queues\n' } : {},
    );
    const survey = questPayload('Survey the queues', { kind: 'research', class_required: 'scout' });
    await kingdom.command('create_quest', survey);
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Survey the queues'));
    const quest = await kingdom.quest('Survey the queues');
    expect(quest.deliverable).toMatchObject({ type: 'report', branch: `quest/${quest.id}` });
    const note = await noteOf(kingdom, quest);
    expect(note).toContain('- Deliverable: report');
    expect(note).toMatch(/`(sable|orin)`, ritual `source_check`\./);
    expect(note).toContain('## Merge by hand');
  });

  it('keeps a draft waiting for the seal, then delivers it as a draft nobody sends but the owner', async () => {
    const { kingdom, steward } = await onGit();
    const post = questPayload('Announce the release', {
      kind: 'publish',
      class_required: 'bard',
      seal_required: true,
    });
    await kingdom.command('create_quest', post);
    await tickUntil(steward, kingdom.clock, async () => {
      const quest = await kingdom.quest('Announce the release');
      return quest.status === 'awaiting_seal';
    });
    await steward.tick();
    const waiting = await kingdom.quest('Announce the release');
    expect(waiting.deliverable.delivered_at).toBeUndefined();
    await kingdom.command('seal', { quest: waiting.id, note: 'Good to post.' });
    await steward.tick();
    const quest = await kingdom.quest('Announce the release');
    expect(quest).toMatchObject({ status: 'done', deliverable: { type: 'draft' } });
    expect(quest.deliverable.delivered_at).toBeDefined();
    const note = await noteOf(kingdom, quest);
    expect(note).toContain('## Draft\n\nElvaria sends nothing.');
    expect(note).toContain(`### \`${quest.id}-1-user\`: pass\n\nThe owner, by hand.`);
    expect(note).toContain('Sealed by the owner at');
    expect(note).toContain(': Good to post.');
  });
});

describe('delivering work on a territory without git', () => {
  it('copies the plot into the territory, keeping what a copied file replaced', async () => {
    const handbook = await folder('handbook');
    await mkdir(path.join(handbook, 'guides'), { recursive: true });
    await writeFile(path.join(handbook, 'guides', 'setup.md'), 'The old setup.\n');
    await writeFile(path.join(handbook, 'guides', 'same.md'), 'Unchanged.\n');
    const { kingdom, steward } = await open({}, async (k) => {
      await moveTerritory(k, 'handbook', handbook);
      return {
        runners: leavingRunners(k, () => ({
          'guides/setup.md': 'The new setup.\n',
          'guides/same.md': 'Unchanged.\n',
          'guides/deploy/notes.md': 'Deploy notes.\n',
        })),
      };
    });
    const guide = questPayload('Rewrite the setup guide', {
      kind: 'document',
      class_required: 'scribe',
      territory: 'handbook',
      tags: ['docs'],
    });
    await kingdom.command('create_quest', guide);
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Rewrite the setup guide'));
    const quest = await kingdom.quest('Rewrite the setup guide');
    const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8');
    expect(await read(handbook, 'guides', 'setup.md')).toBe('The new setup.\n');
    expect(await read(handbook, 'guides', 'deploy', 'notes.md')).toBe('Deploy notes.\n');
    expect(await read(kingdom.root, '.runs', `${quest.id}-replaced`, 'guides', 'setup.md')).toBe(
      'The old setup.\n',
    );
    expect(quest.deliverable).toMatchObject({ type: 'file', path: `.runs/${quest.id}-delivery.md` });
    expect(quest.deliverable.branch).toBeUndefined();
    const note = await noteOf(kingdom, quest);
    expect(note).toContain('- `guides/deploy/notes.md`\n- `guides/same.md`\n- `guides/setup.md` (replaced)');
    expect(note).toContain(`kept in \`.runs/${quest.id}-replaced\``);
    expect(note).not.toContain('## Merge by hand');
  });

  it('copies nothing into a territory folder that is not there, and says where the work stays', async () => {
    const gone = path.join(await folder('gone'), 'handbook');
    const { kingdom, steward } = await open({}, async (k) => {
      await moveTerritory(k, 'handbook', gone);
      return { runners: leavingRunners(k, () => ({ 'faq.md': 'FAQ.\n' })) };
    });
    const faq = questPayload('Write the FAQ', {
      kind: 'document',
      class_required: 'scribe',
      territory: 'handbook',
      tags: ['docs'],
    });
    await kingdom.command('create_quest', faq);
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Write the FAQ'));
    const quest = await kingdom.quest('Write the FAQ');
    const note = await noteOf(kingdom, quest);
    expect(note).toContain('is not there. The work stays in `quests/');
    await expect(readFile(path.join(gone, 'faq.md'), 'utf8')).rejects.toThrow();
  });
});
