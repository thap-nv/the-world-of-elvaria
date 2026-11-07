import { openKingdom } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../test/cli.ts';
import type { TempDir } from '../test/cli.ts';

describe('elvaria wake', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const wake = (io: ReturnType<typeof testIo>, tribe: string, locale = 'en') =>
    run(io, 'wake', tribe, '--kingdom', kingdom, '--locale', locale);

  it('asks the Steward to probe a tribe of the kingdom at its next tick', async () => {
    const io = testIo();
    expect(await wake(io, 'claude')).toBe(0);
    const inbox = (await openKingdom(kingdom).inbox.read()).flatMap((item) =>
      item.command.ok ? [item.command.value] : [],
    );
    expect(inbox.map(({ kind, payload, source }) => ({ kind, payload, source }))).toEqual([
      { kind: 'wake', payload: { tribe: 'claude' }, source: 'cli' },
    ]);
    expect(io.printed.out[0]).toBe(
      'Sent the command to wake tribe claude: the Steward probes its account at its next tick.',
    );
  });

  it('refuses a tribe the kingdom does not have, and names the ones it has', async () => {
    const io = testIo();
    expect(await wake(io, 'codex', 'vi')).toBe(1);
    expect(io.printed.err).toEqual(['Vương quốc không có tộc codex. Các tộc: claude, gemini.']);
    expect(await openKingdom(kingdom).inbox.read()).toEqual([]);
  });
});
