// One hook call, from stdin to stdout and stderr, with every input passed in so specs run it in-process
// (implementation-plan §3.6). elvaria-hook.ts wires it to the real process. The exit code is always 0: a
// decision travels as JSON on stdout (draft.ts).
import { translateClaude } from './claude/translate.ts';
import { loadContext } from './context.ts';
import { errorText } from './draft.ts';
import { appendDrafts, intlTs } from './write.ts';
import type { HookEnv } from './context.ts';
import type { TsFormat } from './write.ts';

export interface HookIo {
  /** The CLI's payload, JSON. */
  readonly stdin: string;
  readonly env: HookEnv;
  /** Arguments after the script: `--policy <file>`. */
  readonly argv: readonly string[];
  /** Epoch ms of this call. */
  readonly now: number;
  /** How `ts` is written; default Intl. The hook process sets its own TZ instead (elvaria-hook.ts). */
  readonly tsFormat?: TsFormat;
}

export interface HookOutcome {
  /** The decision as one JSON line when the call is stopped (a law, the apprentice rule, the letter); else ''. */
  readonly stdout: string;
  /** Notes for the run's log: missing context, failed writes. Never read as a decision. */
  readonly stderr: string;
}

const PREFIX = 'elvaria-hook';

function payloadOf(stdin: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(stdin);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const notes = (problems: readonly string[]): string =>
  problems.map((problem) => `${PREFIX}: ${problem}\n`).join('');

export async function runHook(io: HookIo): Promise<HookOutcome> {
  const payload = payloadOf(io.stdin);
  if (payload === undefined) return { stdout: '', stderr: notes(['stdin is not a JSON object; ignored']) };
  const ctx = loadContext(io.env, io.argv);
  const result = translateClaude(payload, ctx);
  const session =
    typeof payload.session_id === 'string' && payload.session_id !== '' ? payload.session_id : undefined;
  let written: string[];
  try {
    written = await appendDrafts(result.drafts, ctx, {
      session,
      now: io.now,
      tsFormat: io.tsFormat ?? intlTs,
    });
  } catch (error) {
    written = [`events not written: ${errorText(error)}`];
  }
  return {
    stdout: result.decision === undefined ? '' : `${JSON.stringify(result.decision)}\n`,
    stderr: notes([...ctx.problems, ...result.problems, ...written]),
  };
}
