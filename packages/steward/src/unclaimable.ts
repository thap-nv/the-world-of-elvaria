// "Quest không ai nhận được" (implementation-plan §3.1): planTick names the open quests nobody can take; the
// Steward tells each once — a `quest.unclaimable` line and the bell when the reason appears or changes, a line with
// `reason: null` when it is gone while the quest is still open — and keeps what it told in
// `.state/unclaimable.json` for `elvaria quest list` and `show`. The file is rebuilt from the log at every start.
import { QuestUnclaimableDataSchema, isEventOf } from '@elvaria/domain';
import { inKingdom, readTextFile, writeFileAtomic } from '@elvaria/store';
import type { EventData, Quest, QuestId, Unclaimable } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';

import { noticeQuest, ring } from './context.ts';
import { STEWARD } from './record.ts';
import type { Context } from './context.ts';

export type UnclaimableNote = EventData<'quest.unclaimable'>;
/** The notices in force: one per open quest, never with `reason: null`. */
export type Reported = Map<QuestId, UnclaimableNote>;

/** Kingdom-relative path of the Steward's record (§2.2 `.state/`). */
export const UNCLAIMABLE_FILE = '.state/unclaimable.json';
const FILE_VERSION = 1;
const JSON_INDENT = 2;

/** What the log last said about each quest. */
export function reportedFromLog(events: readonly Event[]): Reported {
  const reported: Reported = new Map();
  for (const event of events) {
    if (!isEventOf(event, 'quest.unclaimable') || event.quest === undefined) continue;
    if (event.data.reason === null) reported.delete(event.quest);
    else reported.set(event.quest, event.data);
  }
  return reported;
}

/** The notices as the Steward last wrote them; empty when the file is missing or unreadable. */
export async function readUnclaimable(root: string): Promise<Reported> {
  const text = await readTextFile(inKingdom(root, UNCLAIMABLE_FILE));
  const reported: Reported = new Map();
  if (text === undefined) return reported;
  try {
    const file = JSON.parse(text) as { version?: unknown; quests?: Record<string, unknown> };
    if (file.version !== FILE_VERSION) return reported;
    for (const [id, note] of Object.entries(file.quests ?? {})) {
      const parsed = QuestUnclaimableDataSchema.safeParse(note);
      if (parsed.success && parsed.data.reason !== null) reported.set(id as QuestId, parsed.data);
    }
  } catch {
    // A torn or hand-edited file: the next start writes it again from the log.
  }
  return reported;
}

export async function writeUnclaimable(root: string, reported: Reported): Promise<void> {
  const quests = Object.fromEntries([...reported].sort(([a], [b]) => a.localeCompare(b)));
  await writeFileAtomic(
    inKingdom(root, UNCLAIMABLE_FILE),
    `${JSON.stringify({ version: FILE_VERSION, quests }, null, JSON_INDENT)}\n`,
  );
}

function noteOf(quest: Quest, cls: UnclaimableNote['class'], blocker: Unclaimable): UnclaimableNote {
  const best = blocker.best;
  return {
    reason: blocker.reason,
    rank: quest.rank,
    class: cls,
    ...(best === undefined ? {} : { best_character: best.character, best_level: best.level }),
  };
}

const same = (a: UnclaimableNote | undefined, b: UnclaimableNote): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

async function tell(ctx: Context, quest: Quest, note: UnclaimableNote): Promise<void> {
  await ctx.record.note({ type: 'quest.unclaimable', actor: STEWARD, data: note, quest });
}

/** A quest whose notice may be withdrawn: still open with its dependencies done, so planTick judged it. */
function judged(ctx: Context, quest: Quest): boolean {
  const done = (id: QuestId) => ctx.world.quests.get(id)?.status === 'done';
  return quest.status === 'open' && quest.depends_on.every(done);
}

/** Tells what changed since the last tick; true when the record changed. */
export async function noteUnclaimable(
  ctx: Context,
  reported: Reported,
  plan: readonly Unclaimable[],
): Promise<boolean> {
  let changed = false;
  const named = new Set<QuestId>();
  for (const blocker of plan) {
    const quest = ctx.world.quests.get(blocker.quest);
    // planTick names session-tier quests only, which always have a class.
    if (quest?.class_required === undefined) continue;
    named.add(quest.id);
    const note = noteOf(quest, quest.class_required, blocker);
    if (same(reported.get(quest.id), note)) continue;
    await tell(ctx, quest, note);
    reported.set(quest.id, note);
    changed = true;
    const best = blocker.best === undefined ? {} : { best: blocker.best };
    await ring(ctx, {
      kind: 'unclaimable',
      quest: noticeQuest(quest),
      reason: blocker.reason,
      class: note.class,
      ...best,
    });
  }
  for (const [id, note] of [...reported]) {
    if (named.has(id)) continue;
    const quest = ctx.world.quests.get(id);
    // Given, cancelled or gone: the notice ends by itself, no line (§3.1).
    if (quest?.status !== 'open') {
      reported.delete(id);
      changed = true;
    } else if (judged(ctx, quest)) {
      await tell(ctx, quest, { reason: null, rank: quest.rank, class: note.class });
      reported.delete(id);
      changed = true;
    }
  }
  return changed;
}
