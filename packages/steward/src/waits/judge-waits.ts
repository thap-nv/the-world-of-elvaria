// A quest in review waiting for a judge: the roster has none for it ("Quest không có người chấm", P1-15, §3.2), or every
// judge it has is held by its mana (PS-03, (d) of the P1-50 report). planTick names both. The Steward writes a
// `quest.judge_wait` line when a wait appears or changes (the gauges of `judge_mana` too), and `reason: null` when it
// is gone while the quest is still in review; a quest that left review ended its wait with the line of its move. The
// bell rings when a quest starts to wait for another reason than it last rang for, or after a judge's session: a wait
// that pauses (a judge busy, the checks run again after a restart) and comes back as it was rings no more. Both books
// are the log's (judgeWaitsOf, judgeWaitReasonsOf), rebuilt at start, so a restart rings no bell again and
// `elvaria digest` lists the waits without a Steward (P2-04). A quest whose ritual asks for eyes (PS-11) says so: the
// judge it lacks is one of a tribe whose CLI reads images. Who judges does not change (ADR 0008).
import {
  judgeWaitReasonsOf,
  judgeWaitsOf,
  judgedByEye,
  judgingClassesOf,
  waitGaugesOf,
} from '@elvaria/domain';
import type { Event, JudgeWait, JudgeWaitNote, JudgeWaitReason, Quest, QuestId } from '@elvaria/domain';

import { noticeQuest, ring } from '../context.ts';
import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';
import type { Notice } from '../bell/notice.ts';

/** What the bell last told of a quest: the reason, and how many judges' sessions the quest had then (unknown at start). */
interface Rung {
  readonly reason: JudgeWaitReason;
  readonly judges?: number;
}

export interface JudgeWaitBook {
  /** The waits in force, by quest; never one with `reason: null`. */
  readonly waits: Map<QuestId, JudgeWaitNote>;
  readonly rung: Map<QuestId, Rung>;
}

export const createJudgeWaitBook = (): JudgeWaitBook => ({ waits: new Map(), rung: new Map() });

/** The waits and what the bell told of them, as the last Steward left them in the log. */
export function recoverJudgeWaits(book: JudgeWaitBook, events: readonly Event[]): void {
  for (const [quest, wait] of judgeWaitsOf(events)) book.waits.set(quest, wait);
  for (const [quest, reason] of judgeWaitReasonsOf(events)) book.rung.set(quest, { reason });
}

/** What planTick named this tick. */
export interface NamedWaits {
  readonly unjudgeable: readonly QuestId[];
  readonly judge_waits: readonly JudgeWait[];
}

type Waiting = JudgeWaitNote & { readonly reason: JudgeWaitReason };

const same = (a: JudgeWaitNote | undefined, b: JudgeWaitNote): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const judgesOf = (quest: Quest): number => quest.attempt_log.filter(({ role }) => role === 'verifier').length;

/** The bell's word on a quest that started to wait, or to wait for another reason. */
function noticeOf(ctx: Context, quest: Quest, note: Waiting): Notice {
  const classes = judgingClassesOf(ctx.world.registry.classes, quest.kind);
  if (note.reason === 'judge_mana')
    return { kind: 'judge_mana', quest: noticeQuest(quest), classes, gauges: waitGaugesOf(note) };
  const assignee = typeof quest.assignee === 'string' ? ctx.world.characters.get(quest.assignee) : undefined;
  return {
    kind: 'unjudgeable',
    quest: noticeQuest(quest),
    classes,
    model: assignee?.model ?? null,
    ...(judgedByEye(quest, ctx.world.registry) ? { vision: true } : {}),
  };
}

/** Rings unless the bell last told this reason, with no judge's session since. */
async function ringOnce(ctx: Context, book: JudgeWaitBook, quest: Quest, note: Waiting): Promise<void> {
  const last = book.rung.get(quest.id);
  const judges = judgesOf(quest);
  book.rung.set(quest.id, { reason: note.reason, judges });
  if (last?.reason === note.reason && (last.judges ?? judges) === judges) return;
  await ring(ctx, noticeOf(ctx, quest, note));
}

async function tell(ctx: Context, book: JudgeWaitBook, quest: Quest, note: Waiting): Promise<void> {
  if (same(book.waits.get(quest.id), note)) return;
  await ctx.record.note({ type: 'quest.judge_wait', actor: STEWARD, data: note, quest });
  book.waits.set(quest.id, note);
  await ringOnce(ctx, book, quest, note);
}

/** A wait planTick no longer names: a line says it is gone, unless the quest's own move already did. */
async function withdraw(ctx: Context, book: JudgeWaitBook, id: QuestId): Promise<void> {
  book.waits.delete(id);
  const quest = ctx.world.quests.get(id);
  if (quest?.status !== 'review') return;
  await ctx.record.note({ type: 'quest.judge_wait', actor: STEWARD, data: { reason: null }, quest });
}

/** Tells the waits that appeared or changed since the last tick, and those that are gone. */
export async function noteJudgeWaits(ctx: Context, book: JudgeWaitBook, named: NamedWaits): Promise<void> {
  const notes = new Map<QuestId, Waiting>();
  for (const id of named.unjudgeable) notes.set(id, { reason: 'unjudgeable' });
  for (const { quest, gauges } of named.judge_waits)
    notes.set(quest, { reason: 'judge_mana', gauges: [...gauges] });
  for (const [id, note] of notes) {
    const quest = ctx.world.quests.get(id);
    if (quest !== undefined) await tell(ctx, book, quest, note);
  }
  for (const id of [...book.waits.keys()].filter((known) => !notes.has(known))) await withdraw(ctx, book, id);
  // A quest out of review waits for a judge again only after a new submit: what the bell told of it is over.
  for (const id of [...book.rung.keys()])
    if (ctx.world.quests.get(id)?.status !== 'review') book.rung.delete(id);
}
