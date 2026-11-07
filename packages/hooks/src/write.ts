// From drafts to lines on disk, in the order implementation-plan §3.6 fixes: stamp → redactDeep → cut long
// strings → append to the log and to the quest's journal. A failed write never blocks the session: it is
// reported on stderr and the call exits as the laws decided.
import {
  createRedactor,
  createStamper,
  localTs,
  openEventLog,
  openJournal,
  redactDeep,
  tsFormatter,
} from '@elvaria/eventlog';
import type { EventLog } from '@elvaria/eventlog';

import { errorText } from './draft.ts';
import { fitLine } from './fit-line.ts';
import type { HookContext } from './context.ts';
import type { Draft } from './draft.ts';

/** A line of the log, as EventLog.append takes it; the hook may not import the domain to name it (§1.4). */
type Event = Parameters<EventLog['append']>[0][number];

interface HookLine {
  readonly v: 1;
  readonly id: string;
  readonly ts: string;
  readonly type: string;
  readonly actor: { readonly kind: 'character'; readonly id: string } | { readonly kind: 'system' };
  readonly quest?: string;
  readonly attempt?: number;
  readonly session?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** How `ts` is written for the zone of the context (undefined: the machine's). */
export type TsFormat = (tz: string | undefined) => (timeMs: number) => string;

/** Intl, exact, for any zone: the default, and what specs run in-process use. */
export const intlTs: TsFormat = (tz) => (tz === undefined ? localTs : tsFormatter(tz));

function lineOf(
  draft: Draft,
  ctx: HookContext,
  session: string | undefined,
  stamp: { id: string; ts: string },
) {
  const line: HookLine = {
    v: 1,
    id: stamp.id,
    ts: stamp.ts,
    type: draft.type,
    actor: ctx.character === undefined ? { kind: 'system' } : { kind: 'character', id: ctx.character },
    ...(ctx.quest === undefined ? {} : { quest: ctx.quest }),
    ...(ctx.attempt === undefined ? {} : { attempt: ctx.attempt }),
    ...(session === undefined ? {} : { session }),
    data: draft.data,
  };
  return line;
}

export interface CallStamp {
  readonly session: string | undefined;
  /** Epoch ms of the call. */
  readonly now: number;
  readonly tsFormat: TsFormat;
}

/** Stamps, redacts and cuts the drafts of one call. */
export function linesOf(drafts: readonly Draft[], ctx: HookContext, call: CallStamp): Event[] {
  const { session, now } = call;
  const stamp = createStamper(call.tsFormat(ctx.tz), { now: () => now });
  // The session's secret values (policy.json names them, the env holds them), then the patterns (§3.9).
  const redactor = createRedactor(ctx.known);
  // The stamps have the contract's shapes and context.ts checks the ids it passes on; the specs read every
  // line back through the domain's EventSchema (run-hook.spec.ts, hook-process.spec.ts).
  return drafts.map((draft) => fitLine(redactDeep(lineOf(draft, ctx, session, stamp()), redactor)) as Event);
}

async function attempt(label: string, write: () => Promise<void>): Promise<string[]> {
  try {
    await write();
    return [];
  } catch (error) {
    return [`${label}: ${errorText(error)}`];
  }
}

/** Appends the drafts of one call to the log and, with a quest, to its journal. Returns what failed. */
export async function appendDrafts(
  drafts: readonly Draft[],
  ctx: HookContext,
  call: CallStamp,
): Promise<string[]> {
  if (drafts.length === 0) return [];
  const { kingdom, quest } = ctx;
  if (kingdom === undefined) return ['ELVARIA_KINGDOM is not set: nothing written'];
  let lines: Event[];
  try {
    lines = linesOf(drafts, ctx, call);
  } catch (error) {
    return [`events not built: ${errorText(error)}`];
  }
  const logged = await attempt('event log', () => openEventLog(kingdom).append(lines));
  if (quest === undefined) return logged;
  return [...logged, ...(await attempt('journal', () => openJournal(kingdom, quest).append(lines)))];
}
