// The kinds of item of the owner's attention queue (attentionQueue, attention.ts): each kind's group, advice code and
// command, and what an item names. Out of attention.ts, which builds the queue, to keep both under the size limit
// (PS-11, the coordinator's plan for PS-08c: split it before adding a kind).
import type { CharacterId, MemoId, QuestId, TerritoryId, TribeId } from '../core/ids.ts';
import type { DelegationHold, SealRaise, TriageAction } from '../delegation/constants.ts';
import type { WaitGauge } from '../dispatch/judge-waits.ts';
import type { FailKind, Rank } from '../schema/common.ts';
import type { SuspensionCause } from '../schema/event/delegation-data.ts';
import type { DeliveryFailure, DeliveryStage } from '../schema/event/delivery-data.ts';
import type { ScanOutcome } from '../schema/event/patrol-data.ts';
import type { CheckAttribution } from '../patrol/health.ts';
import type { TempleBlock } from '../temple/waiting.ts';

export const ATTENTION_GROUPS = ['must', 'can_wait'] as const;
/** `must`: the work stands still until the owner decides; `can_wait`: nothing waits on it. */
export type AttentionGroup = (typeof ATTENTION_GROUPS)[number];

/**
 * Each kind of item, in the order the queue lists them within a group: its group, its advice (a code the renderer
 * words in the owner's language) and its command, the words after `elvaria`. `{field}` is the item's own field; `<…>`
 * is for the owner to fill in.
 */
