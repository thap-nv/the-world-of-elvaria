// The letters of a temple report (PS-12c, temple-first plan DB8, ADR 0024, ADR 0027): rungs 1–3 of the fix ladder
// (prevent, check, script) and rung 6 (a stronger model) are not text in a prompt but a letter, filed as a memo of the
// registry's kind for proposals (the first routed to the Chancellor, `proposal` by default; no switch on a kind, ADR
// 0016). Rungs 1–3 go to the Chancellor's triage like any proposal, rung 6 straight to the owner. The memo's quest and
// run are those of the fail verdict the letter names, and its id is made from that quest, the kind and the text, so a
// report applied again files nothing twice.
import { memoKeyOf, memoOf } from '../memo/memo.ts';
import type { CharacterId, MemoId, QuestId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { MemoRefusal } from '../memo/memo.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Registry } from '../schema/registry.ts';
import type { TempleLetter } from '../schema/temple/operation.ts';

/** The kind a temple letter is filed as: the registry's first kind routed to the Chancellor; none in a registry without. */
export const templeLetterKindOf = (registry: Pick<Registry, 'memos'>): string | undefined =>
  registry.memos.find(({ route }) => route === 'chancellor')?.id;

/** What the Steward hashes for the letter's memo id: the verdict's quest, the kind and the text, as any memo. */
export const templeLetterKeyOf = (quest: QuestId, kind: string, letter: Pick<TempleLetter, 'body'>): string =>
  memoKeyOf(quest, { kind, body: letter.body });

export interface NewTempleLetter {
  readonly id: MemoId;
  readonly kind: string;
  readonly letter: TempleLetter;
  /** The Monk who wrote the report. */
  readonly from: CharacterId;
  /** The quest and the run of the verdict the letter names. */
  readonly quest: QuestId;
  readonly attempt: number;
  readonly at: string;
}

/** The open memo: routed as its kind is, then to the owner when the letter asks for a stronger model (rung 6). */
export function templeMemoOf(
  { id, kind, letter, from, quest, attempt, at }: NewTempleLetter,
  registry: Pick<Registry, 'memos'>,
): Result<Memo, MemoRefusal> {
  const draft = { kind, body: letter.body, refs: letter.refs };
  const made = memoOf({ id, draft, source: { quest, attempt, from }, at }, registry);
  // A memo routed to the owner without a refusal is valid as it stands: nothing to check again.
  return made.ok && letter.to === 'owner'
    ? { ...made, value: { ...made.value, to: { route: 'owner' } } }
    : made;
}
