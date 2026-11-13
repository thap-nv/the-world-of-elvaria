// From the Chancellor's triage to inbox commands (implementation-plan §3.16.3, PS-03b; ADR 0005). The decisions of one
// reply are grouped by the work they share (one quest merged into, one draft made, else the memo alone), and each
// group is held against kingdom.delegation as a whole (delegationHolds), so a quest is never half taken in. Within it
// the Steward applies the work with no owner: an edit_quest that merges, a create_quest made open, a decide_memo that
// sets a memo aside; the quest's command closes its memos. Beyond it each memo goes to the owner with an escalate_memo,
// and a new quest waits as a draft the owner confirms. The quests' commands come first: the Steward applies the inbox
// in id order, and an escalate_memo names the draft made before it.
import { MEMO_BODY_MAX_LENGTH, MERGEABLE_STATUSES, delegationHolds, pathInScope } from '@elvaria/domain';
import type {
  Delegation,
  DelegationHold,
  InboxCommandInput,
  Memo,
  MemoId,
  Quest,
  QuestDraft,
  QuestId,
  TriageAction,
  TriageDecision,
  WorkPlace,
} from '@elvaria/domain';

import { draftPayloadOf } from './commands.ts';
import type { CommandSource } from './commands.ts';
import type { TriageReply } from './triage-memos.ts';

export interface TriageInput {
  readonly reply: Pick<TriageReply, 'decisions' | 'drafts'>;
  /** The batch the reply decided. */
  readonly memos: readonly Memo[];
  /** The kingdom's quests: those a merge names, and those whose letters held the memos. */
  readonly quests: readonly Quest[];
  readonly delegation: Delegation;
  /** Headers of source `chancellor`, and the id the Steward gives a create_quest's quest. */
  readonly source: CommandSource;
}

/** What became of one memo, for the CLI to say. */
export interface TriageOutcome {
  readonly memo: MemoId;
  readonly action: TriageAction;
  /** Applied without the owner. */
  readonly delegated: boolean;
  readonly holds: readonly DelegationHold[];
  /** The quest that takes its work: the one merged into, the one made, or the draft waiting for the owner. */
  readonly quest?: QuestId;
}

export interface TriageCommands {
  readonly commands: readonly InboxCommandInput[];
  readonly outcomes: readonly TriageOutcome[];
}

/** Decisions that share one piece of work. */
interface Unit {
  readonly action: TriageAction;
  readonly decisions: readonly TriageDecision[];
  /** merge: its quest, when it is one a merge may name (draft or open). */
  readonly target?: Quest | undefined;
  /** merge: the quest it names, when the kingdom has it, mergeable or not: the owner's advice says it. */
  readonly named?: QuestId | undefined;
  /** new_quest: its draft, when screenDrafts kept it. */
  readonly draft?: QuestDraft | undefined;
}

const keyOf = (decision: TriageDecision): string => {
  if (decision.action === 'merge') return `merge ${String(decision.quest)}`;
  if (decision.action === 'new_quest') return `new ${String(decision.draft_ref)}`;
  return `${decision.action} ${decision.memo}`;
};

const mergeable = (quest: Quest): boolean => (MERGEABLE_STATUSES as readonly string[]).includes(quest.status);

function unitsOf({ reply, quests }: TriageInput): Unit[] {
  const groups = new Map<string, TriageDecision[]>();
  for (const decision of reply.decisions)
    groups.set(keyOf(decision), [...(groups.get(keyOf(decision)) ?? []), decision]);
  return [...groups.values()].flatMap(([first, ...rest]): Unit[] => {
    if (first === undefined) return [];
    const decisions = [first, ...rest];
    if (first.action === 'merge') {
      const named = quests.find((quest) => quest.id === first.quest);
      const target = named !== undefined && mergeable(named) ? named : undefined;
      return [{ action: first.action, decisions, target, named: named?.id }];
    }
    const draft = reply.drafts.kept.find(({ ref }) => ref === first.draft_ref);
    return [{ action: first.action, decisions, ...(first.action === 'new_quest' ? { draft } : {}) }];
  });
}

/** The quest that would do the unit's work, as delegation reads it. */
function workOf(unit: Unit): WorkPlace | undefined {
  if (unit.target !== undefined) {
    const { rank, territory, scope_paths } = unit.target;
    return { rank, territory, scope_paths };
  }
  if (unit.draft === undefined) return undefined;
  const { rank, territory, scope_paths, question } = unit.draft;
  return { rank, territory, scope_paths, asks_owner: question !== undefined };
}

type Memos = ReadonlyMap<MemoId, Memo>;

const memosOf = (unit: Unit, memos: Memos): Memo[] =>
  unit.decisions.flatMap(({ memo }) => memos.get(memo) ?? []);

