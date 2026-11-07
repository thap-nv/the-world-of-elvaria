import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';
import type { InboxCommand } from '@elvaria/domain';

describe('elvaria quest add', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const folder = path.join(dir.root, 'do-an');
    await mkdir(folder);
    await run(testIo(), 'territory', 'add', folder, '--kingdom', kingdom);
  });
  afterEach(() => dir.remove());

  const add = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', 'add', ...args, '--kingdom', kingdom, '--locale', 'en');
  const required = [
    '--title',
    'Thêm pnpm check',
    '--description',
    'Gom lint và test',
    '--territory',
    'do-an',
  ];
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );

  it('sends create_quest for an open session quest; the Steward writes the quest (ADR 0005)', async () => {
    const io = testIo();
    const args = [
      '--kind',
      'build',
      '--rank',
      'd',
      '--class',
      'knight',
      '--tag',
      'infra',
      '--tag',
      'e2e',
      '--seal',
    ];
    expect(await add(io, ...required, ...args)).toBe(0);
    const [command] = await inbox();
    expect(command).toMatchObject({
      version: 1,
      kind: 'create_quest',
      source: 'cli',
      ts: '2026-11-06T09:00:00+07:00',
      payload: {
        draft: false,
        title: 'Thêm pnpm check',
        description: 'Gom lint và test',
        kind: 'build',
        rank: 'D',
        territory: 'do-an',
        tier: 'session',
        class_required: 'knight',
        tags: ['infra', 'e2e'],
        seal_required: true,
        created_by: 'user',
      },
    });
    expect(io.printed.out).toEqual([
      'Sent the command to create quest «Thêm pnpm check».',
      `Command ${command?.id ?? ''} is in the inbox; the Steward applies it at its next tick.`,
    ]);
    expect(await openKingdom(kingdom).quests.list()).toEqual({ items: [], issues: [] });
  });

  it("takes the kind's only class, and depends on quests that exist", async () => {
    await plantQuests(kingdom, questFixture('open'));
    expect(
      await add(testIo(), ...required, '--kind', 'document', '--rank', 'F', '--depends-on', QUEST_ID),
    ).toBe(0);
    expect((await inbox())[0]?.payload).toMatchObject({ class_required: 'scribe', depends_on: [QUEST_ID] });
  });

  it('sends a script-tier quest without a class (ADR 0017)', async () => {
    const args = [
      '--kind',
      'document',
      '--rank',
      'E',
      '--script',
      'link-check',
      '--params',
      '{"globs":["docs/**/*.md"]}',
    ];
    expect(await add(testIo(), ...required, ...args)).toBe(0);
    const payload = (await inbox())[0]?.payload;
    expect(payload).toMatchObject({
      tier: 'script',
      script: { id: 'link-check', params: { globs: ['docs/**/*.md'] } },
    });
    expect(payload).not.toHaveProperty('class_required');
  });

  it("refuses params outside the script's params_schema before the inbox (§3.12)", async () => {
    const io = testIo();
    const args = [
      '--kind',
      'document',
      '--rank',
      'E',
      '--script',
      'link-check',
      '--params',
      '{"paths":["docs"]}',
    ];
    expect(await add(io, ...required, ...args)).toBe(1);
    expect(io.printed.err).toEqual([expect.stringMatching(/^--params do not fit script link-check: params/)]);
    expect(await inbox()).toEqual([]);
  });

  it('checks the script, its kind and its params', async () => {
    const io = testIo();
    expect(
      await add(
        io,
        ...required,
        '--kind',
        'analyze',
        '--rank',
        'E',
        '--script',
        'link-check',
        '--params',
        '[1]',
      ),
    ).toBe(1);
    expect(io.printed.err).toEqual([
      'Script link-check is not for kind analyze.',
      '--params must be a JSON object, e.g. {"path": "docs"}.',
    ]);
    const unknown = testIo();
    expect(
      await add(
        unknown,
        ...required,
        '--kind',
        'analyze',
        '--rank',
        'E',
        '--script',
        'nope',
        '--params',
        '{',
      ),
    ).toBe(1);
    expect(printed(unknown)).toContain('--script «nope» does not exist');
  });

  it('names every bad value at once and sends nothing', async () => {
    const io = testIo();
    const args = [
      '--title',
      't'.repeat(121),
      '--description',
      'd',
      '--kind',
      'conquer',
      '--rank',
      'Z',
      '--territory',
      'nowhere',
    ];
    const tags = ['frontend', 'backend', 'db', 'infra', 'i18n', 'e2e', 'docs', 'web'].flatMap((tag) => [
      '--tag',
      tag,
    ]);
    expect(await add(io, ...args, ...tags, '--depends-on', 'q_20261106_zzzzzz', '--depends-on', 'bad')).toBe(
      1,
    );
    expect(io.printed.err).toEqual([
      'A title has 1 to 120 characters.',
      '--rank takes one of: F, E, D, C, B, A, S.',
      expect.stringMatching(/^--kind «conquer» does not exist; choose one of: build, research/),
      expect.stringMatching(/^--tag «web» does not exist/),
      'A quest has at most 6 tags.',
      'There is no territory nowhere. See: elvaria territory list',
      'There is no quest q_20261106_zzzzzz.',
      'There is no quest bad.',
    ]);
    expect(await inbox()).toEqual([]);
  });

  it('needs --class when the kind allows several', async () => {
    const io = testIo();
    expect(await add(io, ...required, '--kind', 'build', '--rank', 'C', '--class', 'scribe')).toBe(1);
    expect(io.printed.err).toEqual(['Kind build needs --class, one of: knight, dwarf.']);
  });

  it('stops when the registry does not load', async () => {
    await writeFile(path.join(kingdom, 'registry', 'kinds.json'), '{');
    const io = testIo();
    expect(await add(io, ...required, '--kind', 'build', '--rank', 'C')).toBe(1);
    expect(io.printed.err).toEqual(['registry/kinds.json is not valid JSON.']);
  });
});
