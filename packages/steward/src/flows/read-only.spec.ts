// A read-only quest from end to end (P2-01d, 383a, W7) on a real git repo whose origin is a bare repo, on a territory
// that delivers by pull request: an inquiry device asks for a report, its scout's write of a source file is refused by
// the session's policy (FakeRunner's stand-in for the hook), the report alone is committed, the quest is delivered with
// its report in the note, its plot goes back at once, and nothing reaches the forge.
import { DeviceSchema } from '@elvaria/domain';
import type { InboxCommandInput } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { fromPortable, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { delivered, noteOf } from '../__fixtures__/deliver.ts';
import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git } from '../__fixtures__/git-plots.ts';
import { CAST, questPayload, settled, tickUntil } from '../__fixtures__/kingdom.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const ASKS = { id: 'dev_20261126_9tw3hx', role: 'inquiry', territories: ['dc1-se-team'] } as const;
const TITLE = 'Survey the queues';
const REPORT = '# Queues\n\nTwo queues, one idle.\n';

/** The phone's question: a research quest, the seal left to its kind, as the Herald writes it into the inbox. */
async function ask(bench: ForgeBench): Promise<void> {
  const { kingdom } = bench;
  const device = DeviceSchema.parse({
    version: 1,
    label: 'phone',
    created_at: '2026-11-07T08:00:00+07:00',
    ...ASKS,
  });
  const paired = await kingdom.store.devices.write(device);
  if (!paired.ok) throw new Error(paired.error.message);
  const { seal_required: _seal, ...payload } = questPayload(TITLE, {
    kind: 'research',
    class_required: 'scout',
    tags: [],
  });
  const command = {
    version: 1,
    id: kingdom.ids.ulid(),
    ts: '2026-11-07T09:00:00+07:00',
    kind: 'create_quest',
    source: 'herald',
    device: ASKS.id,
    payload,
  };
  const written = await kingdom.store.inbox.write(command as unknown as InboxCommandInput);
  if (!written.ok) throw new Error(written.error.message);
}

describe('a read-only quest on a territory that delivers by pull request (P2-01d)', () => {
  it('commits only its report, keeps it in the note, gives its plot back once delivered and never reaches the forge', async () => {
    current = await forgeBench({
      delivery: { mode: 'pr' },
      release: true,
      bench: {
        cast: [...CAST, { id: 'pike', cls: 'scout' }],
        plays: { work: { [TITLE]: ['read_only_write'] } },
      },
      leaves: (req) => (req.quest?.title === TITLE ? { 'elvaria-report.md': REPORT } : {}),
    });
    const { kingdom, repo, forge } = current;
    const steward = await current.start();
    await ask(current);
    await tickUntil(steward, kingdom.clock, delivered(kingdom, TITLE));
    // Ticks after the delivery: a quest that may go to its forge would be pushed by now.
    for (let tick = 0; tick < 3; tick += 1) {
      await steward.tick();
      await settled(steward);
      kingdom.clock.advance(1);
    }
    const quest = await kingdom.quest(TITLE);
    expect(quest).toMatchObject({ status: 'done', read_only: true, deliverable: { type: 'report' } });
    const branch = `quest/${quest.id}`;
    // The session's own write of a source file was refused; the report is all the branch adds.
    expect(git(repo, 'diff', '--name-only', 'main', branch)).toBe('elvaria-report.md');
    // The plot went back with the delivery, not at an archive; the branch stays in the kingdom.
    expect(quest.plot.path).toBeDefined();
    expect(await pathExists(fromPortable(quest.plot.path ?? ''))).toBe(false);
    expect(git(repo, 'branch', '--list', branch)).toContain(branch);
    expect(current.remoteTip(branch)).toBe('');
    expect(forge.calls).toEqual([]);
    const types = (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);
    expect(types.filter((type) => type.startsWith('delivery.'))).toEqual([]);
    const note = await noteOf(kingdom, quest);
    expect(note).toContain('## Report\n\nThe quest only asked a question');
    expect(note).toContain('### Queues\n\nTwo queues, one idle.');
    expect(note).not.toContain('## Merge by hand');
    expect(kingdom.warnings).toEqual([]);
  });
});
