// One triage of the memos waiting (PS-03b, implementation-plan §3.16.3), as `elvaria triage` and the Steward's
// scheduled job run it: no memo, no model call; else one session of the Chancellor for the batch (triageMemos), its
// decisions held against kingdom.delegation (triageCommands), and the commands written to the inbox with source
// `chancellor`. Nothing else is written: the Steward applies the commands at its next tick (ADR 0005).
import { triageCommands, triageMemos } from '@elvaria/chancellor';
import type { ChancellorFailure, DroppedDraft, TriageOutcome } from '@elvaria/chancellor';
import { MERGEABLE_STATUSES } from '@elvaria/domain';
import type { InboxCommandInput, Quest } from '@elvaria/domain';
import { questIdOfCommand } from '@elvaria/steward';
import type { TriageContext } from '@elvaria/runner-core';

import { storeIssueLines } from '../issues.ts';
import { commandHeader } from '../quest/send-command.ts';
import { speakerOf } from '../say/hearing.ts';
import { waitingMemos } from './waiting.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners, Speaker } from '../say/hearing.ts';

export type TriageRun =
  /** No memo waits: no model was called. */
  | { readonly status: 'none' }
  /** No Chancellor, or a registry that does not load: the reason is printed. */
  | { readonly status: 'no_chancellor' }
  | { readonly status: 'failed'; readonly failure: ChancellorFailure; readonly run_dir: string }
  /** A command could not be written: the reason is printed; the ones before it stay. */
  | { readonly status: 'unwritten' }
  | {
      readonly status: 'sent';
      readonly outcomes: readonly TriageOutcome[];
      readonly dropped: readonly DroppedDraft[];
      readonly commands: number;
      readonly more: number;
    };

const mergeable = (quest: Quest): boolean => (MERGEABLE_STATUSES as readonly string[]).includes(quest.status);

function contextOf(
  ctx: KingdomContext,
  speaker: Speaker,
  batch: TriageContext['memos'],
  quests: readonly Quest[],
) {
  return {
    locale: ctx.kingdom.owner.locale,
    decree: speaker.decree,
    class_prompt: speaker.class_prompt,
    territories: speaker.territories,
    registry: speaker.registry,
    roster: speaker.characters,
    context_budget_tokens: ctx.kingdom.breakers.context_budget_tokens,
    memos: batch,
    quests: quests.filter(mergeable),
  } satisfies TriageContext;
}

/** The commands in the inbox, in order; false once a write failed (the ones before it stay). */
async function send(ctx: KingdomContext, commands: readonly InboxCommandInput[]): Promise<boolean> {
  for (const command of commands) {
    const written = await ctx.store.inbox.write(command);
    if (!written.ok) {
      storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
      return false;
    }
  }
  return true;
}

/** `onListening` is told who reads how many memos, once the session is about to start. */
export async function runTriage(
  ctx: KingdomContext,
  runners: Runners,
  options: {
    readonly signal?: AbortSignal;
    readonly onListening?: (name: string, count: number) => void;
  } = {},
): Promise<TriageRun> {
  const { batch, more } = await waitingMemos(ctx);
  if (batch.length === 0) return { status: 'none' };
  const speaker = await speakerOf(ctx, runners, 'triage');
  if (speaker === undefined) return { status: 'no_chancellor' };
  const quests = (await ctx.store.quests.list()).items;
  const memos = batch.map((memo) => {
    const source = quests.find(({ id }) => id === memo.quest);
    return source === undefined ? { memo } : { memo, source };
  });
  options.onListening?.(speaker.session.choice.character.name, batch.length);
  const reply = await triageMemos(contextOf(ctx, speaker, memos, quests), speaker.session, options.signal);
  if (!reply.ok) return { status: 'failed', failure: reply.error, run_dir: speaker.session.run_dir };
  const { commands, outcomes } = triageCommands({
    reply: reply.value,
    memos: batch,
    quests,
    delegation: ctx.kingdom.delegation,
    source: {
      header: () => ({ ...commandHeader(ctx), source: 'chancellor' }),
      // openKingdomContext checked the zone, and the header's time is the clock's: the fallback never runs.
      questIdOf: (header) => questIdOfCommand(header, ctx.kingdom.tz) ?? ctx.ids.quest(),
    },
  });
  if (!(await send(ctx, commands))) return { status: 'unwritten' };
  return { status: 'sent', outcomes, dropped: reply.value.drafts.dropped, commands: commands.length, more };
}
