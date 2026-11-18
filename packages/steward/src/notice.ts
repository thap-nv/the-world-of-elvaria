// What rings the bell (implementation-plan §3.1, §6): the notices the Steward gives the owner, as data the bell of the
// composition root says in the owner's language. Apart from types.ts, which re-exports them, since P1-54 added one.
import type {
  CharacterId,
  ClaimBlockerReason,
  DeliveryFailure,
  DeliveryStage,
  FailKind,
  InfirmaryDetail,
  InfirmaryReason,
  InfirmaryTrip,
  ManaWindow,
  PLOT_MERGE_STOPS,
  Rank,
  QuestId,
  TerritoryId,
  TribeHold,
  TribeId,
  WaitGauge,
} from '@elvaria/domain';

/** Why a merge into a merge quest's plot stopped at a branch it tried (the `stop` of `plot.merged`). */
export type MergeStopReason = (typeof PLOT_MERGE_STOPS)[number];

/** A quest as a notice names it: enough for the owner to recognise it without opening the file. */
export interface NoticeQuest {
  readonly id: QuestId;
  readonly title: string;
  readonly rank: Rank;
}

/**
 * What rings the bell (§3.1, §6). Data, not text: the bell of the composition root says it in the owner's
 * language (ConsoleBell in stage 1; desktop and web push in stage 2).
 */
export type Notice =
  | {
      readonly kind: 'unclaimable';
      readonly quest: NoticeQuest;
      readonly reason: ClaimBlockerReason;
      readonly class: string;
      readonly best?: { readonly character: string; readonly level: number; readonly ceiling: Rank };
    }
  /**
   * The quest waits in review for a judge the roster does not have (P1-15): no character of `classes` outside its
   * doers on another model than the assignee's `model` (dispatch.verifier_same_family = different_model). `vision`
   * (PS-11): its ritual asks for eyes, and none of them is of a tribe whose CLI reads images; absent on any other quest.
   */
  | {
      readonly kind: 'unjudgeable';
      readonly quest: NoticeQuest;
      readonly classes: readonly string[];
      readonly model: string | null;
      readonly vision?: true;
    }
  /**
   * The quest has judges, but the mana of every one is closed (PS-03, (d) of P1-50): it waits for a gauge to reopen,
   * or for a judge of `classes` on another pool. `gauges`: the pools that hold them, with their reset when known.
   */
  | {
      readonly kind: 'judge_mana';
      readonly quest: NoticeQuest;
      readonly classes: readonly string[];
      readonly gauges: readonly WaitGauge[];
    }
  /** The day's digest is written (PS-03): `file` relative to the kingdom, and how many items in each group. */
  | {
      readonly kind: 'digest';
      readonly day: string;
      readonly file: string;
      readonly must: number;
      readonly can_wait: number;
    }
  | { readonly kind: 'awaiting_seal'; readonly quest: NoticeQuest }
  /**
   * The quest went to the infirmary: why in parts (P1-32), for a bell that speaks the owner's language, and the
   * structured `reason` the `quest.infirmary` line carries.
   */
  | {
      readonly kind: 'infirmary';
      readonly quest: NoticeQuest;
      readonly reason: InfirmaryReason;
      readonly trip: InfirmaryTrip;
      readonly detail?: InfirmaryDetail;
    }
  | { readonly kind: 'question'; readonly quest: NoticeQuest; readonly question: string }
  /**
   * The checks of the quest's run failed because of their environment (P1-54): Docker down, a container gone. No
   * judge reads them and nobody's level moves; they run again `recheck_minutes` later. Rung once per run.
   */
  | {
      readonly kind: 'environment';
      readonly quest: NoticeQuest;
      /** The check that failed so, and the line of its log that says it (`log_path`, relative to the kingdom). */
      readonly check: string;
      readonly line: string;
      readonly log_path?: string;
      readonly recheck_minutes: number;
    }
  /** A plan was delivered but opened none of its sub-quests (P1-14); `reason` is English, for the owner and logs. */
  | { readonly kind: 'subquests_refused'; readonly quest: NoticeQuest; readonly reason: string }
  /**
   * The Steward's merge into a party's merge quest stopped at `branch`, a part's or the territory's base branch
   * (PS-08e): on a conflict in `conflicts`, left in progress for the knight of the quest's next run; refused by git or
   * a hook, or the branch is gone (`conflicts` empty), which the owner looks at. Rung once per merge that stopped.
   */
  | {
      readonly kind: 'merge_stopped';
      readonly quest: NoticeQuest;
      readonly branch: string;
      readonly reason: MergeStopReason;
      readonly conflicts: readonly string[];
    }
  /**
   * The tribe's CLI at `path` says `version`, not `checked`, the version its last `tribe check` with the real CLI passed
   * on, or (`version` undefined) it is gone (A1b of the lessons of 2026-11-13): no new session of the tribe until such
   * a check passes. Rung once per version.
   */
  | (TribeHold & { readonly kind: 'tribe_held' })
  /**
   * PS-08c: the Steward pushed the quest's branch and its pull request is open at `url`; `warnings` name the files
   * whose added lines match a shared pattern of redact, for the owner to look at. Rung once per head.
   */
  | {
      readonly kind: 'delivery_pushed';
      readonly quest: NoticeQuest;
      readonly url: string;
      readonly warnings: readonly string[];
    }
  /**
   * PS-08c: the delivery to the forge stopped at `stage`; the owner sends `deliver` once it is fixed. Rung once. (PS-09b)
   * With `merge_quest`: the merge queue opened that quest, or found it open, and a knight resolves the stop there.
   */
  | {
      readonly kind: 'delivery_failed';
      readonly quest: NoticeQuest;
      readonly stage: DeliveryStage;
      readonly reason: DeliveryFailure;
      readonly merge_quest?: QuestId;
    }
  /**
   * PS-26: the patrol found checks of the territory's default branch turned red (`setup` for commands.setup), with
   * the draft quest it opened for them when the territory declares `patrol.follow_up`. Rung once per turn.
   */
  | {
      readonly kind: 'base_red';
      readonly territory: TerritoryId;
      readonly checks: readonly { readonly check: string; readonly error_line?: string }[];
      readonly draft?: QuestId;
    }
  /** The character failed the same way breakers.same_fail_suspend times in a row: it went to the Temple. */
  | {
      readonly kind: 'suspended';
      readonly character: CharacterId;
      readonly fail_kind: FailKind | null;
      readonly count: number;
    }
  /**
   * A gauge of a tribe's account (P1-22): it reached the warning share (once), ran dry and sleeps, or woke. `model`
   * names the one model whose own cap it is (Argon, Fable); absent for the whole pool.
   */
  | (ManaGaugeNotice & { readonly kind: 'mana_asleep'; readonly resets_at?: string })
  | (ManaGaugeNotice & { readonly kind: 'mana_awake' })
  | (ManaGaugeNotice & {
      readonly kind: 'mana_warning';
      readonly window: ManaWindow;
      readonly used_pct: number;
      readonly resets_at?: string;
    });

/** The gauge a mana notice is about. */
export interface ManaGaugeNotice {
  readonly tribe: TribeId;
  readonly pool: string;
  readonly model?: string;
}

export interface Bell {
  ring(notice: Notice): Promise<void>;
}
