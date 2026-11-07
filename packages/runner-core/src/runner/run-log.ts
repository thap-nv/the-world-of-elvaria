// The lines a runner writes itself (implementation-plan §3.6 "(P1-08)", §3.10, §3.12): what only the CLI's
// output knows, never what a hook already wrote. `agent.session.end` comes from the stream's result (only it has
// outcome and usage, and a killed session has no hook at all), `agent.subagent.*` from its task lines. Same order
// as the hook: stamp, redact, append to the log and to the quest's journal; a failed write never fails a session.
import { stat } from 'node:fs/promises';

import { EventSchema } from '@elvaria/domain';
import {
  createRedactor,
  createStamper,
  localTs,
  openEventLog,
  openJournal,
  redactDeep,
  tsFormatter,
} from '@elvaria/eventlog';
import type { Event } from '@elvaria/domain';
import type { Stamp } from '@elvaria/eventlog';

import { CONTEXT_ENV } from './run-context.ts';
import type { RunContext } from './run-context.ts';

export interface RunEventDraft {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface RunLog {
  /** Appends the drafts to the log and, with a quest, to its journal. Resolves with what failed; never rejects. */
  append(drafts: readonly RunEventDraft[], session?: string): Promise<readonly string[]>;
  /** The end of the quest's journal now (bytes), so `recorded` reads only what a session adds after it. */
  mark(): Promise<number>;
  /**
   * Whether the journal holds `agent.session.start` for `session` after `from`: Elvaria's SessionStart hook ran
   * for this session. undefined when there is no quest journal to tell (§3.6, spike P1-02).
   */
  recorded(session: string, from: number): Promise<boolean | undefined>;
}

export interface RunLogOptions {
  /** Epoch ms; Date.now by default. */
  readonly now?: () => number;
  /**
   * Secret values masked before the patterns (`createRedactor`): `secretValuesOf(req)`, the values the hook
   * masks too (§3.9). Without them only `redact-patterns.json` applies.
   */
  readonly known?: readonly string[];
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `ts` in the kingdom's zone; an unknown zone (Intl throws) stamps in the machine's, as the hook does. */
function formatOf(tz: string | undefined): (timeMs: number) => string {
  if (tz === undefined) return localTs;
  try {
    return tsFormatter(tz);
  } catch {
    return localTs;
  }
}

function lineOf(ctx: RunContext, draft: RunEventDraft, session: string | undefined, stamp: Stamp) {
  const { id, ts } = stamp;
  return {
    v: 1,
    id,
    ts,
    type: draft.type,
    actor: { kind: 'character', id: ctx.character },
    ...(ctx.quest === undefined ? {} : { quest: ctx.quest }),
    ...(ctx.attempt === undefined ? {} : { attempt: ctx.attempt }),
    ...(session === undefined ? {} : { session }),
    data: draft.data,
  };
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function attempt(label: string, write: () => Promise<void>): Promise<string[]> {
  try {
    await write();
    return [];
  } catch (error) {
    return [`${label}: ${errorText(error)}`];
  }
}

/** Stamps, redacts and checks the drafts; a draft the contract refuses is reported, not written. */
function linesOf(
  ctx: RunContext,
  drafts: readonly RunEventDraft[],
  session: string | undefined,
  options: RunLogOptions,
) {
  const stamp = createStamper(formatOf(ctx.tz), options.now === undefined ? {} : { now: options.now });
  const redactor = createRedactor(options.known ?? []);
  const lines: Event[] = [];
  const problems: string[] = [];
  for (const draft of drafts) {
    const checked = EventSchema.safeParse(redactDeep(lineOf(ctx, draft, session, stamp()), redactor));
    if (checked.success) lines.push(checked.data);
    else problems.push(`${draft.type} not written: ${checked.error.message}`);
  }
  return { lines, problems };
}

export function openRunLog(ctx: RunContext, options: RunLogOptions = {}): RunLog {
  const { kingdom, quest } = ctx;
  const journal = kingdom === undefined || quest === undefined ? undefined : openJournal(kingdom, quest);
  return {
    append: async (drafts, session) => {
      if (drafts.length === 0) return [];
      if (kingdom === undefined) return [`${CONTEXT_ENV.kingdom} is not set: nothing written`];
      const { lines, problems } = linesOf(ctx, drafts, session, options);
      if (lines.length === 0) return problems;
      const logged = await attempt('event log', () => openEventLog(kingdom).append(lines));
      const journaled = journal === undefined ? [] : await attempt('journal', () => journal.append(lines));
      return [...problems, ...logged, ...journaled];
    },
    mark: () => (journal === undefined ? Promise.resolve(0) : sizeOf(journal.file)),
    recorded: async (session, from) => {
      if (journal === undefined) return undefined;
      const { events } = await journal.read(from);
      return events.some((event) => event.type === 'agent.session.start' && event.session === session);
    },
  };
}
