// The delegation of the seal (implementation-plan §3.16.7, ADR 0023; PS-08b) on a real git repo whose origin is a bare
// repo, with a fake forge that merges there for real: a small build quest on a pr_merge territory goes from its pass
// to `delivery.merged` without `awaiting_seal`, and the next digest names it with the line that undoes it; the
// delegation's limits (the diff's size, the scope, a protected path, the judge's family) send it to the seal instead.
import { SealDelegationSchema } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { forgeBench } from './__fixtures__/forge-bench.ts';
import { characterOf, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { ForgeBench, ForgeBenchOptions } from './__fixtures__/forge-bench.ts';
import type { Digest, DigestRequest, Steward } from './types.ts';

let current: ForgeBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const TITLE = 'Rooms API';
const SEAL = { max_rank: 'D', kinds: ['build'] };
const MINUTES_PER_DAY = 1440;
const SETTLED = ['awaiting_seal', 'done', 'archived'];

/** dc1 delivers by pr_merge; the kingdom delegates `seal` (none: no delegation of the seal). */
async function delegating(seal: Record<string, unknown> | undefined, options: ForgeBenchOptions = {}) {
  current = await forgeBench({ delivery: { mode: 'pr_merge' }, ...options });
  const { store } = current.kingdom;
  const read = await store.kingdom.read();
  if (!read.ok) throw new Error('fixture: kingdom');
  if (seal !== undefined)
    await store.kingdom.write({
      ...read.value,
      delegation: { ...read.value.delegation, seal: SealDelegationSchema.parse(seal) },
    });
  return current;
}

/** The quest made by a command that says nothing of the seal, unless `fields` do, ticked past its review. */
async function made(bench: ForgeBench, steward: Steward, fields: Record<string, unknown> = {}) {
  const { seal_required: _, ...payload } = questPayload(TITLE, fields);
  await bench.kingdom.command('create_quest', { ...payload, ...fields });
  await tickUntil(steward, bench.kingdom.clock, async () =>
    SETTLED.includes((await bench.kingdom.quest(TITLE)).status),
  );
  return bench.kingdom.quest(TITLE);
}

const statusesOf = async (bench: ForgeBench) =>
  (await bench.lines('quest.created'))
    .concat(await bench.lines('quest.done'))
    .map(({ data }) => (data as { quest: { status: string } }).quest.status);

function recordingDigest(): Digest & { readonly asked: DigestRequest[] } {
  const asked: DigestRequest[] = [];
  return { asked, write: (request) => (asked.push(request), Promise.resolve(`digest/${request.day}.md`)) };
}

describe('a quest the delegation spares the seal', () => {
  it('goes from its pass to delivery.merged without awaiting_seal, and the next digest names it with its undo', async () => {
    const bench = await delegating(SEAL);
    const digest = recordingDigest();
    const steward = await bench.start({ digest });
    const quest = await made(bench, steward);
    expect(quest).toMatchObject({ seal_required: false, seal_delegated: true });
    expect(quest.seal_raised).toBeUndefined();
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.kingdom.quest(TITLE)).status === 'archived',
    );

    const [merged, ...more] = await bench.lines('delivery.merged');
    expect(more).toEqual([]);
    const sha = bench.forge.merged.get(1);
    expect(merged?.data).toMatchObject({ quest: quest.id, sealed: false, merge_sha: sha, method: 'merge' });
    expect(await statusesOf(bench)).not.toContain('awaiting_seal');
    const [submitted] = await bench.lines('quest.submitted');
    expect(submitted?.data).toMatchObject({ diff_lines: 1 });

    // The next morning's digest: the merge without the seal, once, with the line that undoes it.
    bench.kingdom.clock.advance(MINUTES_PER_DAY);
    await steward.tick();
    await steward.idle();
    const items = digest.asked.at(-1)?.items.filter(({ kind }) => kind === 'merged_unsealed');
    expect(items).toEqual([
      expect.objectContaining({
        quest: quest.id,
        group: 'can_wait',
        url: 'https://github.com/elvaria-specs/kingdom-repo/pull/1',
        commit: sha,
        revert: ['git', 'revert', '-m', '1', sha],
        command: ['quest', 'show', quest.id],
      }),
    ]);
  });

  it('waits for the seal when its branch outgrows max_diff_lines, the size on its submit line', async () => {
    const two = () => ({ 'src/rooms.ts': 'export const a = 1;\nexport const b = 2;\n' });
    const bench = await delegating({ ...SEAL, max_diff_lines: 1 }, { leaves: two });
    const quest = await made(bench, await bench.start());
    expect(quest).toMatchObject({
      status: 'awaiting_seal',
      seal_delegated: true,
      seal_raised: ['diff_size'],
    });
    const [submitted] = await bench.lines('quest.submitted');
    expect(submitted?.data).toMatchObject({ diff_lines: 2 });
    expect(await bench.lines('delivery.pushed')).toEqual([]);
  });

  it('waits for the seal when its work leaves its scope or changes a protected path', async () => {
    const laws = { laws: { protected_paths: ['src/**'] } };
    const bench = await delegating(SEAL, { territory: laws });
    const quest = await made(bench, await bench.start(), { scope_paths: ['docs/**'] });
    expect(quest).toMatchObject({
      status: 'awaiting_seal',
      seal_raised: ['protected_paths', 'out_of_scope'],
      protected_changes: ['src/rooms.ts'],
    });
  });

  it('waits for the seal when its judge is of the family of the one who worked it', async () => {
    const bench = await delegating(SEAL);
    // The judge of the other family is away: the claude judge on another model takes the review (different_model).
    const orin = {
      id: 'orin',
      cls: 'judge',
      tribe: 'gemini',
      model: 'gemini-3.8-flash-low',
      status: 'suspended',
    };
    await bench.kingdom.store.characters.write(characterOf({ ...orin, status: 'suspended' }));
    const quest = await made(bench, await bench.start());
    expect(quest).toMatchObject({
      status: 'awaiting_seal',
      verifier: 'sable',
      seal_raised: ['same_family_judge'],
    });
  });
});

describe('a quest the delegation does not spare', () => {
  it("keeps its kind's seal in a kingdom without the seal's delegation, as before", async () => {
    const bench = await delegating(undefined);
    const quest = await made(bench, await bench.start());
    expect(quest).toMatchObject({ status: 'awaiting_seal', seal_required: true });
    expect(quest.seal_delegated).toBeUndefined();
    expect(quest.seal_raised).toBeUndefined();
  });

  it("is done without the seal on the owner's --no-seal, and stops at its pull request", async () => {
    const bench = await delegating(SEAL);
    const steward = await bench.start();
    const quest = await made(bench, steward, { seal_required: false });
    expect(quest.seal_delegated).toBeUndefined();
    await tickUntil(
      steward,
      bench.kingdom.clock,
      async () => (await bench.lines('delivery.pushed')).length > 0,
    );
    // A few minutes more: a pull request the Steward merges is asked about every 30 seconds; this one never is.
    let ticks = 0;
    await tickUntil(steward, bench.kingdom.clock, () => Promise.resolve((ticks += 1) > 3));
    expect(bench.forge.calls.map(({ method }) => method)).toEqual(['open']);
    expect(await bench.lines('delivery.merged')).toEqual([]);
    expect((await bench.kingdom.quest(TITLE)).status).toBe('done');
  });
});
