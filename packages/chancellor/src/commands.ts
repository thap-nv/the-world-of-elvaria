// Drafts → `create_quest` commands with draft = true (implementation-plan §3.11, ADR 0005): the Chancellor writes
// no quest, the Steward does when it applies the commands. Refs name drafts within one reply; a command names
// quests, so each ref becomes the id the Steward will give that draft's quest (derived from the command id), and
// the commands go in the order screenDrafts gave: the Steward applies the inbox in id order, so a quest exists
// before the commands that depend on it.
import type { InboxCommandInput, QuestDraft, QuestId } from '@elvaria/domain';

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

function payloadOf(draft: QuestDraft, quests: ReadonlyMap<string, QuestId>): CreateQuestCommand['payload'] {
  // contract is a part's field: screenDrafts dropped every part.
  const { ref: _ref, depends_on_refs, parent_ref, party_role, contract: _contract, ...fields } = draft;
  const dependsOn = depends_on_refs.flatMap((name) => quests.get(name) ?? []);
  const parent = parent_ref === undefined ? undefined : quests.get(parent_ref);
  return {
    draft: true,
    ...fields,
    ...(party_role === 'contract' ? { party_role } : {}),
    ...(dependsOn.length === 0 ? {} : { depends_on: dependsOn }),
    ...(parent === undefined ? {} : { parent_id: parent }),
    created_by: 'chancellor',
  };
}

/** One create_quest per draft, in the drafts' order; each draft comes after what it names (screenDrafts). */
export function draftCommands(drafts: readonly QuestDraft[], source: CommandSource): DraftCommand[] {
  const quests = new Map<string, QuestId>();
  return drafts.map((draft) => {
    const header = source.header();
    const command: CreateQuestCommand = {
      ...header,
      kind: 'create_quest',
      payload: payloadOf(draft, quests),
    };
    const quest = source.questIdOf(header);
    quests.set(draft.ref, quest);
    return { ref: draft.ref, quest, command };
  });
}
