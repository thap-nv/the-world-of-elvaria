// Why an operation of a temple report may not be applied (PS-12c, temple-first plan "Trần 40 dòng", DB4, DB7, T4):
// pure, on the scriptures as they are when the Steward applies it. The checks run in a fixed order and the first that
// fails names the refusal: the source verdict, the lines to take out (the Monk's only: the owner's lines are never
// touched), the file, the lint, a sentence already there, and the 41st line a session would load.
import { err, ok } from '../core/result.ts';
import { LESSON_ISSUE_CODES } from './issues.ts';
import { SCRIPTURE_LINES_MAX } from './constants.ts';
import { formatLessonLine, removeLines } from './format.ts';
import { linesOf, liveEntryOf } from './ledger.ts';
import { lintLesson } from './lint.ts';
import { parseScripture } from './parse.ts';
import { lessonTextKeyOf } from './ref.ts';
import { worstLoadOf } from './select.ts';
import type { LessonId, Ulid, VerdictId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { FailKind } from '../schema/common.ts';
import type { LessonScope } from '../schema/lesson/scope.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { AddOperation, MergeOperation, ScriptureOperation } from '../schema/temple/operation.ts';
import type { LessonRefusalCode } from './constants.ts';
import type { LessonIssueCode } from './issues.ts';
import type { ScriptureFile } from './ledger.ts';
import type { ScriptureLine } from './parse.ts';
import type { LessonVocabulary } from './select.ts';

/** A character as the 40-line rule weighs it: one suspended is left out unless the line is for its own scripture. */
export interface TempleCharacter {
  readonly id: string;
  readonly class: string;
  readonly tribe: string;
  readonly suspended: boolean;
}

/** The scriptures of the kingdom as the Steward reads them before an operation, and what a scope is matched against. */
export interface TempleState {
  /** The temple's and every character's, an absent file as an empty one. */
  readonly files: readonly ScriptureFile[];
  readonly characters: readonly TempleCharacter[];
  readonly vocabulary: LessonVocabulary;
  /** The OS the Steward runs on: what a scope's `os` is matched against. */
  readonly os: string;
}

/** What the Steward knows beside the files: the command, the new line's id and the time, verdicts, versions, secrets. */
export interface EditFacts {
  /** The id of the temple_report command (its ULID). */
  readonly command: Ulid;
  /** The id a new line of this operation gets (lessonIdOf). */
  readonly id: LessonId;
  /** Now, in kingdom.tz. */
  readonly at: string;
  /** The result of each verdict the report names that exists. */
  readonly verdicts: ReadonlyMap<string, Verdict['result']>;
  /** The checked CLI version of each tribe (its `checked_version`, else its pinned `version`). */
  readonly versions: Readonly<Record<string, string>>;
  /** Whether the event log's redaction would mask part of `text` (the domain cannot import it, ADR 0013). */
  readonly secret: (text: string) => boolean;
}

export interface LessonRefusal {
  readonly code: LessonRefusalCode;
  readonly lesson?: LessonId;
  readonly issues?: readonly LessonIssueCode[];
}

/** Why the Monk may not take `id` out: no line carries it, or no line that does is the Monk's. */
function takingRefusal(state: TempleState, id: LessonId): LessonRefusal | undefined {
  const holders = state.files.filter((file) => linesOf(file).some((line) => line.id === id));
  if (holders.length === 0) return { code: 'unknown_lesson', lesson: id };
  const monk = holders.some((file) => liveEntryOf({ id }, file.ledger)?.source === 'monk');
  return monk ? undefined : { code: 'not_monk_lesson', lesson: id };
}

/** The scriptures with the Monk's lines `ids` taken out of the Markdown: what the new line would stand with. */
const withoutLines = (files: readonly ScriptureFile[], ids: readonly LessonId[]): ScriptureFile[] =>
  files.map((file) => {
    const gone = linesOf(file).filter(
      (line) =>
        line.id !== null && ids.includes(line.id) && liveEntryOf(line, file.ledger)?.source === 'monk',
    );
    return gone.length === 0
      ? file
      : {
          ...file,
          text: removeLines(
            file.text,
            gone.map(({ line }) => line),
          ),
        };
  });

const rank = (code: LessonIssueCode): number => LESSON_ISSUE_CODES.indexOf(code);

/** The new line as a session would read it, and the lint's codes that refuse it: an error, no fail kind, a secret. */
function linted(
  operation: AddOperation | MergeOperation,
  facts: EditFacts,
  vocabulary: LessonVocabulary,
): { readonly line?: ScriptureLine; readonly issues: readonly LessonIssueCode[] } {
  const fields = { id: facts.id, scope: operation.scope ?? {}, fail_kind: operation.fail_kind ?? null };
  const text = operation.text.trim();
  const parsed = parseScripture(formatLessonLine({ ...fields, cli: null, text }), operation.owner);
  const [line] = parsed.lessons;
  // A line break splits the sentence into a lesson and stray text: a character no reader of the line sees.
  if (line === undefined || parsed.lessons.length > 1 || parsed.stray.length > 0)
    return { issues: ['hidden_char'] };
  const issues = [
    ...lintLesson(line, vocabulary)
      .filter(({ level, code }) => level === 'error' || code === 'missing_fail_kind')
      .map(({ code }) => code),
    ...(facts.secret(text) ? ['secret' as const] : []),
  ];
  return { line, issues: [...new Set(issues)].toSorted((a, b) => rank(a) - rank(b)) };
}

/** The same sentence in a scripture the line would load with: its own file and the temple's, or any for the temple. */
function duplicated(files: readonly ScriptureFile[], line: ScriptureLine): boolean {
  const key = lessonTextKeyOf(line.text);
  return files
    .filter(({ owner }) => line.owner === 'temple' || owner === line.owner || owner === 'temple')
    .some((file) => linesOf(file).some(({ text }) => lessonTextKeyOf(text) === key));
}

/**
 * Whether some character's heaviest session would load more than SCRIPTURE_LINES_MAX lines with this one (DB4): every
 * character for a line of the temple, its owner for a character's own; a suspended character only for its own.
 */
function overCap(state: TempleState, files: readonly ScriptureFile[], line: ScriptureLine): boolean {
  const { vocabulary } = state;
  const weighed = state.characters.filter(
    ({ id, suspended }) =>
      (line.owner === 'temple' || id === line.owner) && (!suspended || id === line.owner),
  );
  return weighed.some((character) => {
    const own = files.filter(({ owner }) => owner === character.id);
    const temple = files.filter(({ owner }) => owner === 'temple');
    const profile = {
      class: character.class,
      tribe: character.tribe,
      os: state.os,
      territories: vocabulary.territories,
      tags: vocabulary.tags,
    };
    const worst = worstLoadOf([...own, ...temple].flatMap(linesOf), profile, vocabulary, line);
    return worst !== null && worst.lines > SCRIPTURE_LINES_MAX;
  });
}

/** What the Monk takes out: a line retired with why, or merged into the new one. */
export interface Taking {
  readonly id: LessonId;
  readonly why?: string;
  readonly merged_into?: LessonId;
}

/** The line an add or a merge writes, once checked: its fail kind and verdict known, its sentence trimmed. */
export interface NewLine {
  readonly owner: string;
  readonly scope?: LessonScope;
  readonly fail_kind: FailKind;
  readonly source_verdict: VerdictId;
  readonly text: string;
  /** The Monk's lines it replaces (a merge); none for an add. */
  readonly merged: readonly LessonId[];
}

/** What an operation may do: the lines it takes out, and the line it writes (none for a retire). */
export interface Checked {
  readonly takings: readonly Taking[];
  readonly added: NewLine | null;
}

/**
 * The checks of an add or a merge, in the order the module's comment gives. Those on the scriptures as they are now
 * (the lines it takes out, a duplicate, the cap) run only on a fresh operation; those on the operation itself (its
 * verdict, its file, the lint) hold the same on a second pass and run on every one.
 */
function checkedLine(
  state: TempleState,
  operation: AddOperation | MergeOperation,
  facts: EditFacts,
  fresh: boolean,
): Result<Checked, LessonRefusal> {
  const { source_verdict: verdict, fail_kind: failKind } = operation;
  if (verdict === undefined) return err({ code: 'no_source_verdict' });
  if (facts.verdicts.get(verdict) !== 'fail') return err({ code: 'unknown_verdict' });
  const merged = operation.op === 'merge' ? operation.lessons : [];
  const taken = fresh
    ? merged.map((id) => takingRefusal(state, id)).find((each) => each !== undefined)
    : undefined;
  if (taken !== undefined) return err(taken);
  if (!state.files.some(({ owner }) => owner === operation.owner)) return err({ code: 'unknown_owner' });
  const { line, issues } = linted(operation, facts, state.vocabulary);
  if (issues.length > 0 || failKind === undefined || line === undefined) return err({ code: 'lint', issues });
  const scope = operation.scope === undefined ? {} : { scope: operation.scope };
  const added = {
    owner: operation.owner,
    ...scope,
    fail_kind: failKind,
    source_verdict: verdict,
    text: line.text,
    merged,
  };
  const checked = { takings: merged.map((id) => ({ id, merged_into: facts.id })), added };
  if (!fresh) return ok(checked);
  const files = withoutLines(state.files, merged);
  if (duplicated(files, line)) return err({ code: 'duplicate' });
  return overCap(state, files, line) ? err({ code: 'over_cap' }) : ok(checked);
}

/**
 * What the operation may do, or the first check it fails; one a stopped Steward began (not fresh) is not
 * checked against the scriptures again, only against itself.
 */
export function checkedOf(
  state: TempleState,
  operation: ScriptureOperation,
  facts: EditFacts,
  fresh: boolean,
): Result<Checked, LessonRefusal> {
  if (operation.op !== 'retire') return checkedLine(state, operation, facts, fresh);
  const refused = fresh ? takingRefusal(state, operation.lesson) : undefined;
  if (refused !== undefined) return err(refused);
  return ok({ takings: [{ id: operation.lesson, why: operation.why }], added: null });
}