export const ATTENTION_TABLE = {
  question: { group: 'must', advice: 'answer', command: ['answer', '{quest}', '<answer>'] },
  awaiting_seal: { group: 'must', advice: 'seal_or_return', command: ['seal', '{quest}'] },
  infirmary: { group: 'must', advice: 'retry_or_archive', command: ['quest', 'retry', '{quest}'] },
  // PS-08c: the Steward's delivery to the forge stopped; it does not try again on its own (ADR 0023). The item's line
  // words what to do by its `reason`.
  delivery_failed: { group: 'must', advice: 'deliver_again', command: ['quest', 'deliver', '{quest}'] },
  // PS-26: the patrol found a check of the territory's default branch red, until a patrol finds it green again. The
  // command runs the same trial by hand (PS-25), to see it red or green before the next patrol. (PS-09d) While it is
  // red the territory takes no work: the item names the quests that wait (`waiting`).
  base_red: { group: 'must', advice: 'fix_base', command: ['territory', 'check', '{territory}'] },
  judge_mana: {
    group: 'must',
    advice: 'judge_other_pool_or_wait',
    command: ['character', 'add', '<id>', '--class', '{class}', '--tribe', '<tribe>'],
  },
  unjudgeable: {
    group: 'must',
    advice: 'summon_judge',
    command: ['character', 'add', '<id>', '--class', '{class}', '--model', '<model>'],
  },
  // PS-11: the quest's ritual asks for eyes, and no judge of a tribe whose CLI reads images may take it.
  unjudgeable_vision: {
    group: 'must',
    advice: 'summon_judge_with_vision',
    command: ['character', 'add', '<id>', '--class', '{class}', '--tribe', '<tribe>'],
  },
  // fix/review-no-session: the latest judge of a review could not open its session; the next one counts toward the
  // stall too, and a judge whose CLI cannot take the quest fails on every review it is given.
  judge_no_session: {
    group: 'must',
    advice: 'suspend_judge_or_wait',
    command: ['character', 'suspend', '{judge}'],
  },
  unclaimable: { group: 'must', advice: 'see_why', command: ['quest', 'show', '{quest}'] },
  scope_held: { group: 'must', advice: 'merge_and_archive', command: ['quest', 'archive', '{quest}'] },
  draft: { group: 'must', advice: 'confirm_or_cancel', command: ['quest', 'confirm', '{quest}'] },
  // A1b of the lessons of 2026-11-13: the tribe's CLI changed version since its last passing check with the real CLI,
  // or the CLI its Steward starts is gone (a VS Code update moved it, 2026-11-14); either way no new session.
  tribe_held: { group: 'must', advice: 'check_tribe', command: ['tribe', 'check', '{tribe}'] },
  tribe_gone: { group: 'must', advice: 'check_tribe_and_restart', command: ['tribe', 'check', '{tribe}'] },
  objection: { group: 'can_wait', advice: 'settle_objection', command: ['memo', 'show', '{memo}'] },
  // PS-03b: a memo the Chancellor's triage sent up, with its advice, before the memos it has not read yet.
  memo_escalated: { group: 'can_wait', advice: 'weigh_triage', command: ['memo', 'show', '{memo}'] },
  memo: { group: 'can_wait', advice: 'decide_memo', command: ['memo', 'show', '{memo}'] },
  // PS-08c: the quest's pull request is open on the forge, for the owner to merge (mode `pr`); then archive the quest.
  delivery_waits: {
    group: 'can_wait',
    advice: 'merge_pr_and_archive',
    command: ['quest', 'archive', '{quest}'],
  },
  // PS-08b: the Steward merged the quest without the royal seal, by the kingdom's delegation; the owner reads it after
  // the fact, and undoes it with the item's `revert` line, which it runs and pushes itself.
  merged_unsealed: { group: 'can_wait', advice: 'read_or_revert', command: ['quest', 'show', '{quest}'] },
  narrow_escapes: { group: 'can_wait', advice: 'consider_full', command: ['metrics'] },
  // PS-08g: the breaker suspended the territory's delegation of the seal after an escaped defect. The work goes on,
  // only every new quest there waits for the seal again, until the owner reads what escaped and resumes it.
  delegation_suspended: {
    group: 'can_wait',
    advice: 'read_then_resume',
    command: ['territory', 'delegation', '{territory}', '--resume'],
  },
  // PS-12g: a character the Steward suspended for a fail streak that no line of the Temple freed (templeReleasesOf); the
  // line names the Monk's open letters on the runs it failed, to read before the owner releases it.
  character_suspended: {
    group: 'can_wait',
    advice: 'read_letters_then_release',
    command: ['character', 'release', '{character}'],
  },
  // PS-12g: repeated failures wait while the Temple cannot run (templeWaitingOf), one item at most. No Monk that is not
  // suspended: add one, of the registry's first class of the Monk (the line says when the Temple is off too). Off with a
  // Monk: no command turns it on, so the advice gives the lines of kingdom.json, and says that a run spends mana.
  temple_no_monk: {
    group: 'can_wait',
    advice: 'add_monk',
    command: ['character', 'add', '<id>', '--class', '{class}', '--model', '<model>'],
  },
  temple_off: { group: 'can_wait', advice: 'enable_temple', command: [] },
  // PS-09b: the quest's delivery stopped at the merge queue's update and a merge quest resolves it for the owner; the
  // quest goes into the base branch with it. A `delivery_failed` item again once that merge quest is dropped.
  delivery_merging: {
    group: 'can_wait',
    advice: 'follow_merge_quest',
    command: ['quest', 'show', '{merge_quest}'],
  },
  // (D) of fix/quest-hold: a quest the owner holds (`quest hold`) waits for nobody but the owner, who lifts the hold
  // when it is time; the line says why, as the owner wrote it.
  quest_held: { group: 'can_wait', advice: 'unhold_when_ready', command: ['quest', 'unhold', '{quest}'] },
  // An open quest waits for a quest whose scope meets its own (R3); it starts by itself once that quest is archived.
  scope_wait: { group: 'can_wait', advice: 'wait_for_scope', command: ['quest', 'show', '{quest}'] },
  // PS-26: a scan of the latest patrol (link-check) did not pass; it never turns the branch red.
  patrol_scan: { group: 'can_wait', advice: 'read_scan', command: ['territory', 'patrol', '{territory}'] },
  mana_asleep: { group: 'can_wait', advice: 'wait_or_wake', command: ['wake', '{tribe}'] },
  mana_warning: { group: 'can_wait', advice: 'watch_mana', command: ['doctor'] },
  // PS-08d: the repo the pinned build came from has newer commits on its default branch that touch the code.
  upgrade_available: { group: 'can_wait', advice: 'upgrade', command: ['upgrade'] },
} as const satisfies Record<
  string,
  { readonly group: AttentionGroup; readonly advice: string; readonly command: readonly string[] }
>;

export type AttentionKind = keyof typeof ATTENTION_TABLE;
export type AttentionAdvice = (typeof ATTENTION_TABLE)[AttentionKind]['advice'];
export const ATTENTION_KINDS = Object.keys(ATTENTION_TABLE) as readonly AttentionKind[];

