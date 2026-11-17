// The kinds of item of the owner's attention queue (attentionQueue, attention.ts): each kind's group, advice code and
// command, and what an item names. Out of attention.ts, which builds the queue, to keep both under the size limit
// (PS-11, the coordinator's plan for PS-08c: split it before adding a kind).
import type { CharacterId, MemoId, QuestId, TerritoryId, TribeId } from '../core/ids.ts';
import type { DelegationHold, TriageAction } from '../delegation/constants.ts';
import type { WaitGauge } from '../dispatch/judge-waits.ts';
import type { Rank } from '../schema/common.ts';
import type { DeliveryFailure, DeliveryStage } from '../schema/event/delivery-data.ts';
import type { ScanOutcome } from '../schema/event/patrol-data.ts';

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
  // command runs the same trial by hand (PS-25), to see it red or green before the next patrol.
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
  readonly quest?: QuestId;
  readonly title?: string;
  readonly rank?: Rank;
  /** The question of a quest that waits for the owner's answer. */
  readonly question?: string;
  /** A judging class of the quest's kind, for the command that summons a judge. */
  readonly class?: string;
  /** The judge whose session could not open (judge_no_session). */
  readonly judge?: CharacterId;
  /** The quests that wait for a done quest's scope (scope_held, PS-05). */
  readonly waiting?: readonly QuestId[];
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
  /** A scan of the latest patrol that did not pass (patrol_scan): the script, how it ended, what it counted. */
  readonly script?: string;
  readonly outcome?: ScanOutcome;
  readonly count?: number;
}

export interface AttentionItem extends AttentionSubject {
  readonly kind: AttentionKind;
  readonly group: AttentionGroup;
  readonly advice: AttentionAdvice;
  readonly command: readonly string[];
}
