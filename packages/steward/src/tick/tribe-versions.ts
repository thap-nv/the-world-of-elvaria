// The CLIs of the tribes, asked before the plan (A1b of the lessons of 2026-11-13): agy replaced agy.exe in place from
// 1.5.6 with 1.5.7 under a pinned version, and the Steward went on opening its sessions; a VS Code update removes the
// folder of a pinned CLI (Codex, 2026-11-14), and every session then fails to start. planTick holds a tribe whose CLI
// is gone or says another version than the one its last `tribe check` with the real CLI passed on (versionHoldsOf);
// this step asks, keeps the answers for the snapshot, and rings once per hold. (P2-04) It writes a `tribe.held` line
// when a hold appears or changes and `hold: null` when it ends, so the digest reads the holds from the log and a
// restart, which rebuilds what it told from there, rings none again.
import { tribeHoldsOf, versionHoldsOf } from '@elvaria/domain';
import type { Event, ToolFound, ToolsFound, TribeHeldNote, TribeHold, TribeId } from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD } from '../quest/record.ts';
import type { Context } from '../context.ts';

/** A hold as its line says it. */
type LoggedHold = NonNullable<TribeHeldNote['hold']>;

/**
 * `<cli> --version` costs no mana but is a process: each tribe is asked at most once a minute. A CLI that updates
 * itself between two asks can open sessions for up to that long; one that updates while the Steward sleeps is caught
 * at the first tick.
 */
export const VERSION_ASK_MS = 60_000;

export interface VersionBook {
  /** The last answer about each tribe's CLI (undefined: it did not answer), and when it came (the clock's ms). */
  readonly asked: Map<TribeId, { readonly found: ToolFound | undefined; readonly at: number }>;
  /** The holds the log says, by tribe: a line when one changes, the bell when its `version` (or `null`, gone) does. */
  readonly told: Map<TribeId, LoggedHold>;
  /** The holds of the last tick, for the digest. */
  holds: readonly TribeHold[];
}

export const createVersionBook = (): VersionBook => ({ asked: new Map(), told: new Map(), holds: [] });

/** Enabled tribes with a runner and a pinned CLI: the only ones a version can hold. */
const askable = (ctx: Context): TribeId[] =>
  ctx.world.kingdom.tribes
    .filter((tribe) => tribe.enabled && tribe.tool !== undefined && ctx.deps.runners[tribe.id] !== undefined)
    .map(({ id }) => id);

async function ask(ctx: Context, book: VersionBook, tribe: TribeId, now: number): Promise<void> {
  const probe = ctx.deps.toolFound;
  const last = book.asked.get(tribe);
  if (probe === undefined || (last !== undefined && now - last.at < VERSION_ASK_MS)) return;
  // A probe that throws tells nothing, as one whose CLI did not answer: neither holds the tribe.
  const found = await probe(tribe).catch(() => undefined);
  book.asked.set(tribe, { found, at: now });
}

/** The holds the last Steward told, from the log (P2-04). */
export function recoverVersions(book: VersionBook, events: readonly Event[]): void {
  for (const [tribe, hold] of tribeHoldsOf(events)) book.told.set(tribe, hold);
}

const loggedOf = ({ path, version, checked }: TribeHold): LoggedHold => ({
  path,
  version: version ?? null,
  checked,
});

/** Tells each hold that appeared or changed, ringing when its version did, and each tribe no longer held. */
async function tell(ctx: Context, book: VersionBook): Promise<void> {
  const held = new Set(book.holds.map(({ tribe }) => tribe));
  for (const tribe of [...book.told.keys()].filter((id) => !held.has(id))) {
    book.told.delete(tribe);
    await ctx.record.note({ type: 'tribe.held', actor: STEWARD, data: { tribe, hold: null } });
  }
  for (const hold of book.holds) {
    const before = book.told.get(hold.tribe);
    const logged = loggedOf(hold);
    if (JSON.stringify(before) === JSON.stringify(logged)) continue;
    book.told.set(hold.tribe, logged);
    await ctx.record.note({ type: 'tribe.held', actor: STEWARD, data: { tribe: hold.tribe, hold: logged } });
    if (before?.version !== logged.version) await ring(ctx, { kind: 'tribe_held', ...hold });
  }
}

/** The CLIs planTick holds the tribes to, asked where the answer is stale; none without `deps.toolFound`. */
export async function versionStep(ctx: Context, book: VersionBook): Promise<ToolsFound> {
  if (ctx.deps.toolFound === undefined) return {};
  const now = ctx.deps.clock.now();
  const tribes = askable(ctx);
  await Promise.all(tribes.map((tribe) => ask(ctx, book, tribe, now)));
  const found: Partial<Record<TribeId, ToolFound>> = {};
  for (const tribe of tribes) {
    const answer = book.asked.get(tribe)?.found;
    if (answer !== undefined) found[tribe] = answer;
  }
  book.holds = versionHoldsOf(ctx.world.kingdom.tribes, found);
  await tell(ctx, book);
  return found;
}
