// Every change to a quest is a command file in inbox/ that the Steward applies at its next tick: the Steward is
// the only writer of quests (ADR 0005). The CLI checks what it can first, so most mistakes are refused here and
// not one tick later.
import type { InboxCommandInput } from '@elvaria/domain';
import type { MessageKey, Params } from '@elvaria/i18n';

import { EXIT } from '../command.ts';
import { storeIssueLines } from '../issues.ts';
import type { ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The fields every command from the CLI starts with. */
export function commandHeader(ctx: KingdomContext) {
  return { version: 1, id: ctx.ids.ulid(), ts: ctx.now(), source: 'cli' } as const;
}

/** Drops `command` into the inbox and says what it asks for (`done`, with `params`). */
export async function sendCommand(
  ctx: KingdomContext,
  command: InboxCommandInput,
  done: MessageKey,
  params: Params,
): Promise<ExitCode> {
  const written = await ctx.store.inbox.write(command);
  if (!written.ok) {
    storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
    return EXIT.failed;
  }
  ctx.io.out(ctx.t(done, params));
  ctx.io.out(ctx.t('cli.inbox.sent', { id: written.value.id }));
  return EXIT.ok;
}
