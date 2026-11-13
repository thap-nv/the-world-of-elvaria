import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir } from '../../test/cli.ts';

// The protected paths a quest's work changed (PS-04, ADR 0026), in `quest show`: why it waits for the royal seal.
describe('elvaria quest show and protected paths', () => {
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

  const show = async (id: string, locale: 'vi' | 'en'): Promise<string> => {
    const io = testIo();
    expect(await run(io, 'quest', 'show', id, '--kingdom', kingdom, '--locale', locale)).toBe(0);
    return io.printed.out.join('\n');
  };

  it('names them beside the seal, and says nothing of them for a quest that changed none', async () => {
    const touched = { seal_required: true, protected_changes: ['CLAUDE.md', '.claude/settings.json'] };
    await plantQuests(kingdom, questFixture('open', QUEST_ID, touched), questFixture('open', OTHER_QUEST_ID));
    expect(await show(QUEST_ID, 'en')).toMatch(
      /Protected paths changed\s+CLAUDE\.md, \.claude\/settings\.json/,
    );
    expect(await show(QUEST_ID, 'vi')).toMatch(/Vùng bảo vệ đã chạm\s+CLAUDE\.md/);
    expect(await show(OTHER_QUEST_ID, 'en')).not.toContain('Protected paths');
  });
});
