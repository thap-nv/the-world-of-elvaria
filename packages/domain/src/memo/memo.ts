// Memos as the Steward files and closes them (PS-02, implementation-plan §3.16.2, ADR 0024). The decisions are pure:
// where a memo goes is read from registry/memos.json (no switch on the kind, ADR 0016), and the id is the same for
// the same quest, kind and text, so reading a letter again files nothing twice. The Steward hashes the key (the
// domain does no IO, and the steward's sha256 makes quest ids from commands the same way).
import { formatDatedId } from '../core/id-source.ts';
import { err, ok } from '../core/result.ts';
import { MemoSchema } from '../schema/memo/memo.ts';
import type { CharacterId, MemoId, QuestId } from '../core/ids.ts';
import type { DelegationHold } from '../delegation/constants.ts';
import type { Result } from '../core/result.ts';
import type { Memo, MemoEscalation, MemoOutcome, MemoRoute } from '../schema/memo/memo.ts';
import type { Registry } from '../schema/registry.ts';

/** One memo as the character wrote it in the Memos section of its letter (runner-core's memosOf). */
export interface MemoDraft {
  readonly kind: string;
  readonly body: string;
  readonly refs: readonly string[];
}

/** Whose letter held it: the quest, the run that ended, and its assignee. */
export interface MemoSource {
  readonly quest: QuestId;
  readonly attempt: number;
  readonly from: CharacterId;
}

export type MemoRefusal =
  | { readonly code: 'unknown_kind'; readonly kind: string }
  | { readonly code: 'invalid'; readonly message: string };

/** Where a memo of `kind` goes, by its entry in registry/memos.json. */
export function routeMemo(kind: string, registry: Pick<Registry, 'memos'>): Result<MemoRoute, MemoRefusal> {
  const entry = registry.memos.find(({ id }) => id === kind);
  return entry === undefined ? err({ code: 'unknown_kind', kind }) : ok({ route: entry.route });
}

/** The text as the id reads it: one Unicode form, runs of spaces and line breaks as one space, lower case. */
export const normalizedMemoText = (body: string): string =>
  body.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase();

/** What the Steward hashes for the id: the quest, the kind and the normalized text (the refs are not the matter). */
export const memoKeyOf = (quest: QuestId, draft: Pick<MemoDraft, 'kind' | 'body'>): string =>
  [quest, draft.kind, normalizedMemoText(draft.body)].join('\n');

/** `m_<day of the quest>_<6 base32 of digest>`: the day comes from the quest, so a later reading gives the same id. */
export function memoIdOf(quest: QuestId, digest: Uint8Array): MemoId {
  // A QuestId matches QUEST_ID_PATTERN: `q_<yyyymmdd>_<6 base32>`.
  const [, day] = quest.split('_') as [string, string];
  // formatDatedId with the `m` prefix produces exactly MEMO_ID_PATTERN.
  return formatDatedId('m', day, digest) as MemoId;
}

export interface NewMemo {
  readonly id: MemoId;
  readonly draft: MemoDraft;
  readonly source: MemoSource;
  /** When it is filed, in kingdom.tz. */
  readonly at: string;
}

/** The open memo the Steward files, routed; refused when its kind is unknown or the contract refuses it. */
export function memoOf(
  { id, draft, source, at }: NewMemo,
  registry: Pick<Registry, 'memos'>,
): Result<Memo, MemoRefusal> {
  const to = routeMemo(draft.kind, registry);
  if (!to.ok) return to;
  const memo = {
    version: 1,
    id,
    kind: draft.kind,
    from: source.from,
    quest: source.quest,
    attempt: source.attempt,
    to: to.value,
    body: draft.body,
    refs: [...draft.refs],
    state: 'open',
    filed_at: at,
  };
  const parsed = MemoSchema.safeParse(memo);
  if (parsed.success) return ok(parsed.data);
  const message = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  return err({ code: 'invalid', message });
}

/** What decide_memo asks: the decision, the quest that does the work when handled, a note. */
export type MemoDecision = Omit<MemoOutcome, 'at'>;

/** The memo closed with `decision`; a memo is decided once (ADR 0024: no answer, no reopening). */
export function closeMemo(
  memo: Memo,
  decision: MemoDecision,
  at: string,
): Result<Memo, { readonly code: 'closed' }> {
  if (memo.state === 'closed') return err({ code: 'closed' });
  const outcome: MemoOutcome = {
    decision: decision.decision,
    at,
    ...(decision.quest === undefined ? {} : { quest: decision.quest }),
    ...(decision.note === undefined ? {} : { note: decision.note }),
  };
  return ok({ ...memo, state: 'closed', outcome });
}

/** What escalate_memo asks (PS-03b): the Chancellor's advice and what holds the memo for the owner. */
export type MemoAdvice = Omit<MemoEscalation, 'at' | 'holds'> & { readonly holds: readonly DelegationHold[] };

/**
 * The open memo with the triage's advice (PS-03b): sent up once, so a second triage leaves it alone; a memo already
 * closed or sent up is refused.
 */
export function escalateMemo(
  memo: Memo,
  advice: MemoAdvice,
  at: string,
): Result<Memo, { readonly code: 'closed' | 'escalated' }> {
  if (memo.state === 'closed') return err({ code: 'closed' });
  if (memo.escalation !== undefined) return err({ code: 'escalated' });
  const { action, quest, addendum, holds, note } = advice;
  const escalation: MemoEscalation = {
    at,
    action,
    ...(quest === undefined ? {} : { quest }),
    ...(addendum === undefined ? {} : { addendum }),
    holds: [...holds],
    note,
  };
  return ok({ ...memo, escalation });
}
