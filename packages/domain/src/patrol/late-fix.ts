// The fix quest of a red check the probe traced to a quest already in its base branch (ADR 0033, plans/check-modes.md
// "Lần trượt muộn", owner's C2 and C7; CM-06). The quest stays archived, no row leaves `archived`: the Steward opens
// a child of it instead, of kind `fix`, made by the patrol (`created_by: 'patrol'`, so isPatrolFix exempts it from
// the red-base hold of PS-09d), on the quest's territory, rank, tags, scope and secrets, judged like any quest (the
// old judge is not barred: it never worked on this one). Its own change (`own_change`) gives it to the doer, who also
// takes the late verdict; a red that only the merge of both sides makes (`combination`) gives it to nobody and blames
// nobody. Opening it spends mana the owner did not approve one by one (C7): within kingdom.delegation.max_rank it
// opens at once, above it is a draft that waits for the owner's `confirm`. The Steward derives its id from the quest
// and the first red commit, so a tick or a probe run again finds it instead of opening a second one.
import { namedAssignee } from '../dispatch/select-assignee.ts';
import { RANKS } from '../schema/common.ts';
import { clipTitle } from '../script/follow-up.ts';
import type { CharacterId, ClassId, KindId, QuestId } from '../core/ids.ts';
import type { QueueRedCheck } from '../party/queue-merge-quest.ts';
import type { Character } from '../schema/character/character.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Rank } from '../schema/common.ts';
import type { CheckAttributedData } from '../schema/event/check-data.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';
import type { Tribe } from '../schema/tribe.ts';

/** The kind of the fix quest: the registry's `fix` (Trừ tà). */
export const LATE_FIX_KIND = 'fix' as KindId;

/** The two conclusions of a probe that open a fix quest; `flaky`, `outside` and `unknown` keep CM-04's way. */
export type LateFixCause = 'own_change' | 'combination';

/** What a patrol's `check.attributed` asks of the Steward: a fix quest under `origin` for the red at `commit`. */
export interface LateFixDue {
  readonly origin: QuestId;
  readonly commit: string;
  readonly cause: LateFixCause;
}

/** The fix quest a patrol's attribution opens; none for the queue's (its quest is still done), nor without a quest. */
export function lateFixDueOf(data: CheckAttributedData): LateFixDue | undefined {
  const { source, cause, culprit, commit } = data;
  if (source !== 'patrol' || (cause !== 'own_change' && cause !== 'combination')) return undefined;
  return culprit === undefined || commit === undefined ? undefined : { origin: culprit, commit, cause };
}

export interface LateFixInput {
  /** The quest the probe blamed, archived (or done with its merge already in the base branch). */
  readonly origin: Quest;
  readonly cause: LateFixCause;
  /** The red checks, each with the end of its log, masked by the Steward. */
  readonly checks: readonly QueueRedCheck[];
  /** The territory's base branch and its first red commit (`check.attributed` `commit`). */
  readonly base: { readonly branch: string; readonly commit: string };
  /** kingdom.delegation.max_rank: the highest rank the fix opens at without the owner (C7). */
  readonly max_rank: Rank;
  readonly kinds: Registry['kinds'];
  /** `kingdom.owner.locale`: the title names the kind in the owner's language, as a follow-up's does. */
  readonly locale: Kingdom['owner']['locale'];
}

const SHORT_SHA = 7;

const causeLine = ({ origin, cause, base }: LateFixInput): string => {
  const at = `${base.branch} (${base.commit.slice(0, SHORT_SHA)})`;
  const found = `The patrol found checks of the territory red on ${at}, and the probe traced them to the merge of quest ${origin.id} («${origin.title}»).`;
  return cause === 'own_change'
    ? `${found} They fail on that quest's own branch too, as it stood when its judge passed it: its work broke them, and a late machine verdict overturned that pass.`
    : `${found} They pass on that quest's own branch and passed on ${base.branch} before it: neither side breaks them alone, their merge does.`;
};

