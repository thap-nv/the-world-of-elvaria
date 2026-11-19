// The Monk's reply held against the pack it answered (PS-12d, ADR 0027), then turned into one temple_report command.
// The schema checked the shape; this checks what needs the pack: each group decided once and none outside it, each
// verdict from its group, at most TEMPLE_ADDS_MAX lines and TEMPLE_LETTERS_MAX letters, each review one of the lines
// the pack named. A reply that breaks one writes nothing. The command is the Monk's (`character`), source `monk`;
// a line keeps the group's fail kind, and a letter goes where its rung says (letterRouteOf). The Steward then applies
// each operation or refuses it (PS-12c): a rule it holds (the 41st line, the owner's lines) is not checked twice here.
import { err, ok } from '../core/result.ts';
import { letterRouteOf } from '../schema/temple/operation.ts';
import { TEMPLE_ADDS_MAX, TEMPLE_LETTERS_MAX } from './constants.ts';
import type { CharacterId, LessonId, VerdictId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { FailKind } from '../schema/common.ts';
import type { ScriptureOperation, TempleLetter, TempleReportPayload } from '../schema/temple/operation.ts';
import type { TempleDecision, TempleReply } from '../schema/temple/reply.ts';
import type { LetterRung } from './constants.ts';
import type { TempleEvidence } from './evidence.ts';

export type TempleReplyIssueCode =
  | 'twice_decided'
  | 'undecided'
  | 'unknown_group'
  | 'foreign_verdict'
  | 'too_many_lines'
  | 'too_many_letters'
  | 'unknown_review'
  | 'twice_reviewed';

export interface TempleReplyIssue {
  readonly code: TempleReplyIssueCode;
  /** The group, verdict or line the issue is about; absent for a count. */
  readonly about?: string;
}

const verdictOf = (decision: TempleDecision): VerdictId | undefined =>
  decision.letter?.source_verdict ?? decision.lesson?.source_verdict;

function decisionIssues(reply: TempleReply, evidence: TempleEvidence): TempleReplyIssue[] {
  const groups = new Map(
    evidence.groups.map(({ group, members }) => [group, members.map(({ verdict }) => verdict)]),
  );
  const seen = new Set<FailKind>();
  const issues: TempleReplyIssue[] = [];
  for (const decision of reply.decisions) {
    const verdicts = groups.get(decision.group);
    if (verdicts === undefined) issues.push({ code: 'unknown_group', about: decision.group });
    else if (seen.has(decision.group)) issues.push({ code: 'twice_decided', about: decision.group });
    const verdict = verdictOf(decision);
    if (verdicts !== undefined && verdict !== undefined && !verdicts.includes(verdict))
      issues.push({ code: 'foreign_verdict', about: verdict });
    seen.add(decision.group);
  }
  for (const group of groups.keys()) if (!seen.has(group)) issues.push({ code: 'undecided', about: group });
  return issues;
}

function reviewIssues(reply: TempleReply, evidence: TempleEvidence): TempleReplyIssue[] {
  const named = new Set<string>(evidence.reviews);
  const seen = new Set<LessonId>();
  return reply.reviews.flatMap(({ lesson }) => {
    const issue: TempleReplyIssue[] = !named.has(lesson)
      ? [{ code: 'unknown_review', about: lesson }]
      : seen.has(lesson)
        ? [{ code: 'twice_reviewed', about: lesson }]
        : [];
    seen.add(lesson);
    return issue;
  });
}

/** What breaks the reply against the pack; none: it may be turned into a command. */
export function templeReplyIssues(reply: TempleReply, evidence: TempleEvidence): TempleReplyIssue[] {
  const lines = reply.decisions.filter(({ lesson }) => lesson !== undefined).length;
  const letters = reply.decisions.filter(({ letter }) => letter !== undefined).length;
  return [
    ...decisionIssues(reply, evidence),
    ...(lines > TEMPLE_ADDS_MAX ? [{ code: 'too_many_lines' as const }] : []),
    ...(letters > TEMPLE_LETTERS_MAX ? [{ code: 'too_many_letters' as const }] : []),
    ...reviewIssues(reply, evidence),
  ];
}

function operationsOf(reply: TempleReply): ScriptureOperation[] {
  // A merge is the line that replaces the Monk's lines it names (PS-12c): its new line counts as an add.
  const adds = reply.decisions.flatMap(({ group, lesson }) =>
    lesson === undefined
      ? []
      : [
          {
            ...(lesson.replaces === undefined
              ? { op: 'add' as const }
              : { op: 'merge' as const, lessons: lesson.replaces }),
            owner: lesson.owner,
            ...(lesson.scope === undefined ? {} : { scope: lesson.scope }),
            fail_kind: group,
            text: lesson.text,
            source_verdict: lesson.source_verdict,
          },
        ],
  );
  const retires = reply.reviews.flatMap(({ lesson, review, why }) =>
    review === 'retire' ? [{ op: 'retire' as const, lesson, why }] : [],
  );
  return [...retires, ...adds];
}

function lettersOf(reply: TempleReply): TempleLetter[] {
  return reply.decisions.flatMap(({ rung, letter }) => {
    if (letter === undefined) return [];
    // The schema lets a letter ride only on a letter rung.
    const letterRung = rung as LetterRung;
    return [{ rung: letterRung, to: letterRouteOf(letterRung), ...letter }];
  });
}

export interface TempleCommandsError {
  readonly code: 'issues';
  readonly issues: readonly TempleReplyIssue[];
}

/**
 * The payload of the one temple_report the reply makes, written by the Monk `character`; null when it changes no line
 * and carries no letter (every decision `none`, every review `keep`). Retirements first, so a file freed of a line
 * takes a new one under the 40-line cap.
 */
export function templeCommands(
  reply: TempleReply,
  evidence: TempleEvidence,
  character: CharacterId,
): Result<TempleReportPayload | null, TempleCommandsError> {
  const issues = templeReplyIssues(reply, evidence);
  if (issues.length > 0) return err({ code: 'issues', issues });
  const operations = operationsOf(reply);
  const letters = lettersOf(reply);
  return ok(operations.length + letters.length === 0 ? null : { character, operations, letters });
}
