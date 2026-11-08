// `elvaria quest reassign <quest> [--to <character>]`: the owner gives a quest to someone (implementation-plan §2.5
// `reassign`, P1-26). With --to, to that character, its level aside: canTake bounds only the Steward's own choice,
// and above the character's ceiling the quest waits for the royal seal (§2.6). Without it, the Steward picks among
// the free characters of the class, other than the one holding it. An inbox command like the rest (ADR 0005); the
// CLI checks the character first (assignee.ts), so a wrong name is refused at the terminal and not one tick later.
import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { assigneeFor, ceilingLines } from './assignee.ts';
import { questFor } from './lifecycle.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runReassign(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'reassign', 'cli.quest.reassign.refused');
  if (quest === undefined) return EXIT.failed;
  const to = textOption(input, 'to');
  if (to === undefined) {
    const command = { ...commandHeader(ctx), kind: 'reassign', payload: { quest: quest.id } } as const;
    return sendCommand(ctx, command, 'cli.quest.reassign.sent', { id: quest.id });
  }
  // A session-tier quest (the only kind reassign takes) always names its class.
  const character = await assigneeFor(ctx, to, quest.class_required);
  if (Array.isArray(character)) {
    character.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const payload = { quest: quest.id, character: character.id };
  const sent = await sendCommand(
    ctx,
    { ...commandHeader(ctx), kind: 'reassign', payload },
    'cli.quest.reassign.sent_to',
    { id: quest.id, character: character.id },
  );
  if (sent === EXIT.ok) ceilingLines(ctx, character, quest.rank).forEach(ctx.io.out);
  return sent;
}

export const QUEST_REASSIGN: CommandSpec = {
  name: ['quest', 'reassign'],
  summary: 'cli.quest.reassign.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { to: { type: 'string', value: '<character>', help: 'cli.quest.reassign.option.to' } },
  run: runReassign,
};
