// The code graph a session asks (PS-21, ADR 0029): the graph of the commit the quest's branch forked from (its plot
// record), when the territory has `code_graph` on, the kingdom has graphify pinned and the graph is built. A graph
// still to build is asked for here and the session opens without it: a build never holds a session.
import type { Quest, Territory } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';
import type { GraphNote } from '../graph-builds.ts';

/** The graph a session gets: the commit, for its prompt, and the folder, for its GRAPHIFY_OUT. */
export interface SessionGraph {
  readonly commit: string;
  readonly dir: string;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A `graph.*` line through the tick that asked; one that cannot be written costs a log line, never the graph. */
export const graphNoteOf =
  (ctx: Context): GraphNote =>
  async (type, territory, data) => {
    try {
      await ctx.record.note({ type, actor: STEWARD, data, territory });
    } catch (error) {
      ctx.deps.log.warn(`steward: ${territory}: no ${type} line: ${messageOf(error)}`);
    }
  };

/** The territory may have graphs at all: its switch is on, it is a git territory and graphify is pinned. */
export const graphsFor = (ctx: Context, territory: Territory): boolean =>
  ctx.graphs !== undefined &&
  ctx.deps.graphs !== undefined &&
  territory.code_graph === true &&
  territory.vcs.type === 'git';

/** The quest's graph when it is built; undefined otherwise, its build asked for when the territory has graphs. */
export async function sessionGraphOf(
  ctx: Context,
  quest: Quest,
  territory: Territory,
): Promise<SessionGraph | undefined> {
  const { graphs } = ctx;
  const port = ctx.deps.graphs;
  if (!graphsFor(ctx, territory) || graphs === undefined || port === undefined) return undefined;
  // A plot without a record of its fork point (a folder, no git) has no graph: base() says null.
  if (quest.plot.path === undefined) return undefined;
  const commit = await port.base(quest.plot.path);
  if (commit === null) return undefined;
  const dir = await graphs.want(territory, commit, graphNoteOf(ctx));
  return dir === undefined ? undefined : { commit, dir };
}

/**
 * The tip of each graphed territory's default branch, asked for at every tick (PS-21): a quest prepared from it
 * finds its graph built before its first session, which would otherwise open without one.
 */
export async function wantTipGraphs(ctx: Context): Promise<void> {
  const { graphs } = ctx;
  const port = ctx.deps.graphs;
  if (graphs === undefined || port === undefined) return;
  for (const territory of ctx.world.territories.values()) {
    if (!graphsFor(ctx, territory)) continue;
    const tip = await port.head(territory);
    if (tip !== null) await graphs.want(territory, tip, graphNoteOf(ctx));
  }
}
