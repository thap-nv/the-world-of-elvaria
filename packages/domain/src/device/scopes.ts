// What a command reaches (P2-01, ADR 0037): the territories it touches, through the territory, quests and memos its
// payload names, or the whole kingdom. A scoped or inquiry device may only send a command whose every territory it
// was given. One row per kind: a kind without a row fails tsc, and no code outside this table looks at the kind.
import type { MemoId, QuestId, TerritoryId } from '../core/ids.ts';
import type { CommandPayload, InboxCommand, InboxCommandKind } from '../schema/command/inbox-command.ts';

/** What a payload names. `kingdom` is set by what belongs to no territory (a campaign, a tribe, a character alone). */
export interface CommandRefs {
  readonly territories: readonly TerritoryId[];
  readonly quests: readonly QuestId[];
  readonly memos: readonly MemoId[];
  readonly kingdom: boolean;
}

type RefsOf<K extends InboxCommandKind> = (payload: CommandPayload<K>) => CommandRefs;
type ScopeTable = { readonly [K in InboxCommandKind]: RefsOf<K> };

const NONE: CommandRefs = { territories: [], quests: [], memos: [], kingdom: false };
const refs = (named: Partial<CommandRefs>): CommandRefs => ({ ...NONE, ...named });
const present = <T>(value: T | undefined): T[] => (value === undefined ? [] : [value]);

const kingdom = (): CommandRefs => refs({ kingdom: true });
const onQuest = ({ quest }: { readonly quest: QuestId }): CommandRefs => refs({ quests: [quest] });
const onTerritory = ({ territory }: { readonly territory: TerritoryId }): CommandRefs =>
  refs({ territories: [territory] });
/** A memo command reaches the memo's quest, and the quest it names as the one doing the work. */
const onMemo = ({ memo, quest }: { readonly memo: MemoId; readonly quest?: QuestId | undefined }) =>
  refs({ memos: [memo], quests: present(quest) });

const createQuest = (payload: CommandPayload<'create_quest'>): CommandRefs =>
  refs({
    territories: [payload.territory],
    quests: [...(payload.depends_on ?? []), ...present(payload.parent_id)],
    memos: payload.memos ?? [],
    // A campaign spans territories, and a limited device does not see campaigns (W6).
    kingdom: payload.campaign_id !== undefined,
  });

const editQuest = (payload: CommandPayload<'edit_quest'>): CommandRefs =>
  refs({ quests: [payload.quest, ...(payload.changes.depends_on ?? [])], memos: payload.memos ?? [] });

export const COMMAND_SCOPES: ScopeTable = {
  confirm: onQuest,
  seal: onQuest,
  return: onQuest,
  retry: onQuest,
  cancel: onQuest,
  archive: onQuest,
  summon: kingdom,
  wake: kingdom,
  suspend: kingdom,
  release: kingdom,
  reassign: onQuest,
  send_to_temple: kingdom,
  declare_campaign: kingdom,
  close_campaign: kingdom,
  create_quest: createQuest,
  answer: onQuest,
  set_rank: onQuest,
  // The territory does not exist yet: attaching one changes the kingdom.
  attach_territory: kingdom,
  edit_quest: editQuest,
  pin_tag: kingdom,
  set_level: kingdom,
  set_model: kingdom,
  decide_memo: onMemo,
  escalate_memo: onMemo,
  decide_amendment: onMemo,
  deliver: onQuest,
  hold: onQuest,
  unhold: onQuest,
  submit: onQuest,
  patrol: onTerritory,
  report_escape: onQuest,
  resume_delegation: onTerritory,
  temple_report: kingdom,
  enqueue_branch: onTerritory,
};

function refsOf<K extends InboxCommandKind>(kind: K, payload: CommandPayload<K>): CommandRefs {
  const rule: RefsOf<K> = COMMAND_SCOPES[kind];
  return rule(payload);
}

export const commandRefsOf = (command: Pick<InboxCommand, 'kind' | 'payload'>): CommandRefs =>
  refsOf(command.kind, command.payload);

/** How the caller knows the world: a quest's territory and a memo's quest, undefined when it knows none. */
export interface ScopeLookup {
  readonly territoryOf: (quest: QuestId) => TerritoryId | undefined;
  readonly questOf: (memo: MemoId) => QuestId | undefined;
}

/** The territories a command touches, without repeats, or `kingdom`. */
export type CommandScope = 'kingdom' | readonly TerritoryId[];

/**
 * The scope of `command`. A quest or memo the lookup does not know makes it `kingdom`: what cannot be placed is
 * closed to a limited device (W6), and the Steward refuses an unknown quest to everyone anyway.
 */
export function commandScopeOf(
  command: Pick<InboxCommand, 'kind' | 'payload'>,
  lookup: ScopeLookup,
): CommandScope {
  const named = commandRefsOf(command);
  if (named.kingdom) return 'kingdom';
  const fromMemos = named.memos.map(lookup.questOf);
  const quests = [...named.quests, ...fromMemos];
  const territories = quests.map((quest) => (quest === undefined ? undefined : lookup.territoryOf(quest)));
  const placed = [...named.territories, ...territories];
  if (placed.length === 0 || placed.includes(undefined)) return 'kingdom';
  return [...new Set(placed.filter((territory) => territory !== undefined))];
}
