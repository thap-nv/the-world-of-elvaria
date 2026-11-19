// The digest's items of the Temple (PS-12g, temple-first plan DB10, DB13): with the Temple off, or no Monk, and two kinds
// of failure repeated, exactly one item that can wait, with the count 2 and how to make the Temple run; none without a
// repeated failure; and every character suspended for a fail streak, with the command that releases it.
import { QuestSchema, VerdictSchema } from '@elvaria/domain';
import type { AttentionItem, FailKind } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench } from './__fixtures__/kingdom.ts';
import type { Bench, CastMember } from './__fixtures__/kingdom.ts';
import type { Digest, DigestRequest, Steward } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

const DAY = '2026-11-06';
const questId = (n: number) => `q_20261106_${String(n).padStart(6, '0')}`;
const at = (minute: number) => `${DAY}T10:${String(minute).padStart(2, '0')}:00+07:00`;

/** An archived quest thorn worked once, judged a fail of `kind` by vesper: one run of the Temple's evidence. */
const quest = (n: number) =>
  QuestSchema.parse({
    version: 1,
    id: questId(n),
    title: `Quest ${String(n)}`,
    description: 'A quest of the digest specs.',
    kind: 'build',
    rank: 'E',
    territory: 'dc1-se-team',
    class_required: 'knight',
    tags: ['infra'],
    status: 'archived',
    tier: 'session',
    assignee: null,
    verifier: null,
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 1,
    attempt_log: [
      {
        n: 1,
        character: 'thorn',
        role: 'assignee',
        started_at: at(n),
        ended_at: at(n + 1),
        session_id: `a${String(n)}`,
        run_dir: `.runs/${questId(n)}-1`,
      },
    ],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    created_by: 'user',
    created_at: at(0),
    updated_at: at(0),
  });

const verdict = (n: number, kind: FailKind) =>
  VerdictSchema.parse({
    version: 1,
    id: `${questId(n)}-1`,
    quest_id: questId(n),
    attempt: 1,
    verifier_id: 'vesper',
    ritual: 'build_review',
    checks: [],
    result: 'fail',
    fail_kind: kind,
    notes: 'The README still names the old command.',
    by_human: false,
    session_id: `s-${String(n)}`,
    created_at: at(n + 2),
  });

/** Three failed runs of each kind, on disk before the Steward starts. */
async function failures(kingdom: Bench, kinds: readonly FailKind[]): Promise<void> {
  const runs = kinds.flatMap((kind) => [kind, kind, kind]);
  for (const [index, kind] of runs.entries()) {
    const written = await kingdom.store.quests.write(quest(index + 1));
    if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
    const judged = await kingdom.store.verdicts.write(verdict(index + 1, kind));
    if (!judged.ok) throw new Error(`fixture: ${judged.error.message}`);
  }
}

/** The items of the first digest, written at the first tick (the bench's clock reads 09:00, past 08:00). */
async function digestOf(cast: readonly CastMember[], kinds: readonly FailKind[]): Promise<AttentionItem[]> {
  const asked: DigestRequest[] = [];
  const port: Digest = {
    write: (request) => {
      asked.push(request);
      return Promise.resolve(`digest/${request.day}.md`);
    },
  };
  current = await bench({ cast });
  await failures(current, kinds);
  running = current.steward({ digest: port });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  await running.tick();
  return [...(asked[0]?.items ?? [])];
}

const THORN = { id: 'thorn', cls: 'knight' } as const;
const SAGE = { id: 'sage', cls: 'monk', tribe: 'gemini', model: 'gemini-3.8-flash-low' } as const;
const templeItems = (items: readonly AttentionItem[]) =>
  items.filter(({ kind }) => kind.startsWith('temple_') || kind === 'character_suspended');

describe('the digest and the Temple (PS-12g)', () => {
  it('has one item for two kinds of repeated failure while the Temple is off and has no Monk: add one', async () => {
    const items = await digestOf([THORN], ['tests_fail', 'style']);
    expect(templeItems(items)).toEqual([
      {
        kind: 'temple_no_monk',
        group: 'can_wait',
        advice: 'add_monk',
        command: ['character', 'add', '<id>', '--class', 'monk', '--model', '<model>'],
        count: 2,
        temple_reasons: ['disabled', 'no_monk'],
        class: 'monk',
      },
    ]);
  });

  it('says the Temple is off when a Monk could run it', async () => {
    const items = await digestOf([THORN, SAGE], ['tests_fail', 'style']);
    expect(templeItems(items).map(({ kind, count, command }) => [kind, count, command])).toEqual([
      ['temple_off', 2, []],
    ]);
  });

  it('has no item of the Temple without a repeated failure', async () => {
    expect(templeItems(await digestOf([THORN], []))).toEqual([]);
  });

  it('lists a character suspended for a fail streak, with the command that releases it', async () => {
    const streak = { ...THORN, fail: { fail_kind: 'tests_fail', count: 3 } };
    const items = await digestOf([streak, SAGE], []);
    expect(templeItems(items)).toEqual([
      {
        kind: 'character_suspended',
        group: 'can_wait',
        advice: 'read_letters_then_release',
        command: ['character', 'release', 'thorn'],
        character: 'thorn',
        fail_kind: 'tests_fail',
        count: 3,
        letters: [],
      },
    ]);
  });
});
