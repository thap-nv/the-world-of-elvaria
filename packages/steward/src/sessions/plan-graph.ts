// The code graph in planning (implementation-plan §3.16.6, PS-21b, ADR 0029): what the Steward reads from a plan
// quest's graph before its sessions open. Its mage gets the impact of the quest's scope (the files outside it that use
// code in it), an input to the ranks of the sub-quests (owner, 2026-11-13); its judge gets the sub-quests that may run
// at once, scopes apart, whose code the graph links (planLinksOf): a warning, never a fail. Only for a kind whose
// deliverable is sub-quests (by the registry's data, ADR 0016), and only with the quest's graph built; anything that
// cannot be read leaves the line out, never the session.
import { impactOf, planLinksOf, scopeOf, sharedGlobsOf } from '@elvaria/domain';
import { readGraphLinks, scopeCovers } from '@elvaria/runner-core';
import type { PlanLink, Quest } from '@elvaria/domain';

import { plotDirOf } from '../deliver/deliver.ts';
import { draftsIn } from '../deliver/subquests.ts';
import type { Context } from '../context.ts';
import type { SessionInput } from './input.ts';
import type { SessionGraph } from './graph.ts';

/** What the prompt of a plan quest's session adds from its graph; empty for every other session. */
export interface PlanGraphFacts {
  /** The assignee's: the files outside the quest's scope that use code in it. */
  readonly impact?: readonly string[];
  /** The judge's: the sub-quests the graph links. */
  readonly plan_links?: readonly PlanLink[];
}

const deliversSubquests = (ctx: Context, quest: Quest): boolean =>
  ctx.world.registry.kinds.some(
    ({ id, deliverable_type: type }) => id === quest.kind && type === 'subquests',
  );

async function judgeLinks(ctx: Context, quest: Quest, graphDir: string): Promise<PlanGraphFacts> {
  const dir = plotDirOf(ctx, quest.plot);
  const drafts = dir === undefined ? undefined : await draftsIn(dir);
  if (!drafts?.ok) return {};
  const links = await readGraphLinks(graphDir);
  if (links === undefined) return {};
  const shared = sharedGlobsOf(ctx.world.territories.get(quest.territory));
  const found = planLinksOf(drafts.value, {
    territory: quest.territory,
    links,
    shared,
    covers: scopeCovers(),
  });
  return found.length === 0 ? {} : { plan_links: found };
}

async function assigneeImpact(quest: Quest, graphDir: string): Promise<PlanGraphFacts> {
  const scope = scopeOf(quest);
  if (scope.length === 0) return {};
  const links = await readGraphLinks(graphDir);
  if (links === undefined) return {};
  const covers = scopeCovers();
  return { impact: impactOf(links, (path) => covers(path, scope)) };
}

/** The plan quest's facts from its graph for this session; none without a graph or for any other quest. */
export async function planGraphFactsOf(
  ctx: Context,
  input: Pick<SessionInput, 'quest' | 'role'>,
  graph: SessionGraph | undefined,
): Promise<PlanGraphFacts> {
  if (graph === undefined || !deliversSubquests(ctx, input.quest)) return {};
  return input.role === 'verifier'
    ? judgeLinks(ctx, input.quest, graph.dir)
    : assigneeImpact(input.quest, graph.dir);
}
