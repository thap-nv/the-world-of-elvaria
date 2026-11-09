// How a session is spawned, as its tribe's limits ask (implementation-plan §3.14, tribeLimitsOf, P1-33): a reply the
// CLI cannot enforce goes into the prompt with one retry (`structured_output: prompt_and_parse`), an assignee of a
// tribe without the Stop hook is reminded of its letter after the session (`handover_check: after_session`); any
// other request goes to the runner as it is. To the Steward each is one session.
import { spawnParsed, spawnSequel } from '@elvaria/runner-core';
import type { AgentRunner, ParseOptions, RunningSession, SpawnRequest } from '@elvaria/runner-core';

import { checksLetterAfter, letterSequel, rememberLetter } from './letter.ts';
import type { Context } from '../context.ts';

/** `parse`: how a judge of a tribe without structured output replies (judgeParseOf); undefined otherwise. */
export async function spawnOf(
  ctx: Context,
  runner: AgentRunner,
  request: SpawnRequest,
  parse: ParseOptions | undefined,
): Promise<RunningSession> {
  const { structured, quest, handover } = request;
  if (parse !== undefined && structured !== undefined)
    return spawnParsed(runner, { ...request, structured }, parse);
  if (quest === undefined || handover === undefined || !checksLetterAfter(ctx, request.character.tribe))
    return runner.spawn(request);
  // The letter as this attempt's first session finds it; a revival of the attempt keeps the first note.
  await rememberLetter(request.run_dir, handover);
  return spawnSequel(runner, request, letterSequel(ctx, quest, request.run_dir));
}