/** What an item is about: the fields its line and its command name. */
export interface AttentionSubject {
  readonly merges?: number;
  readonly escapes?: number;
  readonly quest?: QuestId;
  readonly title?: string;
  readonly rank?: Rank;
  /** The question of a quest that waits for the owner's answer. */
  readonly question?: string;
  /** A judging class of the quest's kind, for the command that summons a judge. */
  readonly class?: string;
  /** The judge whose session could not open (judge_no_session). */
  readonly judge?: CharacterId;
  /** Why the owner holds the quest (quest_held), as the owner wrote it; absent when the owner gave no reason. */
  readonly held_reason?: string;
  /**
   * The quests that wait for a done quest's scope (scope_held, PS-05); (PS-09d) the open quests that wait for a red
   * default branch (base_red): present, maybe empty, when the territory takes no work.
   */
  readonly waiting?: readonly QuestId[];
  /** The quest an open quest waits for, and the glob of the open quest's scope that meets the holder's (scope_wait). */
  readonly holder?: QuestId;
  readonly overlap?: string;
  /** The pools that hold every judge of a quest (judge_mana). */
  readonly gauges?: readonly WaitGauge[];
  readonly memo?: MemoId;
  readonly memo_kind?: string;
  readonly from?: CharacterId;
  /** A memo sent up (PS-03b): what the Chancellor would do, the quest it names, what holds it for the owner. */
  readonly triage?: TriageAction;
  readonly target?: QuestId;
  readonly holds?: readonly DelegationHold[];
  readonly tribe?: TribeId;
  /** A held tribe (tribe_held, tribe_gone): its CLI, what it says now, and the version its last passing check ran on. */
  readonly path?: string;
  readonly version?: string;
  readonly checked_version?: string;
  readonly pool?: string;
  readonly used_pct?: number;
  readonly resets_at?: string;
  /** A delivery to the forge (PS-08c): where it stopped and why, and the pull request's address when there is one. */
  readonly stage?: DeliveryStage;
  readonly reason?: DeliveryFailure;
  readonly url?: string;
  /** (PS-08b) Why the machine raised the seal of a quest the delegation had spared (awaiting_seal). */
  readonly raised?: readonly SealRaise[];
  /** (PS-08b) The git words that undo a merge without the seal (merged_unsealed), with `commit` its merge commit. */
  readonly revert?: readonly string[];
  /**
   * (PS-08g) Why the breaker suspended a territory's delegation (delegation_suspended), with `quest` the quest it
   * blames, `since` when, `check` the check that turned red (base_red) and `note` the owner's words (escape_reported).
   */
  readonly cause?: SuspensionCause;
  readonly note?: string;
  /** The merge queue's merge quest the quest waits for (delivery_merging, PS-09b). */
  readonly merge_quest?: QuestId;
  /** A newer build (upgrade_available, PS-08d): the commit pinned, the default branch's, and its commits since. */
  readonly pinned?: string;
  readonly latest?: string;
  readonly commits?: number;
  /**
   * A red check of a territory's default branch (base_red, PS-26): its id (`setup` for commands.setup), its first error
   * line and log as the latest patrol found them, the commit and time it was first found red, and the quests merged
   * since the last patrol that found it green.
   */
  readonly territory?: TerritoryId;
  readonly check?: string;
  readonly error_line?: string;
  readonly log_path?: string;
  readonly commit?: string;
  readonly since?: string;
  readonly suspects?: readonly QuestId[];
  /** (CM-04) What the probe after it turned red found: why, at which commit, whose merge. Absent until one did. */
  readonly attribution?: CheckAttribution;
  /** A scan of the latest patrol that did not pass (patrol_scan): the script, how it ended, what it counted. */
  readonly script?: string;
  readonly outcome?: ScanOutcome;
  /** (PS-12g) Also the fails in a row of a character suspended for them, and the repeated failures that wait (temple_*). */
  readonly count?: number;
  /** (PS-12g) A character suspended for a fail streak (character_suspended): who, the kind, the Monk's open letters. */
  readonly character?: CharacterId;
  readonly fail_kind?: FailKind;
  readonly letters?: readonly MemoId[];
  /** (PS-12g) Why the Temple cannot run (temple_no_monk, temple_off). */
  readonly temple_reasons?: readonly TempleBlock[];
}

export interface AttentionItem extends AttentionSubject {
  readonly kind: AttentionKind;
  readonly group: AttentionGroup;
  readonly advice: AttentionAdvice;
  readonly command: readonly string[];
}
