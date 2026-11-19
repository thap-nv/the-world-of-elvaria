// The letters of a temple report (PS-12c, temple-first plan DB8, ADR 0024): each becomes a memo of the registry's kind
// for proposals, from the Monk, on the quest and run of the fail verdict it names; to the Chancellor for a check, a
// script or a change that prevents the failure, to the owner for a stronger model. Its id is made from that quest, the
// kind and the text, as file.ts makes a character's (memoIdOf), so a report applied again files nothing twice. A letter
// whose verdict is gone or no fail, or that cannot be written, is a warning: the scripture's operations stand.
import { createHash } from 'node:crypto';

import { memoIdOf, templeLetterKeyOf, templeLetterKindOf, templeMemoOf } from '@elvaria/domain';
import type { CharacterId, TempleLetter, Verdict } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

/** The hash memo ids are made with (memoIdOf), as file.ts makes them. */
const digestOf = (key: string): Uint8Array => createHash('sha256').update(key).digest();

const warn = (ctx: Context, message: string): void => {
  ctx.deps.log.warn(`steward: temple report: ${message}`);
};

/** One letter filed; false when it was filed before, or is left out (warned). */
async function fileLetter(
  ctx: Context,
  monk: CharacterId,
  letter: TempleLetter,
  verdict: Verdict | undefined,
): Promise<boolean> {
  const kind = templeLetterKindOf(ctx.world.registry);
  if (verdict?.result !== 'fail' || kind === undefined) {
    const why =
      kind === undefined
        ? 'registry/memos.json has no kind routed to the Chancellor'
        : 'its verdict is no fail';
    warn(ctx, `a letter on ${letter.source_verdict} is left out: ${why}`);
    return false;
  }
  const quest = verdict.quest_id;
  const id = memoIdOf(quest, digestOf(templeLetterKeyOf(quest, kind, letter)));
  const before = await ctx.deps.store.memos.read(id);
  if (before.ok || before.error.code !== 'not_found') return false;
  const at = ctx.record.stamp();
  const made = templeMemoOf(
    { id, kind, letter, from: monk, quest, attempt: verdict.attempt, at },
    ctx.world.registry,
  );
  const written = made.ok ? await ctx.deps.store.memos.write(made.value) : made;
  if (!written.ok) {
    warn(ctx, `memos/${id}.json was not written: ${JSON.stringify(written.error)}`);
    return false;
  }
  const where = ctx.world.quests.get(quest);
  const on = where === undefined ? {} : { quest: where };
  const writer = { kind: 'character', id: monk } as const;
  await ctx.record.note({ type: 'memo.filed', actor: writer, data: { memo: id, kind, from: monk }, ...on });
  await ctx.record.note({ type: 'memo.routed', actor: STEWARD, data: { memo: id, route: letter.to }, ...on });
  return true;
}

/** Files the report's letters; how many were filed now. */
export async function fileLetters(
  ctx: Context,
  monk: CharacterId,
  letters: readonly TempleLetter[],
  verdicts: ReadonlyMap<string, Verdict>,
): Promise<number> {
  let filed = 0;
  for (const letter of letters)
    if (await fileLetter(ctx, monk, letter, verdicts.get(letter.source_verdict))) filed += 1;
  return filed;
}
