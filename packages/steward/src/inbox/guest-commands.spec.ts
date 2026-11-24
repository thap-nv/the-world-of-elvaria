// The owner's `enqueue_branch` (CM-07): a pull request of the owner's own session put in a `pr_merge` territory's
// merge queue as a guest entry, its `delivery.enqueued` the entry itself; refused from the Chancellor's triage and the
// temple, on a territory unknown or not delivered by `pr_merge`, and for a pull request that waits already.
import type { InboxCommandInput } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { forgeBench } from '../__fixtures__/forge-bench.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const TERRITORY = 'dc1-se-team';

/** A command from another source than the owner's clients. */
async function fromSource(bench: ForgeBench, source: string, payload: Record<string, unknown>) {
  const id = bench.kingdom.ids.ulid();
  const command = {
    version: 1,
    id,
    ts: '2026-11-07T09:00:00+07:00',
    kind: 'enqueue_branch',
    source,
    payload,
  };
  const written = await bench.kingdom.store.inbox.write(command as unknown as InboxCommandInput);
  if (!written.ok) throw new Error(written.error.message);
  return id;
}

describe('enqueue_branch (CM-07)', () => {
  it("enqueues the owner's pull request once, and refuses what is not the owner's or not a pr_merge queue", async () => {
    current = await forgeBench({ delivery: { mode: 'pr_merge' } });
    const { kingdom } = current;
    // No forge: the guest's turn this tick is refused at once, after every command is answered.
    const steward = await current.start({}, null);
    const ids = [
      await kingdom.command('enqueue_branch', { territory: TERRITORY, pr: 7 }),
      await kingdom.command('enqueue_branch', { territory: TERRITORY, pr: 7 }),
      await fromSource(current, 'chancellor', { territory: TERRITORY, pr: 8 }),
      await fromSource(current, 'monk', { territory: TERRITORY, pr: 8 }),
      await kingdom.command('enqueue_branch', { territory: 'nowhere', pr: 8 }),
      await kingdom.command('enqueue_branch', { territory: 'handbook', pr: 8 }),
    ];
    await steward.tick();
    const answers = [
      ...(await current.lines('command.applied')),
      ...(await current.lines('command.rejected')),
    ];
    const answerOf = (id: string) => {
      const line = answers.find(({ data }) => data.command_id === id);
      return [line?.type, line?.data.reason];
    };
    expect(ids.map(answerOf)).toEqual([
      ['command.applied', undefined],
      ['command.rejected', 'already_enqueued'],
      ['command.rejected', 'owner_only'],
      ['command.rejected', 'owner_only'],
      ['command.rejected', 'unknown_territory'],
      ['command.rejected', 'not_pr_merge'],
    ]);
    const enqueued = await current.lines('delivery.enqueued');
    expect(enqueued.map(({ actor, territory, data }) => [actor.kind, territory, data])).toEqual([
      ['user', TERRITORY, { territory: TERRITORY, pr: 7 }],
    ]);
  });
});
