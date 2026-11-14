// The CLIs of the tribes, asked before the plan (A1b of the lessons of 2026-11-13): agy replaced agy.exe in place from
// 1.5.6 with 1.5.7 under a pinned version, and the Steward went on opening its sessions; a VS Code update removes the
// folder of a pinned CLI (Codex, 2026-11-14), and every session then fails to start. planTick holds a tribe whose CLI
// is gone or says another version than the one its last `tribe check` with the real CLI passed on (versionHoldsOf);
// this step asks, keeps the answers for the snapshot and the digest, and rings once per hold.
import { versionHoldsOf } from '@elvaria/domain';
import type { ToolFound, ToolsFound, TribeHold, TribeId } from '@elvaria/domain';

import { ring } from './context.ts';
import type { Context } from './context.ts';

/**
 * `<cli> --version` costs no mana but is a process: each tribe is asked at most once a minute. A CLI that updates
 * itself between two asks can open sessions for up to that long; one that updates while the Steward sleeps is caught
 * at the first tick.
 */
export const VERSION_ASK_MS = 60_000;

export interface VersionBook {
  /** The last answer about each tribe's CLI (undefined: it did not answer), and when it came (the clock's ms). */
  readonly asked: Map<TribeId, { readonly found: ToolFound | undefined; readonly at: number }>;
  /** The holds the bell told, by tribe, as `version` (or `gone`): told again only when that changes. */
  readonly told: Map<TribeId, string>;
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

const toldAs = (hold: TribeHold): string => hold.version ?? 'gone';

/** Rings for each hold the bell has not told as it stands; a tribe no longer held is forgotten. */
async function tell(ctx: Context, book: VersionBook): Promise<void> {
  const held = new Set(book.holds.map(({ tribe }) => tribe));
  for (const tribe of [...book.told.keys()].filter((id) => !held.has(id))) book.told.delete(tribe);
  for (const hold of book.holds.filter((entry) => book.told.get(entry.tribe) !== toldAs(entry))) {
    book.told.set(hold.tribe, toldAs(hold));
    await ring(ctx, { kind: 'tribe_held', ...hold });
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
