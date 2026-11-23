// What the lesson ledger counts (PS-12b, temple-first plan DB6, ADR 0027, lesson-sharing S7): one record per **run** of
// a quest's assignee and one per judge session, each with the lessons its prompt carried (the load trace of the line
// that opened it) and how it was judged. `lessonCountsOf`, `failKindRatesOf`, `lessonEffectOf` and `repeatedFailuresOf`
// all read this one gathering, so they agree on what a run is and whether it passed.
//
// Three rules of the plan live here. A run counts once however many sessions the assignee spent in it: the first
// opening line of the run speaks for it. A fail the owner returned with `rejudge`, or that a second judge overturned
// through an objection, is no fail: the run is judged by the verdicts left, and by none when none is. And a run no
// verdict decided (a breaker, a crash, a partial verdict) has loads and nothing else.
import { sessionModelsOf, trailsOf } from './ledger.ts';
import { isCounted } from './rework.ts';
import { isOpening } from './session-counts.ts';
import { inWindow } from './window.ts';
import type { Opening } from './session-counts.ts';
import type { MetricsInput } from './ledger.ts';
import type { QuestTrail } from './rework.ts';
import type { MetricsWindow } from './window.ts';
import type { CharacterId, LessonRef, QuestId, TagId, TerritoryId, VerdictId } from '../core/ids.ts';
import type { FailKind, Role } from '../schema/common.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

/** One run of the assignee, with what its first session loaded and how the verdicts left judged it. */
export interface EvidenceRun {
  readonly quest: QuestId;
  readonly n: number;
  /** The first counted session's start: the order of runs, and the day the window reads. */
  readonly started_at: string;
  readonly territory: TerritoryId;
  readonly tags: readonly TagId[];
  readonly character: CharacterId;
  /** Null when the ledger was read without the character's file. */
  readonly class: string | null;
  readonly tribe: string | null;
  /** The model of the run's first session. */
  readonly model: string | null;
  /** `undefined` while no verdict decided the run. */
  readonly result: 'pass' | 'fail' | undefined;
  /** Of the fail that counts, `other` for a fail written without one; null unless the run failed. */
  readonly fail_kind: FailKind | null;
  /** The fail verdict that counts; null unless the run failed. */
  readonly verdict: VerdictId | null;
  /** The lessons the first session's prompt carried, in order; none for a resumed or an old line. */
  readonly lessons: readonly LessonRef[];
  /** When that session's opening line was written; null when the log has none for the run. */
  readonly loaded_at: string | null;
}

/** One judge session, with what its prompt carried and whether the verdict it gave stood. */
export interface EvidenceJudgement {
  readonly quest: QuestId;
  readonly n: number;
  readonly session: string | undefined;
  readonly at: string;
  readonly lessons: readonly LessonRef[];
  /** Undefined when the session left no pass or fail (a partial verdict, a crash) or none the ledger can join to it. */
  readonly stood: boolean | undefined;
}

export interface LessonEvidence {
  /** The runs that started in the window, oldest first. */
  readonly runs: readonly EvidenceRun[];
  readonly judgements: readonly EvidenceJudgement[];
}

interface Load {
  readonly quest: QuestId;
  readonly n: number;
  readonly role: Role;
  readonly session: string | undefined;
  readonly ts: string;
  readonly lessons: readonly LessonRef[];
}

interface Entry {
  readonly n: number;
  readonly role: Role;
}

/** The run and the role of an opening line: its session's entry in the attempt logs, else the quest's own view. */
function placeOf(event: Opening, entries: ReadonlyMap<string, Entry>): Entry {
  const entry = event.session === undefined ? undefined : entries.get(event.session);
  const view = event.data.quest;
  return {
    n: entry?.n ?? view.attempts,
    role: entry?.role ?? (view.status === 'review' ? 'verifier' : 'assignee'),
  };
}

/**
 * The first opening line of each assignee run and of each judge session: later sessions of a run (an answer, mana
 * back) carry a prompt of their own, but the lượt is the unit (the plan's row 4), so they are not counted again.
 */
