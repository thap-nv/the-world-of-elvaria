// What the Steward writes for the owner's quest commands (implementation-plan §2.3 inbox-command, ADR 0005): a new
// quest file from `create_quest`, and the fields `edit_quest` and `set_rank` change. Status still moves only through
// transition(); these change the other fields, checked by the quest schema like any write.
import { err, ok } from '../core/result.ts';
import { RANKS } from '../schema/common.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import type { QuestId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Rank } from '../schema/common.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';
import type { Kind } from '../schema/registry-entries.ts';
import type { Territory } from '../schema/territory.ts';
import type { z } from 'zod';

/** Why a quest command is refused; the Steward writes the code as `command.rejected.reason`. */
export type QuestCommandProblem =
  | 'unknown_kind'
  | 'unknown_territory'
  | 'secret_not_allowed'
  | 'class_not_allowed'
  | 'unknown_tag'
  | 'unknown_script'
  | 'script_not_for_kind'
  | 'unknown_dependency'
  | 'self_dependency'
  | 'stale'
  | 'archived'
  | 'invalid_quest';

export interface QuestCommandError {
  readonly code: QuestCommandProblem;
  /** invalid_quest: what the quest schema said, in English, for logs. */
  readonly issues?: readonly string[];
}

export interface NewQuestContext {
  /** The id the Steward gives the quest. */
  readonly id: QuestId;
  /** ISO 8601 with the kingdom's offset: created_at and updated_at. */
  readonly at: string;
  readonly breakers: Kingdom['breakers'];
  readonly registry: Pick<Registry, 'kinds' | 'tags' | 'scripts'>;
  /** The kingdom's territories, with the treasury names each lets its quests ask for. */
  readonly territories: readonly Pick<Territory, 'id' | 'secrets_allowed'>[];
  readonly quests: readonly QuestId[];
}

type CreateQuest = CommandPayload<'create_quest'>;

/**
 * The secrets a quest asks for that its territory does not allow (ADR 0013: `secrets_required ⊆
 * secrets_allowed`). The Steward refuses such a quest when it is created, and refuses its session if the
 * territory has dropped a name since.
 */
export const secretsBeyond = (
  required: readonly string[],
  territory: Pick<Territory, 'secrets_allowed'>,
): string[] => required.filter((name) => !territory.secrets_allowed.includes(name));

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);

function parsed(value: unknown): Result<Quest, QuestCommandError> {
  const result = QuestSchema.safeParse(value);
  return result.success ? ok(result.data) : err({ code: 'invalid_quest', issues: issuesOf(result.error) });
}

/** The first reference of the command that the kingdom does not have, if any. */
function problemOf(
  payload: CreateQuest,
  kind: Kind,
  context: NewQuestContext,
): QuestCommandProblem | undefined {
  const territory = context.territories.find(({ id }) => id === payload.territory);
  if (territory === undefined) return 'unknown_territory';
  if (secretsBeyond(payload.secrets_required ?? [], territory).length > 0) return 'secret_not_allowed';
  if (payload.class_required !== undefined && !kind.classes_allowed.includes(payload.class_required))
    return 'class_not_allowed';
  const tags = new Set(context.registry.tags.map(({ id }) => id));
  if (payload.tags.some((tag) => !tags.has(tag))) return 'unknown_tag';
  const script = context.registry.scripts.find(({ id }) => id === payload.script?.id);
  if (payload.script !== undefined && script === undefined) return 'unknown_script';
  if (script !== undefined && !script.kinds.includes(kind.id)) return 'script_not_for_kind';
  if ((payload.depends_on ?? []).some((id) => !context.quests.includes(id))) return 'unknown_dependency';
  return undefined;
}

/**
 * The budget of a new quest (§2.3: derived from kingdom.breakers and the rank). Without the Chancellor's estimate,
 * the context budget of one quest stands in for it, so the token breaker has a ceiling from the start.
 */
function budgetOf(rank: Rank, estimate: CreateQuest['estimate'], breakers: Kingdom['breakers']) {
  const high = RANKS.indexOf(rank) >= RANKS.indexOf(breakers.high_rank_from);
  const minutes = high ? breakers.attempt_minutes.high : breakers.attempt_minutes.low;
  const guess = estimate ?? { tokens: breakers.context_budget_tokens, minutes };
  return {
    budget: {
      max_minutes: minutes,
      max_tokens: Math.round(guess.tokens * breakers.mana_multiplier),
      max_attempts: breakers.max_attempts,
    },
    estimate: guess,
  };
}

/** The quest a `create_quest` command asks for: `draft` from the Chancellor, `open` from `elvaria quest add`. */
export function questFromCommand(
  payload: CreateQuest,
  context: NewQuestContext,
): Result<Quest, QuestCommandError> {
  const kind = context.registry.kinds.find(({ id }) => id === payload.kind);
  if (kind === undefined) return err({ code: 'unknown_kind' });
  const problem = problemOf(payload, kind, context);
  if (problem !== undefined) return err({ code: problem });
  const { draft, question, party_role: partyRole, estimate, ...fields } = payload;
  return parsed({
    version: 1,
    id: context.id,
    ...fields,
    ...(partyRole === undefined ? {} : { party_role: partyRole, party_id: context.id }),
    status: draft ? 'draft' : 'open',
    assignee: null,
    verifier: null,
    ...budgetOf(payload.rank, estimate, context.breakers),
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: kind.deliverable_type },
    seal_required: payload.seal_required ?? kind.seal_default,
    ...(question === undefined ? {} : { blocked: { question, asked_at: context.at } }),
    created_at: context.at,
    updated_at: context.at,
  });
}

type Changes = CommandPayload<'edit_quest'>['changes'];

function withChanges(quest: Quest, changes: Changes, at: string, quests: readonly QuestId[]) {
  if (quest.status === 'archived') return err({ code: 'archived' } as const);
  const dependsOn = changes.depends_on ?? [];
  if (dependsOn.includes(quest.id)) return err({ code: 'self_dependency' } as const);
  if (dependsOn.some((id) => !quests.includes(id))) return err({ code: 'unknown_dependency' } as const);
  const { budget, ...rest } = changes;
  return parsed({ ...quest, ...rest, budget: { ...quest.budget, ...budget }, updated_at: at });
}

/**
 * `edit_quest`: the owner changes fields of a quest it read at `expected_updated_at`; refused when the quest moved
 * since, so an edit never overwrites a change the owner has not seen (§9.2).
 */
export function editQuest(
  quest: Quest,
  payload: CommandPayload<'edit_quest'>,
  context: { readonly at: string; readonly quests: readonly QuestId[] },
): Result<Quest, QuestCommandError> {
  if (payload.expected_updated_at !== quest.updated_at) return err({ code: 'stale' });
  return withChanges(quest, payload.changes, context.at, context.quests);
}

/** `set_rank`: the owner lowers (or raises) a quest's rank, e.g. one nobody can take (§3.1). */
export const setRank = (quest: Quest, rank: Rank, at: string): Result<Quest, QuestCommandError> =>
  withChanges(quest, { rank }, at, []);
