// A plan quest's delivery (implementation-plan §3.13, P1-14): the sub-quests its assignee wrote to subquests.json
// at the root of its plot become open quests, children of the plan quest (`created_by: council`), each made by the
// domain's questFromCommand like an owner's `create_quest`. The list is one piece of work: a file that cannot be
// read, a draft the kingdom refuses, or drafts that wait on each other in a circle open none of them, and the
// delivery note says why. Parts of a party wait for P1-18, which branches them from the contract. Each id derives
// from the plan quest and the draft's ref, so a delivery repeated after a crash finds the children it made.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  QuestDraftFileSchema,
  err,
  ok,
  formatDatedId,
  parseInstant,
  questFromCommand,
  zonedTime,
} from '@elvaria/domain';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import type { CommandPayload, Quest, QuestDraft, QuestId, Result } from '@elvaria/domain';

import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

export type Subquests =
  | { readonly status: 'opened'; readonly quests: readonly Quest[] }
  | { readonly status: 'refused'; readonly reason: string };

const refused = (reason: string): Result<Subquests, string> => ok({ status: 'refused', reason });

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The drafts of the file, or why there are none to open. */
async function draftsIn(dir: string): Promise<Result<readonly QuestDraft[], string>> {
  let text: string;
  try {
    text = await readFile(path.join(dir, SUBQUESTS_FILE), 'utf8');
  } catch {
    return err(`no ${SUBQUESTS_FILE} at the root of the plot`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return err(`${SUBQUESTS_FILE} is not JSON: ${messageOf(error)}`);
  }
  const parsed = QuestDraftFileSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    return err(`${SUBQUESTS_FILE} is no quest-draft file: ${issues.join('; ')}`);
  }
  return ok(parsed.data.drafts);
}

/** What only an owner's draft or a party may carry. */
function beyondPlan(drafts: readonly QuestDraft[]): string | undefined {
  const party = drafts.filter((draft) => draft.party_role !== undefined).map(({ ref }) => ref);
  if (party.length > 0) return `${party.join(', ')} belong to a party, whose parts open with it (P1-18)`;
  const asking = drafts.find((draft) => draft.question !== undefined);
  return asking === undefined
    ? undefined
    : `${asking.ref} asks a question: a sub-quest cannot, its plan asks in the letter`;
}

const needs = (draft: QuestDraft): string[] => [
  ...draft.depends_on_refs,
  ...(draft.parent_ref === undefined ? [] : [draft.parent_ref]),
];

/** Each draft after the drafts it names (the schema made sure they exist); undefined for a circle. */
function ordered(drafts: readonly QuestDraft[]): QuestDraft[] | undefined {
  const placed: QuestDraft[] = [];
  let rest = [...drafts];
  while (rest.length > 0) {
    const done = new Set(placed.map(({ ref }) => ref));
    const ready = rest.filter((draft) => needs(draft).every((ref) => done.has(ref)));
    if (ready.length === 0) return undefined;
    placed.push(...ready);
    rest = rest.filter((draft) => !ready.includes(draft));
  }
  return placed;
}

/**
 * The id of a child: the parent quest's day and a hash of parent and ref, the same on every try. A plan's sub-quests
 * use it, and so does the follow-up of a failed script run (P1-17).
 */
export function childIdOf(ctx: Context, plan: Quest, ref: string): QuestId {
  const zone = zonedTime(ctx.world.kingdom.tz);
  const when = parseInstant(plan.updated_at);
  // kingdom.json and the quest passed their schemas: a real zone and a real time.
  if (!zone.ok || !when.ok) return ctx.deps.ids.quest();
  const seed = createHash('sha256').update(`${plan.id}/${ref}`).digest();
  // formatDatedId with the `q` prefix produces exactly the quest id pattern.
  return formatDatedId('q', zone.value.localDate(when.value), seed) as QuestId;
}

function payloadOf(
  plan: Quest,
  draft: QuestDraft,
  ids: ReadonlyMap<string, QuestId>,
): CommandPayload<'create_quest'> {
  // party_role, contract and question were refused above (beyondPlan).
  const {
    ref: _ref,
    depends_on_refs: dependsOn,
    parent_ref: parentRef,
    party_role: _party,
    contract: _contract,
    question: _question,
    ...fields
  } = draft;
  const idOf = (ref: string): QuestId => ids.get(ref) ?? plan.id;
  return {
    draft: false,
    ...fields,
    depends_on: dependsOn.map(idOf),
    parent_id: parentRef === undefined ? plan.id : idOf(parentRef),
    ...(typeof plan.campaign_id === 'string' ? { campaign_id: plan.campaign_id } : {}),
    created_by: 'council',
  };
}

/** Every child, made but not written: one draft the kingdom refuses and none is written. */
function childrenOf(ctx: Context, plan: Quest, drafts: readonly QuestDraft[]): Result<Quest[], string> {
  const ids = new Map(drafts.map((draft) => [draft.ref, childIdOf(ctx, plan, draft.ref)]));
  const known = [...ctx.world.quests.keys(), ...ids.values()];
  const at = ctx.record.stamp();
  const made: Quest[] = [];
  for (const draft of drafts) {
    const id = ids.get(draft.ref) ?? plan.id;
    const before = ctx.world.quests.get(id);
    if (before !== undefined) {
      made.push(before);
      continue;
    }
    const quest = questFromCommand(payloadOf(plan, draft, ids), {
      id,
      at,
      breakers: ctx.world.kingdom.breakers,
      registry: ctx.world.registry,
      territories: [...ctx.world.territories.values()],
      quests: known,
    });
    if (!quest.ok) return err(`${draft.ref} is refused: ${quest.error.code}`);
    made.push(quest.value);
  }
  return ok(made);
}

/**
 * The children the plan quest's list would open, made but not written, or why it opens none. The delivery opens
 * them; the machine check before the judge (P1-15, review/subquests-check.ts) asks the same question, so a list
 * the Steward would refuse is returned to the mage instead of being delivered.
 */
export async function plannedChildren(
  ctx: Context,
  plan: Quest,
  dir: string | undefined,
): Promise<Result<Quest[], string>> {
  if (dir === undefined) return err('the quest has no plot');
  const drafts = await draftsIn(dir);
  if (!drafts.ok) return drafts;
  const beyond = beyondPlan(drafts.value);
  if (beyond !== undefined) return err(beyond);
  const order = ordered(drafts.value);
  if (order === undefined) return err('the drafts wait on each other in a circle');
  return childrenOf(ctx, plan, order);
}

/**
 * Opens the sub-quests a plan quest left in its plot (`dir`, native; undefined without a plot). An error is a file
 * the Steward could not write: the delivery waits for the next tick, which finds the children already written.
 */
export async function openSubquests(
  ctx: Context,
  plan: Quest,
  dir: string | undefined,
): Promise<Result<Subquests, string>> {
  const children = await plannedChildren(ctx, plan, dir);
  if (!children.ok) return refused(children.error);
  for (const child of children.value) {
    if (ctx.world.quests.has(child.id)) continue;
    const put = await ctx.record.put(child, 'quest.created', STEWARD);
    if (!put.ok) return put;
  }
  return ok({ status: 'opened', quests: children.value });
}
