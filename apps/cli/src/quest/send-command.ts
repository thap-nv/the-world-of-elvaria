// Every change to a quest or an existing character is a command file in inbox/ that the Steward applies at its next
// tick: the Steward is the only writer of quests and characters (ADR 0005). The CLI checks what it can first, so
// most mistakes are refused here and not one tick later; what only the Steward can tell (the quest moved since the
// owner read it: `stale`) comes back as its answer in the event log, which the CLI waits for while a Steward runs
// (P1-56, (g) of the P1-50 report: a refused edit used to end at "sent").
import { isEventOf } from '@elvaria/domain';
import type { InboxCommandInput } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import type { EventCursor } from '@elvaria/eventlog';
import type { MessageKey, Params } from '@elvaria/i18n';
import { stewardRuns } from '@elvaria/steward';

import { EXIT } from '../command.ts';
import { storeIssueLines } from '../issues.ts';
import type { ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The fields every command from the CLI starts with. */
export function commandHeader(ctx: KingdomContext) {
  return { version: 1, id: ctx.ids.ulid(), ts: ctx.now(), source: 'cli' } as const;
}

/** How often the answer is looked for, and how long past the Steward's tick the CLI waits for it. */
const ANSWER_POLL_MS = 250;
const ANSWER_SLACK_MS = 3000;
const MS_PER_SECOND = 1000;

/** What a reason the Steward gives means for the owner; a reason not here is printed as the Steward wrote it. */
const REASON_HINT: Readonly<Record<string, MessageKey>> = {
  stale: 'cli.inbox.reason.stale',
};

type Answer = { readonly applied: true } | { readonly applied: false; readonly reason: string | undefined };

/** The Steward's answer to `commandId` among the lines written after `from`, if it has written it yet. */
async function answerOf(root: string, from: EventCursor, commandId: string): Promise<Answer | undefined> {
  const { events } = await openEventLog(root).read(from);
  for (const event of events) {
    if (isEventOf(event, 'command.applied') && event.data.command_id === commandId) return { applied: true };
    if (isEventOf(event, 'command.rejected') && event.data.command_id === commandId)
      return { applied: false, reason: event.data.reason };
  }
  return undefined;
}

/** Waits one tick and a little more for the answer; undefined when the Steward has not given it by then. */
async function waitForAnswer(
  ctx: KingdomContext,
  from: EventCursor,
  commandId: string,
): Promise<Answer | undefined> {
  const polls = Math.ceil(
    (ctx.kingdom.dispatch.tick_seconds * MS_PER_SECOND + ANSWER_SLACK_MS) / ANSWER_POLL_MS,
  );
  for (let poll = 0; poll < polls; poll += 1) {
    const answer = await answerOf(ctx.store.root, from, commandId);
    if (answer !== undefined) return answer;
    await ctx.io.sleep(ANSWER_POLL_MS);
  }
  return answerOf(ctx.store.root, from, commandId);
}

/** Says what the Steward answered; a refusal is an error line and a failed command. */
function report(ctx: KingdomContext, id: string, answer: Answer | undefined): ExitCode {
  if (answer === undefined) {
    ctx.io.out(ctx.t('cli.inbox.unanswered', { id }));
    return EXIT.ok;
  }
  if (answer.applied) {
    ctx.io.out(ctx.t('cli.inbox.applied', { id }));
    return EXIT.ok;
  }
  const hint = REASON_HINT[answer.reason ?? ''];
  const reason = hint === undefined ? (answer.reason ?? '') : ctx.t(hint);
  ctx.io.err(ctx.t('cli.inbox.rejected', { id, reason }));
  return EXIT.failed;
}

/**
 * Drops `command` into the inbox and says what it asks for (`done`, with `params`). While a Steward runs it then
 * waits for the Steward's answer and says it; without one the command waits in the inbox, as before.
 */
export async function sendCommand(
  ctx: KingdomContext,
  command: InboxCommandInput,
  done: MessageKey,
  params: Params,
): Promise<ExitCode> {
  // Before the write, so the answer cannot be written ahead of the cursor.
  const running = await stewardRuns(ctx.store.root);
  const from = running ? await openEventLog(ctx.store.root).end() : {};
  const written = await ctx.store.inbox.write(command);
  if (!written.ok) {
    storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
    return EXIT.failed;
  }
  ctx.io.out(ctx.t(done, params));
  ctx.io.out(ctx.t('cli.inbox.sent', { id: written.value.id }));
  if (!running) return EXIT.ok;
  return report(ctx, written.value.id, await waitForAnswer(ctx, from, written.value.id));
}
