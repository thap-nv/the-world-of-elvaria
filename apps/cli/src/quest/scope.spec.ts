import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, UPDATED_AT, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';
import type { InboxCommand } from '@elvaria/domain';

// A quest's scope from the command line (PS-05, ADR 0028): `--scope` on add and edit, and the wait it causes in
// `quest list` and `quest show`.
describe('elvaria quest --scope', () => {
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

  const elvaria = (io: ReturnType<typeof testIo>, ...args: string[]) =>
    run(io, 'quest', ...args, '--kingdom', kingdom, '--locale', 'en');
  const inbox = async (): Promise<InboxCommand[]> =>
    (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );
  const worked = {
    assignee: 'thorn',
    attempts: 1,
    attempt_log: [
      {
        n: 1,
        character: 'thorn',
        role: 'assignee',
        started_at: '2026-11-06T08:10:00+07:00',
        run_dir: `.runs/${OTHER_QUEST_ID}-1`,
      },
    ],
  };

  it('sends the scope a quest declares, each glob once, on add and on edit', async () => {
    const add = [
      'add',
      ...['--title', 'Tách plan-tick', '--description', 'Tách file', '--territory', 'do-an'],
      ...['--kind', 'build', '--rank', 'D', '--class', 'knight'],
      ...['--scope', 'packages/domain/**', '--scope', 'docs/a.md'],
      ...['--scope', 'docs/a.md'],
    ];
    expect(await elvaria(testIo(), ...add)).toBe(0);
    await plantQuests(kingdom, questFixture('open'));
    expect(await elvaria(testIo(), 'edit', QUEST_ID, '--scope', 'apps/**')).toBe(0);
    const [created, edited] = await inbox();
    expect(created).toMatchObject({ payload: { scope_paths: ['packages/domain/**', 'docs/a.md'] } });
    expect(edited).toMatchObject({
      kind: 'edit_quest',
      payload: { quest: QUEST_ID, expected_updated_at: UPDATED_AT, changes: { scope_paths: ['apps/**'] } },
    });
  });

  it('marks on the board the quest that waits for a held scope, and says it in quest show', async () => {
    const holder = questFixture('done', OTHER_QUEST_ID, { ...worked, scope_paths: ['packages/**'] });
    const open = questFixture('open', QUEST_ID, { scope_paths: ['packages/domain/**'] });
    await plantQuests(kingdom, open, holder);
    const io = testIo();
    expect(await elvaria(io, 'list')).toBe(0);
    expect(io.printed.out[1]).toContain(`Open (waits for ${OTHER_QUEST_ID}, whose scope meets its own)`);
    const shown = testIo();
    expect(await elvaria(shown, 'show', QUEST_ID)).toBe(0);
    expect(shown.printed.out.join('\n')).toMatch(/Scope\s+packages\/domain\/\*\*/);
    // The Status row says what the board says (scopeWaitText).
    expect(shown.printed.out.join('\n')).toMatch(
      new RegExp(`Status\\s+Open \\(open\\) \\(waits for ${OTHER_QUEST_ID}, whose scope meets its own\\)`),
    );
  });

  it('marks the quest without a scope that waits for a working one to run alone, in Vietnamese too', async () => {
    const working = questFixture('working', OTHER_QUEST_ID, { ...worked, scope_paths: ['apps/**'] });
    await plantQuests(kingdom, questFixture('open'), working);
    const io = testIo();
    expect(await run(io, 'quest', 'list', '--kingdom', kingdom)).toBe(0);
    expect(io.printed.out[1]).toContain(`(chờ ${OTHER_QUEST_ID}: nhiệm vụ không khai vùng chạy một mình)`);
    const shown = testIo();
    expect(await elvaria(shown, 'show', OTHER_QUEST_ID)).toBe(0);
    expect(shown.printed.out.join('\n')).not.toContain('waits for');
  });

  it('keeps a quest that waits for nobody as "Open (open)" in quest show, and out of the digest', async () => {
    const holder = questFixture('done', OTHER_QUEST_ID, { ...worked, scope_paths: ['apps/**'] });
    await plantQuests(kingdom, questFixture('open', QUEST_ID, { scope_paths: ['docs/**'] }), holder);
    const shown = testIo();
    expect(await elvaria(shown, 'show', QUEST_ID)).toBe(0);
    expect(shown.printed.out.join('\n')).toMatch(/Status\s+Open \(open\)\s*\n/);
    const digest = testIo();
    expect(await run(digest, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(digest.printed.out.join('\n')).not.toContain('whose scope meets its own at');
  });

  it('tells in the digest, under what can wait, which quest an open quest waits for and where scopes meet', async () => {
    const holder = questFixture('done', OTHER_QUEST_ID, { ...worked, scope_paths: ['packages/**'] });
    const open = questFixture('open', QUEST_ID, { scope_paths: ['docs/a.md', 'packages/domain/**'] });
    await plantQuests(kingdom, open, holder);
    const digest = testIo();
    expect(await run(digest, 'digest', '--kingdom', kingdom, '--locale', 'en')).toBe(0);
    expect(digest.printed.out.join('\n')).toContain(
      `is open and waits for ${OTHER_QUEST_ID}, whose scope meets its own at packages/domain/**.`,
    );
  });
});
