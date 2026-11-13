// Drafts → `create_quest` commands with draft = true (implementation-plan §3.11, ADR 0005): the Chancellor writes
// no quest, the Steward does when it applies the commands. Refs name drafts within one reply; a command names
// quests, so each ref becomes the id the Steward will give that draft's quest (derived from the command id), and
// the commands go in the order screenDrafts gave: the Steward applies the inbox in id order, so a quest exists
// before the commands that depend on it.
// A brief (PS-06) is copied into the description of the plan draft it names, and that quest waits for the owner's
// seal: the one seal of the council (ADR 0028).
import { questEstimateOf } from '@elvaria/domain';
import type { Brief, InboxCommandInput, MemoId, QuestDraft, QuestId } from '@elvaria/domain';

export type CreateQuestCommand = Extract<InboxCommandInput, { kind: 'create_quest' }>;
export type CommandHeader = Omit<CreateQuestCommand, 'kind' | 'payload'>;

export interface DraftCommand {
  readonly ref: string;
  /** The quest the Steward makes of it, for `elvaria quest confirm <id>`. */
  readonly quest: QuestId;
  readonly command: CreateQuestCommand;
}

export interface CommandSource {
  /** A new header per command: ids that grow, so the inbox keeps the drafts' order. */
  readonly header: () => CommandHeader;
  /** The id the Steward gives the quest of a create_quest with this header. */
  readonly questIdOf: (header: CommandHeader) => QuestId;
}

/** The create_quest payload of one draft, as a draft; `quests` gives the ids of the drafts it names. */
export function draftPayloadOf(
  draft: QuestDraft,
  quests: ReadonlyMap<string, QuestId>,
): CreateQuestCommand['payload'] {
  // contract is a part's field: screenDrafts dropped every part.
  const {
    ref: _ref,
    depends_on_refs,
    parent_ref,
    party_role,
    contract: _contract,
    estimate,
    ...fields
  } = draft;
  const dependsOn = depends_on_refs.flatMap((name) => quests.get(name) ?? []);
  const parent = parent_ref === undefined ? undefined : quests.get(parent_ref);
  return {
    draft: true,
    ...fields,
    // The peak context is a planning number of the draft (PS-06): the quest keeps tokens and minutes.
    estimate: questEstimateOf(estimate),
    ...(party_role === 'contract' ? { party_role } : {}),
    ...(dependsOn.length === 0 ? {} : { depends_on: dependsOn }),
    ...(parent === undefined ? {} : { parent_id: parent }),
    created_by: 'chancellor',
  };
}

const items = (lines: readonly string[]): string =>
  lines.length === 0 ? '- None.' : lines.map((line) => `- ${line}`).join('\n');

/**
 * The brief as the plan quest's description opens: its headings in English like the quest template's, its text as the
 * Chancellor wrote it. The owner reads it in `elvaria say` and `quest show`; the mage plans from it.
 */
export function briefText(brief: Brief): string {
  const questions = brief.questions.map(
    ({ question, recommended }) => `${question} Recommended: ${recommended}`,
  );
  return [
    '## Brief',
    `### Goal\n\n${brief.goal}`,
    `### Out of scope\n\n${items(brief.out_of_scope)}`,
    `### Acceptance examples\n\n${items(brief.acceptance_examples)}`,
    `### Assumptions\n\n${items(brief.assumptions)}`,
    `### Questions, with the answers the owner accepted by confirming this quest\n\n${items(questions)}`,
  ].join('\n\n');
}

/** The payload of the draft the brief names: the brief before its description, and the owner's seal. */
function briefed(payload: CreateQuestCommand['payload'], brief: Brief): CreateQuestCommand['payload'] {
  return { ...payload, description: `${briefText(brief)}\n\n${payload.description}`, seal_required: true };
}

/**
 * One create_quest per draft, in the drafts' order; each draft comes after what it names (screenDrafts). `memos`
 * (PS-03b, `elvaria say --memo`): the memos the drafts are made from, which the first one confirmed closes. `brief`
 * (PS-06): the reply's, which opens the description of the plan draft it names.
 */
export function draftCommands(
  drafts: readonly QuestDraft[],
  source: CommandSource,
  memos: readonly MemoId[] = [],
  brief?: Brief,
): DraftCommand[] {
  const quests = new Map<string, QuestId>();
  return drafts.map((draft) => {
    const header = source.header();
    const own = draftPayloadOf(draft, quests);
    const payload = brief?.plan_ref === draft.ref ? briefed(own, brief) : own;
    const command: CreateQuestCommand = {
      ...header,
      kind: 'create_quest',
      payload: memos.length === 0 ? payload : { ...payload, memos: [...memos] },
    };
    const quest = source.questIdOf(header);
    quests.set(draft.ref, quest);
    return { ref: draft.ref, quest, command };
  });
}