const checkLines = (checks: readonly QueueRedCheck[]): string =>
  [
    'The red checks:',
    ...checks.map(({ name, tail }) =>
      tail === undefined || tail === ''
        ? `- ${name}`
        : `- ${name}, the end of its log:\n\`\`\`\n${tail}\n\`\`\``,
    ),
  ].join('\n');

/** What a fresh session of the fix reads: English, like every brief the Steward writes itself. */
const descriptionOf = (input: LateFixInput): string =>
  [
    causeLine(input),
    checkLines(input.checks),
    `This branch starts from ${input.base.branch} as it is now. Make these checks pass again; change only what the fix needs, and keep what quest ${input.origin.id} set out to do.`,
  ].join('\n\n');

/** The origin's class when the fix kind takes it, else the kind's first: a fix of a scribe's work may need a knight. */
function classOf(input: LateFixInput): ClassId | undefined {
  const allowed = input.kinds.find(({ id }) => id === LATE_FIX_KIND)?.classes_allowed ?? [];
  const own = input.origin.class_required;
  return own !== undefined && (allowed.length === 0 || allowed.includes(own)) ? own : allowed[0];
}

/** Whether the fix waits for the owner's `confirm`: its rank above kingdom.delegation.max_rank (C7). */
export const lateFixDraft = (rank: Rank, maxRank: Rank): boolean =>
  RANKS.indexOf(rank) > RANKS.indexOf(maxRank);

/** The `create_quest` payload of the fix quest, for questFromCommand. */
export function lateFixOf(input: LateFixInput): CommandPayload<'create_quest'> {
  const { origin, kinds, locale } = input;
  const kind = kinds.find(({ id }) => id === LATE_FIX_KIND);
  const name = kind === undefined ? LATE_FIX_KIND : locale === 'vi' ? kind.name_vi : kind.name_en;
  const classRequired = classOf(input);
  const scope = origin.scope_paths ?? [];
  return {
    draft: lateFixDraft(origin.rank, input.max_rank),
    title: clipTitle(`${name}: ${origin.title}`),
    description: descriptionOf(input),
    kind: LATE_FIX_KIND,
    rank: origin.rank,
    territory: origin.territory,
    tier: 'session',
    ...(classRequired === undefined ? {} : { class_required: classRequired }),
    tags: [...origin.tags],
    ...(origin.secrets_required.length === 0 ? {} : { secrets_required: [...origin.secrets_required] }),
    ...(scope.length === 0 ? {} : { scope_paths: [...scope] }),
    parent_id: origin.id,
    ...(typeof origin.campaign_id === 'string' ? { campaign_id: origin.campaign_id } : {}),
    created_by: 'patrol',
  };
}

export interface LateFixHolder {
  readonly cause: LateFixCause;
  /** The fix quest as made: open or a draft, and the class it needs. */
  readonly fix: Pick<Quest, 'status' | 'class_required'>;
  /** The origin's doer, as its file stands now; undefined when it is gone. */
  readonly doer: Pick<Character, 'id' | 'class' | 'status' | 'tribe'> | undefined;
  readonly tribes: readonly Pick<Tribe, 'id' | 'enabled'>[];
  /** Whether the doer's mana pool is closed now. */
  readonly asleep: boolean;
}

/**
 * Who the Steward claims an open fix for: the doer of the origin, for its own change, when it may take it now (of the
 * class, not suspended, of an enabled tribe, not asleep for mana); otherwise nobody, and any character may claim it.
 */
export function lateFixHolderOf(holder: LateFixHolder): CharacterId | undefined {
  const { cause, fix, doer, tribes, asleep } = holder;
  if (cause !== 'own_change' || fix.status !== 'open' || asleep) return undefined;
  const named = namedAssignee(fix.class_required, doer, tribes);
  return named.ok && named.value.status !== 'sleeping_mana' ? named.value.id : undefined;
}