function loadsOf(input: MetricsInput): Load[] {
  const entries = new Map<string, Entry>();
  for (const quest of input.quests)
    for (const { session_id, n, role } of quest.attempt_log)
      if (session_id !== undefined) entries.set(session_id, { n, role });
  const seen = new Set<string>();
  const loads: Load[] = [];
  for (const event of input.events) {
    if (!isOpening(event)) continue;
    const { n, role } = placeOf(event, entries);
    const quest = event.data.quest.id;
    const key = role === 'assignee' ? `${quest}|${n}` : `${quest}|${n}|${event.session ?? 'verifier'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    loads.push({
      quest,
      n,
      role,
      session: event.session,
      ts: event.ts,
      // The trace schema checks every ref against LESSON_REF_PATTERN, which is all a LessonRef says.
      lessons: (event.data.load_trace?.lessons ?? []).map((ref) => ref as LessonRef),
    });
  }
  return loads;
}

/** What the owner and the second judges did to other verdicts, across the whole kingdom (a verdict id names its quest). */
interface Rulings {
  /** Fails that are no fail: returned with `rejudge`, or overturned through an objection. */
  readonly void: ReadonlySet<VerdictId>;
  /** The fails an objection overturned. */
  readonly overturned: ReadonlySet<VerdictId>;
  /**
   * `<quest>|<attempt>` of every run the owner returned, or a late machine verdict failed after its pass (ADR 0033):
   * the judge's pass of it did not stand.
   */
  readonly returned: ReadonlySet<string>;
}

function rulingsOf(verdicts: readonly Verdict[]): Rulings {
  const overturned = new Set<VerdictId>();
  const rejudged = new Set<VerdictId>();
  const returned = new Set<string>();
  for (const verdict of verdicts) {
    if (verdict.result === 'pass' && verdict.objection !== undefined)
      overturned.add(verdict.objection.verdict);
    if (verdict.result !== 'fail' || !(verdict.by_human || verdict.late === true)) continue;
    returned.add(`${verdict.quest_id}|${verdict.attempt}`);
    if (verdict.rejudge === true) rejudged.add(verdict.id);
  }
  return { void: new Set([...overturned, ...rejudged]), overturned, returned };
}

/** The fail that counts on run `n` (the latest), else a pass, else nothing; a partial verdict decides nothing. */
function judgementOf(
  verdicts: readonly Verdict[],
  n: number,
  rulings: Rulings,
): { result: EvidenceRun['result']; fail: Verdict | undefined } {
  const decisive = verdicts.filter(
    ({ attempt, id, result }) => attempt === n && result !== 'partial' && !rulings.void.has(id),
  );
  const fail = decisive
    .filter(({ result }) => result === 'fail')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .at(-1);
  if (fail !== undefined) return { result: 'fail', fail };
  return { result: decisive.some(({ result }) => result === 'pass') ? 'pass' : undefined, fail: undefined };
}

interface Gathered {
  readonly loads: ReadonlyMap<string, Load>;
  readonly models: ReadonlyMap<string, string>;
  readonly characters: ReadonlyMap<string, { readonly class?: string; readonly tribe: string }>;
  readonly rulings: Rulings;
}

function runsOf({ quest, verdicts }: QuestTrail, gathered: Gathered): EvidenceRun[] {
  const seen = new Set<number>();
  return quest.attempt_log.flatMap((entry) => {
    if (!isCounted(entry) || entry.role !== 'assignee' || seen.has(entry.n)) return [];
    seen.add(entry.n);
    const load = gathered.loads.get(`${quest.id}|${entry.n}`);
    const { result, fail } = judgementOf(verdicts, entry.n, gathered.rulings);
    const character = gathered.characters.get(entry.character);
    return [
      {
        quest: quest.id,
        n: entry.n,
        started_at: entry.started_at,
        territory: quest.territory,
        tags: quest.tags,
        character: entry.character,
        class: character?.class ?? null,
        tribe: character?.tribe ?? null,
        model: entry.session_id === undefined ? null : (gathered.models.get(entry.session_id) ?? null),
        result,
        // The schema wants a kind on every fail; a file without one reads as `other`, as rework reads it.
        fail_kind: fail === undefined ? null : (fail.fail_kind ?? 'other'),
        verdict: fail?.id ?? null,
        lessons: load?.lessons ?? [],
        loaded_at: load?.ts ?? null,
      },
    ];
  });
}

/** Whether a judge's verdict stood: a pass the owner did not return, a fail no second judge overturned. */
function stoodOf(verdict: Verdict, rulings: Rulings): boolean {
  return verdict.result === 'pass'
    ? !rulings.returned.has(`${verdict.quest_id}|${verdict.attempt}`)
    : !rulings.overturned.has(verdict.id);
}

/** The lesson evidence of the runs that started in the window, and of the judge sessions opened in it. */
export function lessonEvidenceOf(
  input: MetricsInput,
  window: MetricsWindow = {},
  trails: readonly QuestTrail[] = trailsOf(input),
): LessonEvidence {
  const rulings = rulingsOf(input.verdicts);
  const loads = loadsOf(input);
  const gathered: Gathered = {
    loads: new Map(
      loads.filter(({ role }) => role === 'assignee').map((load) => [`${load.quest}|${load.n}`, load]),
    ),
    models: sessionModelsOf(input.events),
    characters: new Map((input.characters ?? []).map((character) => [character.id, character])),
    rulings,
  };
  // A judge's own verdicts only: the machine's has no session, and the owner's is the one that flips the others.
  const bySession = new Map(
    input.verdicts.flatMap((verdict) =>
      verdict.by_human || verdict.result === 'partial' || verdict.session_id === undefined
        ? []
        : [[verdict.session_id, verdict] as const],
    ),
  );
  return {
    runs: trails
      .flatMap((trail) => runsOf(trail, gathered))
      .filter(({ started_at }) => inWindow(window, started_at))
      .sort(
        (a, b) =>
          Date.parse(a.started_at) - Date.parse(b.started_at) || a.quest.localeCompare(b.quest) || a.n - b.n,
      ),
    judgements: loads
      .filter(({ role, ts }) => role === 'verifier' && inWindow(window, ts))
      .map(({ quest, n, session, ts, lessons }) => {
        const verdict = session === undefined ? undefined : bySession.get(session);
        return {
          quest,
          n,
          session,
          at: ts,
          lessons,
          stood: verdict === undefined ? undefined : stoodOf(verdict, rulings),
        };
      }),
  };
}
