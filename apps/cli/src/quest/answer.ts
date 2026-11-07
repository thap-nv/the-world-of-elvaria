// `elvaria answer <quest> "<answer>"`: the owner answers the question a character asked before its session ended
// (implementation-plan §2.4, §2.5 `blocked.answer`). Like seal and return it is an inbox command the Steward
// applies (ADR 0005): the same attempt goes on, in the asking session when the answer comes within
// dispatch.resume_after_answer_minutes and the adapter can resume, else in a fresh one from the letter (ADR 0017).
// The answer waits in the inbox while the asker is busy or its pool is asleep, so sending it never fails for that.
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { questFor } from './lifecycle.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runAnswer(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  // An empty answer is a command line to fix, not a quest to refuse: checked before the kingdom is opened.
  const answer = (input.positionals[1] ?? '').trim();
  if (answer === '') {
    cli.io.err(cli.t('cli.answer.empty'));
    return EXIT.usage;
  }
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'answer', 'cli.answer.refused');
  if (quest === undefined) return EXIT.failed;
  const payload = { quest: quest.id, answer };
  return sendCommand(ctx, { ...commandHeader(ctx), kind: 'answer', payload }, 'cli.answer.sent', {
    id: quest.id,
  });
}

export const ANSWER: CommandSpec = {
  name: ['answer'],
  summary: 'cli.answer.summary',
  args: [
    { name: '<quest>', help: 'cli.quest.arg.quest' },
    { name: '<answer>', help: 'cli.answer.arg.answer' },
  ],
  options: {},
  run: runAnswer,
};
