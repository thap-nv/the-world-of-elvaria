// The answer to a command (P1-56, (g) of the P1-50 report): with a Steward running, the CLI waits for its
// `command.applied` or `command.rejected` line and says it, so a refused edit no longer ends at "sent"; with none,
// the command waits in the inbox and the CLI does not wait for anything.
import { EventSchema } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { acquireLock, inKingdom, openKingdom } from '@elvaria/store';
import type { HeldLock } from '@elvaria/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import { QUEST_ID, plantQuests, questFixture } from '../../test/quest.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('the answer the CLI waits for', () => {
  let dir: TempDir;
  let kingdom: string;
  let steward: HeldLock | undefined;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await plantQuests(kingdom, questFixture('open'));
  });
  afterEach(async () => {
    await steward?.release();
    steward = undefined;
    await dir.remove();
  });

  const holdLock = async () => {
    const held = await acquireLock(inKingdom(kingdom, '.state/steward'), { wait: false });
    if (!held.ok) throw new Error('the lock is held');
    steward = held.value;
  };

  /** The id of the only command in the inbox: what the Steward would answer to. */
  const commandId = async (): Promise<string> => {
    const [item] = await openKingdom(kingdom).inbox.read();
    if (item?.command.ok !== true) throw new Error('no command in the inbox');
    return item.command.value.id;
  };

  let line = 0;
  /** A Steward that answers at the second look: the CLI sleeps once, and the line is there afterwards. */
  const answersAfterOneSleep = (type: 'command.applied' | 'command.rejected', reason?: string): TestIo => {
    const io = testIo();
    let asked = 0;
    return {
      ...io,
      sleep: async (ms) => {
        await io.sleep(ms);
        asked += 1;
        if (asked > 1) return;
        line += 1;
        const data = { command_id: await commandId(), ...(reason === undefined ? {} : { reason }) };
        await openEventLog(kingdom).append([
          EventSchema.parse({
            v: 1,
            id: `01M6RQ5Y000000000000000${String(line).padStart(3, '0')}`,
            ts: '2026-11-06T09:00:05+07:00',
            type,
            actor: { kind: 'steward' },
            data,
          }),
        ]);
      },
    };
  };

  const edit = (io: TestIo) =>
    run(io, 'quest', 'edit', QUEST_ID, '--title', 'Mới', '--kingdom', kingdom, '--locale', 'en');

  it('says why the Steward refused: the quest moved since the owner read it (stale)', async () => {
    await holdLock();
    const io = answersAfterOneSleep('command.rejected', 'stale');
    expect(await edit(io)).toBe(1);
    expect(io.printed.err).toEqual([
      `The Steward refused command ${await commandId()}: the quest changed since you read it, so the edit does not overwrite it; read it again with elvaria quest show and send the edit again (an edit that changes only the budget is never refused for this)`,
    ]);
    // What the owner is told first is unchanged.
    expect(io.printed.out[0]).toBe(`Sent the command to edit quest ${QUEST_ID}.`);
  });

  it('prints a reason it has no words for as the Steward wrote it', async () => {
    await holdLock();
    const io = answersAfterOneSleep('command.rejected', 'unknown_dependency');
    expect(await edit(io)).toBe(1);
    expect(io.printed.err[0]).toMatch(/: unknown_dependency$/);
  });

  it('says the Steward applied the command', async () => {
    await holdLock();
    const io = answersAfterOneSleep('command.applied');
    expect(await edit(io)).toBe(0);
    expect(io.printed.out.at(-1)).toBe(`The Steward applied command ${await commandId()}.`);
    expect(io.printed.err).toEqual([]);
  });

  it('gives up after one tick and a little more, leaving the command in the inbox', async () => {
    await holdLock();
    const io = testIo();
    expect(await edit(io)).toBe(0);
    // dispatch.tick_seconds is 5 by default: 5 000 + 3 000 ms in 250 ms looks.
    expect(io.slept).toHaveLength(32);
    expect(io.slept.every((ms) => ms === 250)).toBe(true);
    expect(io.printed.out.at(-1)).toContain('has not answered command');
    expect(await openKingdom(kingdom).inbox.read()).toHaveLength(1);
  });

  it('does not wait when no Steward runs: the command waits in the inbox', async () => {
    const io = testIo();
    expect(await edit(io)).toBe(0);
    expect(io.slept).toEqual([]);
    expect(io.printed.out).toHaveLength(2);
  });
});