function holdsOf(unit: Unit, input: TriageInput, memos: Memos): DelegationHold[] {
  const territoryOf = (memo: Memo) => input.quests.find(({ id }) => id === memo.quest)?.territory;
  return delegationHolds(
    {
      action: unit.action,
      work: workOf(unit),
      memos: memosOf(unit, memos).map((memo) => ({ refs: memo.refs, territory: territoryOf(memo) })),
      asks: [...new Set(unit.decisions.flatMap(({ ask }) => ask))],
    },
    input.delegation,
  );
}

/** What a merge adds to its quest's description: the Chancellor's addenda, or the memos' own words without one. */
function addendumOf(unit: Unit, memos: Memos): string {
  const addenda = unit.decisions.flatMap(({ addendum }) => addendum ?? []);
  const words = addenda.length > 0 ? addenda : memosOf(unit, memos).map(({ body }) => body.trim());
  return words.join('\n\n');
}

/** A memo's text fits MEMO_BODY_MAX_LENGTH: the advice of merged duplicates may run longer; its quest's edit may not. */
const clipped = (text: string): string =>
  text.length <= MEMO_BODY_MAX_LENGTH ? text : `${text.slice(0, MEMO_BODY_MAX_LENGTH - 1)}…`;

/** The target's scope with the memos' files it lacks, when it has one (same_scope off lets a merge widen it). */
function widened(target: Quest, unit: Unit, memos: Memos): string[] | undefined {
  const scope = target.scope_paths;
  if (scope === undefined) return undefined;
  const outside = memosOf(unit, memos)
    .flatMap(({ refs }) => refs)
    .filter((ref, at, all) => all.indexOf(ref) === at && !pathInScope(ref, scope));
  return outside.length === 0 ? undefined : [...scope, ...outside];
}

interface Work {
  readonly command: InboxCommandInput;
  readonly quest: QuestId;
}

/** The unit's quest command: an edit that merges (only within the delegation), or a new quest, open or a draft. */
function workCommand(unit: Unit, delegated: boolean, input: TriageInput, memos: Memos): Work | undefined {
  const ids = unit.decisions.map(({ memo }) => memo);
  const { target, draft } = unit;
  if (target !== undefined && delegated) {
    const scope = widened(target, unit, memos);
    const description = `${target.description.trimEnd()}\n\n${addendumOf(unit, memos)}`;
    const changes = { description, ...(scope === undefined ? {} : { scope_paths: scope }) };
    const payload = { quest: target.id, expected_updated_at: target.updated_at, changes, memos: ids };
    return { command: { ...input.source.header(), kind: 'edit_quest', payload }, quest: target.id };
  }
  if (draft === undefined) return undefined;
  const header = input.source.header();
  const payload = { ...draftPayloadOf(draft, new Map()), draft: !delegated, memos: ids };
  return { command: { ...header, kind: 'create_quest', payload }, quest: input.source.questIdOf(header) };
}

/** The memos' own commands: set aside within the delegation, sent up with the advice beyond it. */
function memoCommands(
  unit: Unit,
  holds: readonly DelegationHold[],
  quest: QuestId | undefined,
  { source }: TriageInput,
  memos: Memos,
): InboxCommandInput[] {
  if (holds.length === 0 && unit.action !== 'shelve') return [];
  return unit.decisions.map(({ memo, note }) => {
    if (holds.length === 0) {
      return { ...source.header(), kind: 'decide_memo', payload: { memo, decision: 'shelved', note } };
    }
    const advice = {
      memo,
      action: unit.action,
      ...(quest === undefined ? {} : { quest }),
      ...(unit.action === 'merge' ? { addendum: clipped(addendumOf(unit, memos)) } : {}),
      holds: [...holds],
      note,
    };
    return { ...source.header(), kind: 'escalate_memo', payload: advice };
  });
}

export function triageCommands(input: TriageInput): TriageCommands {
  const memos: Memos = new Map(input.memos.map((memo) => [memo.id, memo]));
  const judged = unitsOf(input).map((unit) => ({ unit, holds: holdsOf(unit, input, memos) }));
  const commands: InboxCommandInput[] = [];
  const quests = new Map<Unit, QuestId>();
  // The quests first: the Steward applies the inbox in id order, and the memos' commands name them.
  for (const { unit, holds } of judged) {
    const work = workCommand(unit, holds.length === 0, input, memos);
    if (work === undefined) continue;
    commands.push(work.command);
    quests.set(unit, work.quest);
  }
  const outcomes: TriageOutcome[] = [];
  for (const { unit, holds } of judged) {
    const quest = quests.get(unit) ?? unit.named;
    commands.push(...memoCommands(unit, holds, quest, input, memos));
    const told = {
      action: unit.action,
      delegated: holds.length === 0,
      holds,
      ...(quest === undefined ? {} : { quest }),
    };
    outcomes.push(...unit.decisions.map(({ memo }) => ({ memo, ...told })));
  }
  return { commands, outcomes };
}
