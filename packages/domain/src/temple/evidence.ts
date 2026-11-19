// What the Monk reads (PS-12d, temple-first plan DB10, DB14, DB16): the repeated failures of the recent window, each
// verdict's notes cut short; the lines of scripture with their counts; the checks of each territory and the scripts of
// the catalog (the rungs below a line); and the Monk's lines worth a review. No journal (DB16). The pack has a ceiling
// of characters, the smaller of TEMPLE_PROMPT_MAX_CHARS and the tribe's prompt_max_chars: the groups that repeat most
// stay first, the rest are dropped. The caller passes notes through `redact` first (ADR 0013); the domain cannot.
import { FAIL_RATE_BUCKET_RUNS } from '../metrics/lesson-constants.ts';
import { TEMPLE_NOTES_MAX_CHARS, TEMPLE_PROMPT_MAX_CHARS } from './constants.ts';
import type { CheckId, LessonRef, ScriptId, TerritoryId, VerdictId } from '../core/ids.ts';
import type { LessonCount } from '../metrics/lesson-counts.ts';
import type { RepeatedFailure, RepeatedMember } from '../metrics/repeated-failures.ts';
import type { FailKind } from '../schema/common.ts';
import type { LessonScope } from '../schema/lesson/scope.ts';
import type { ScriptureEntry } from '../schema/lesson/scripture.ts';

/** A failed run of a group, with its verdict's notes. */
export interface EvidenceMember extends RepeatedMember {
  readonly notes: string;
}

export interface EvidenceGroup {
  /** The group's id in the reply: its fail kind, one group per kind. */
  readonly group: FailKind;
  readonly members: readonly EvidenceMember[];
}

/** A line of scripture as the pack shows it: where it loads, and what the ledger counted of it. */
export interface EvidenceLine {
  readonly ref: LessonRef;
  readonly owner: string;
  readonly source: ScriptureEntry['source'];
  readonly scope: LessonScope;
  readonly fail_kind: FailKind | null;
  readonly text: string;
  readonly loads: number;
  readonly helped: number;
  readonly missed: number;
}

export interface TempleEvidence {
  readonly groups: readonly EvidenceGroup[];
  readonly lines: readonly EvidenceLine[];
  /** The Monk's lines worth a review: loaded FAIL_RATE_BUCKET_RUNS times or more, and missed no less than helped. */
  readonly reviews: readonly LessonRef[];
  readonly checks: Readonly<Record<TerritoryId, readonly CheckId[]>>;
  readonly scripts: readonly ScriptId[];
  /** The groups the ceiling dropped, the least repeated first left out. */
  readonly dropped: readonly FailKind[];
}

/** A line as the caller read it, before the counts are joined. */
export type ScriptureEvidenceLine = Omit<EvidenceLine, 'loads' | 'helped' | 'missed'>;

export interface EvidenceSource {
  readonly failures: readonly RepeatedFailure[];
  /** The notes of each fail verdict, already redacted. */
  readonly notes: ReadonlyMap<VerdictId, string>;
  readonly lines: readonly ScriptureEvidenceLine[];
  readonly counts: readonly LessonCount[];
  readonly checks: Readonly<Record<TerritoryId, readonly CheckId[]>>;
  readonly scripts: readonly ScriptId[];
  /** The Monk tribe's prompt_max_chars on this OS (promptMaxOf); undefined when it declares none. */
  readonly prompt_max?: number;
}

const ELLIPSIS = '…';

/** The notes cut to TEMPLE_NOTES_MAX_CHARS, an ellipsis marking the cut. */
export const cutNotes = (notes: string): string =>
  notes.length <= TEMPLE_NOTES_MAX_CHARS ? notes : `${notes.slice(0, TEMPLE_NOTES_MAX_CHARS - 1)}${ELLIPSIS}`;

/** The pack's ceiling of characters. */
export const evidenceCeilingOf = (promptMax: number | undefined): number =>
  Math.min(TEMPLE_PROMPT_MAX_CHARS, promptMax ?? TEMPLE_PROMPT_MAX_CHARS);

/** The characters the pack takes as the prompt carries it: its JSON. */
export const evidenceSizeOf = (evidence: TempleEvidence): number => JSON.stringify(evidence).length;

function linesOf(source: EvidenceSource): EvidenceLine[] {
  const counts = new Map(source.counts.map((count) => [count.ref, count]));
  return source.lines.map((line) => {
    const count = counts.get(line.ref);
    return { ...line, loads: count?.loads ?? 0, helped: count?.helped ?? 0, missed: count?.missed ?? 0 };
  });
}

const worthReview = (line: EvidenceLine): boolean =>
  line.source === 'monk' && line.loads >= FAIL_RATE_BUCKET_RUNS && line.missed >= line.helped;

/** The pack for the Monk; groups beyond the ceiling are dropped from the least repeated up. */
export function templeEvidenceOf(source: EvidenceSource): TempleEvidence {
  const lines = linesOf(source);
  const groups = source.failures.map(({ fail_kind, members }) => ({
    group: fail_kind,
    members: members.map((member) => ({
      ...member,
      notes: cutNotes(source.notes.get(member.verdict) ?? ''),
    })),
  }));
  const ceiling = evidenceCeilingOf(source.prompt_max);
  const base = {
    lines,
    reviews: lines.filter(worthReview).map(({ ref }) => ref),
    checks: source.checks,
    scripts: source.scripts,
  };
  // repeatedFailuresOf gives the biggest group first, so the kept groups are a prefix.
  for (let kept = groups.length; kept > 0; kept -= 1) {
    const evidence = {
      ...base,
      groups: groups.slice(0, kept),
      dropped: groups.slice(kept).map(({ group }) => group),
    };
    if (evidenceSizeOf(evidence) <= ceiling) return evidence;
  }
  return { ...base, groups: [], dropped: groups.map(({ group }) => group) };
}

/** Whether a session would have anything to decide: no group and no line to review is a run with no model (DB10). */
export const evidenceIsEmpty = (evidence: TempleEvidence): boolean =>
  evidence.groups.length === 0 && evidence.reviews.length === 0;
