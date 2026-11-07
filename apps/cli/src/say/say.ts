// `elvaria say "<words>"`: the owner speaks to the Chancellor (implementation-plan §3.11). One session of the
// Chancellor turns the words into drafts; each kept draft becomes a `create_quest` command with draft = true in
// the inbox, and the Steward writes the quests in status `draft` until the owner confirms them (ADR 0005). The
// CLI writes no quest: it knows each quest's id in advance only because the Steward derives it from the command.
import { draftCommands, draftQuests } from '@elvaria/chancellor';
import type { DraftCommand } from '@elvaria/chancellor';
import type { Kingdom } from '@elvaria/domain';
import { questIdOfCommand } from '@elvaria/steward';

import { EXIT } from '../command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader } from '../quest/send-command.ts';
import { crewOf } from '../run/crew.ts';
import { hearingOf } from './hearing.ts';
import { reportDropped, reportFailure, reportQuestion, reportSent } from './report.ts';
import type { ArgumentSpec, CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { CliIo } from '../io.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Runners } from './hearing.ts';

export interface SayDeps {
  /** The runners of the tribes that work now; `crewOf` of `elvaria run`, a scripted runner in the specs. */
  readonly runnersOf: (kingdom: Kingdom, io: CliIo) => Runners;
}

/** The commands in the inbox, in order; false once a write failed (the ones before it stay). */
async function send(ctx: KingdomContext, sent: readonly DraftCommand[]): Promise<boolean> {
  for (const { command } of sent) {
    const written = await ctx.store.inbox.write(command);
    if (!written.ok) {
      storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
      return false;
    }
  }
  return true;
}

async function say(ctx: KingdomContext, utterance: string, deps: SayDeps): Promise<ExitCode> {
  const hearing = await hearingOf(ctx, utterance, deps.runnersOf(ctx.kingdom, ctx.io));
  if (hearing === undefined) return EXIT.failed;
  const { context, session } = hearing;
  ctx.io.out(ctx.t('cli.say.listening', { name: session.choice.character.name }));
  const reply = await draftQuests(context, session);
  if (!reply.ok) {
    reportFailure(ctx, reply.error, session.run_dir);
    return EXIT.failed;
  }
  reportDropped(ctx, reply.value.dropped);
  if (reply.value.kept.length === 0) {
    reportQuestion(ctx, reply.value.question);
    ctx.io.err(ctx.t('cli.say.nothing'));
    return EXIT.failed;
  }
  const sent = draftCommands(reply.value.kept, {
    header: () => commandHeader(ctx),
    // openKingdomContext checked the zone, and the header's time is the clock's: the fallback never runs.
    questIdOf: (header) => questIdOfCommand(header, ctx.kingdom.tz) ?? ctx.ids.quest(),
  });
  if (!(await send(ctx, sent))) return EXIT.failed;
  reportSent(ctx, context.registry, sent);
  reportQuestion(ctx, reply.value.question);
  return EXIT.ok;
}

const WORDS: ArgumentSpec = { name: '<words>', help: 'cli.say.arg.words' };

export function sayCommand(deps: SayDeps): CommandSpec {
  return {
    name: ['say'],
    summary: 'cli.say.summary',
    args: [WORDS],
    options: {},
    run: async (input: CommandInput, cli: CliContext): Promise<ExitCode> => {
      const utterance = (input.positionals[0] ?? '').trim();
      if (utterance === '') {
        cli.io.err(cli.t('cli.say.empty'));
        return EXIT.usage;
      }
      const ctx = await openKingdomContext(input, cli);
      return ctx === undefined ? EXIT.failed : say(ctx, utterance, deps);
    },
  };
}

export const SAY: CommandSpec = sayCommand({ runnersOf: (kingdom, io) => crewOf(kingdom, io).runners });
