// Hand-made kingdoms for the lesson ledger's specs (PS-12b): a quest per run, each with the opening line the Steward
// writes and the load trace it carries, and a verdict; `opening` and `ledgerOf` are the parts for the finer cases.
import { at, lineOf, questId, questOf, verdictOf } from './ledger.ts';
import type { MetricsCharacter, MetricsInput } from '../ledger.ts';
import type { EvidenceJudgement, EvidenceRun } from '../lesson-runs.ts';
import type { FailKind } from '../../schema/common.ts';
import type { Event } from '../../schema/event/event.ts';
import type { Quest } from '../../schema/quest/quest.ts';
import type { Verdict } from '../../schema/quest/verdict.ts';

/** A ref the load trace schema accepts (`L_<day>_<6 base32>`). */
export const ref = (digits: string): string => `L_20261119_${digits}`;

export interface OpeningSpec {
  readonly session?: string;
  /** The run the quest view says it is at. */
  readonly attempts: number;
  readonly status?: 'working' | 'review';
  readonly minute: number;
  readonly day?: string;
  /** Absent: a load trace with no `lessons` (a resumed session, a kingdom before PS-12). */
  readonly lessons?: readonly string[];
  /** false: the line carries no load trace at all (a line before PS-01b). */
  readonly trace?: boolean;
  readonly type?: 'quest.started' | 'quest.unblocked' | 'quest.resumed';
}

/** The line that opens a session of quest `quest`, as record.ts writes it. */
export function opening(quest: number, spec: OpeningSpec): Event {
  const { session, attempts, status = 'working', minute, day, lessons, trace = true, type } = spec;
  const loadTrace = {
    scriptures: [],
    skills: [],
    blocks: [{ part: 'user', id: 'quest', chars: 100 }],
    ...(lessons === undefined ? {} : { lessons }),
  };
  const line = lineOf(
    type ?? 'quest.started',
    { quest: { id: questId(quest), status, attempts }, ...(trace ? { load_trace: loadTrace } : {}) },
    at(minute, day),
    questId(quest),
  );
  return session === undefined ? line : { ...line, session };
}

// Not branded: the ledger's characters are read from files, and a spec writes the ids as text.
export const THORN = { id: 'thorn', tribe: 'claude', class: 'knight' } as unknown as MetricsCharacter;
export const VESPER = { id: 'vesper', tribe: 'codex', class: 'sage' } as unknown as MetricsCharacter;

type Ledger = Partial<Omit<MetricsInput, 'commands'>>;

/** A ledger of the parts given; no character is known unless the parts say so. */
export const ledgerOf = (parts: Ledger): MetricsInput =>
  ({ quests: [], verdicts: [], events: [], commands: [], ...parts }) as MetricsInput;

/** `2026-10-01`, `2026-10-02`, …: the day of run `index` in a world of many runs. */
export const dayOfRun = (index: number): string =>
  new Date(Date.UTC(2026, 9, 1 + index)).toISOString().slice(0, 'yyyy-mm-dd'.length);

export interface RunRow {
  /** Absent: no verdict yet. */
  readonly result?: 'pass' | 'fail';
  readonly fail_kind?: FailKind;
  readonly lessons?: readonly string[];
  readonly tags?: readonly string[];
  readonly territory?: string;
  /** Default `thorn`, a claude knight. */
  readonly character?: 'thorn' | 'vesper';
}

/** One quest and one run per row, a day apart, in order; row `i` is quest `i + 1` and session `a<i + 1>`. */
export function runsWorld(rows: readonly RunRow[], extra: Ledger = {}): MetricsInput {
  const quests: Quest[] = [];
  const verdicts: Verdict[] = [];
  const events: Event[] = [];
  rows.forEach((row, index) => {
    const number = index + 1;
    const day = dayOfRun(index);
    const session = `a${number}`;
    quests.push(
      questOf(number, [{ n: 1, character: row.character ?? 'thorn', start: 0, end: 5, session, day }], {
        tags: row.tags ?? ['infra'],
        ...(row.territory === undefined ? {} : { territory: row.territory }),
      }),
    );
    events.push(
      opening(number, {
        session,
        attempts: 1,
        minute: 0,
        day,
        ...(row.lessons === undefined ? {} : { lessons: row.lessons }),
      }),
    );
    if (row.result !== undefined)
      verdicts.push({
        ...verdictOf(number, 1, row.result, {
          ...(row.fail_kind === undefined ? {} : { fail_kind: row.fail_kind }),
          minute: 6,
        }),
        created_at: at(6, day),
      });
  });
  return ledgerOf({ quests, verdicts, events, characters: [THORN, VESPER], ...extra });
}

type Loose<T> = T extends string ? string : T extends readonly (infer U)[] ? readonly Loose<U>[] : T;

/** What a spec says of a run or a judge session: ids as plain text, the brands being the reader's business. */
export type LooseOf<T> = { -readonly [K in keyof T]?: Loose<T[K]> };

/** A run of the evidence by hand, a thorn's, undecided and carrying nothing; `over` says what differs. */
export const evidenceRun = (over: LooseOf<EvidenceRun> = {}): EvidenceRun =>
  ({
    quest: questId(1),
    n: 1,
    started_at: at(0),
    territory: 'dc1-se-team',
    tags: ['infra'],
    character: 'thorn',
    class: 'knight',
    tribe: 'claude',
    model: null,
    result: undefined,
    fail_kind: null,
    verdict: null,
    lessons: [],
    loaded_at: null,
    ...over,
  }) as EvidenceRun;

/** A judge session of the evidence by hand. */
export const evidenceJudgement = (over: LooseOf<EvidenceJudgement> = {}): EvidenceJudgement =>
  ({
    quest: questId(1),
    n: 1,
    session: 'v1',
    at: at(6),
    lessons: [],
    stood: undefined,
    ...over,
  }) as EvidenceJudgement;

/** `count` runs one a day from day `from`, each given by `over(index)`, the quest number following the day. */
export const runsOf = (
  count: number,
  over: (index: number) => LooseOf<EvidenceRun> = () => ({}),
  from = 0,
): EvidenceRun[] =>
  Array.from({ length: count }, (_, offset) => {
    const index = from + offset;
    const day = dayOfRun(index);
    return evidenceRun({
      quest: questId(index + 1),
      started_at: at(0, day),
      loaded_at: at(0, day),
      ...over(index),
    });
  });

/** A judge's verdict on run `attempt` of quest 1, written by session `session`; none when it names no session. */
export const judged = (
  attempt: number,
  result: Verdict['result'],
  session: string | undefined,
  minute: number,
  fail_kind?: 'style' | 'unsafe' | 'tests_fail',
): Verdict => {
  const { session_id: _fixtureSession, ...verdict } = verdictOf(1, attempt, result, {
    ...(fail_kind === undefined ? {} : { fail_kind }),
    minute,
  });
  return { ...verdict, ...(session === undefined ? {} : { session_id: session }) };
};

/** The owner's return of run `attempt` of quest 1, with or without the rejudge flag. */
export const returned = (attempt: number, minute: number, rejudge: boolean): Verdict =>
  verdictOf(1, attempt, 'fail', { owner: true, fail_kind: 'other', minute, rejudge });
