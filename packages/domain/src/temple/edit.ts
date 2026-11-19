// One operation of a temple report on the scriptures (PS-12c, temple-first plan, ADR 0027, ADR 0005): the Steward reads
// every scripture and its ledger, this decides, the Steward writes. An operation is checked only when no trace of it is
// on disk yet; one the Steward began before it stopped is completed, never refused and never applied twice: the new
// line's id is made from the report's command id and the operation's place (lessonIdOf), and a line taken out records
// the command that took it. The Steward writes the ledgers first, then the Markdown, then the lines of the log, so a
// half-written operation always leaves a trace this reads.
import { ok } from '../core/result.ts';
import { appendLine, formatLessonLine, removeLines } from './format.ts';
import { ledgerEntryOf, linesOf } from './ledger.ts';
import { checkedOf } from './refusal.ts';
import type { LessonId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { ScriptureEntry } from '../schema/lesson/scripture.ts';
import type { ScriptureOperation } from '../schema/temple/operation.ts';
import type { ScriptureFile } from './ledger.ts';
import type { Checked, EditFacts, LessonRefusal, NewLine, Taking, TempleState } from './refusal.ts';

export type { EditFacts, LessonRefusal, NewLine, TempleCharacter, TempleState } from './refusal.ts';

export type LessonEvent =
  | { readonly type: 'lesson.added'; readonly data: EventData<'lesson.added'> }
  | { readonly type: 'lesson.retired'; readonly data: EventData<'lesson.retired'> };

/** What the Steward writes for one operation: the files it changes, then the lines of the log; nothing when done before. */
export interface ScriptureEdit {
  readonly files: readonly ScriptureFile[];
  readonly events: readonly LessonEvent[];
}

interface Planned {
  readonly files: ReadonlyMap<string, ScriptureFile>;
  readonly changed: ReadonlySet<string>;
  readonly events: readonly LessonEvent[];
}

const startOf = (state: TempleState): Planned => ({
  files: new Map(state.files.map((file) => [file.owner, file])),
  changed: new Set(),
  events: [],
});

/** A file's own entry for the line, the Monk's, either still there or taken out by this very command. */
function takenEntryOf(file: ScriptureFile, id: LessonId, facts: EditFacts): ScriptureEntry | undefined {
  const entry = ledgerEntryOf(file.ledger, id);
  if (entry?.source !== 'monk') return undefined;
  if (entry.retired === undefined) return linesOf(file).some((line) => line.id === id) ? entry : undefined;
  return entry.retired.command === facts.command ? entry : undefined;
}

/** `file` with the Monk's line `taking.id` out of the Markdown and retired in the ledger; undefined when nothing changes. */
function takeOutOf(file: ScriptureFile, taking: Taking, facts: EditFacts): ScriptureFile | undefined {
  const entry = takenEntryOf(file, taking.id, facts);
  if (entry === undefined) return undefined;
  const lines = linesOf(file).filter((line) => line.id === taking.id);
  const retired = entry.retired ?? {
    at: facts.at,
    by: 'monk' as const,
    text: lines.map(({ text }) => text).find((text) => text !== '') ?? taking.id,
    ...(taking.why === undefined ? {} : { why: taking.why }),
    ...(taking.merged_into === undefined ? {} : { merged_into: taking.merged_into }),
    command: facts.command,
  };
  const lessons = file.ledger.lessons.map((each) => (each.id === taking.id ? { ...each, retired } : each));
  if (entry.retired !== undefined && lines.length === 0) return undefined;
  const text = removeLines(
    file.text,
    lines.map(({ line }) => line),
  );
  return { ...file, text, ledger: { ...file.ledger, lessons } };
}

/** Every file's copy of the Monk's line taken out; a line retired event per file that changed. */
function takeOut(planned: Planned, taking: Taking, facts: EditFacts): Planned {
  return [...planned.files.values()].reduce<Planned>((sofar, file) => {
    const taken = takeOutOf(file, taking, facts);
    if (taken === undefined) return sofar;
    const data = {
      lesson: taking.id,
      owner: file.owner,
      by: 'monk' as const,
      ...(taking.why === undefined ? {} : { why: taking.why }),
      ...(taking.merged_into === undefined ? {} : { merged_into: taking.merged_into }),
    };
    return {
      files: new Map(sofar.files).set(file.owner, taken),
      changed: new Set(sofar.changed).add(file.owner),
      events: [...sofar.events, { type: 'lesson.retired', data }],
    };
  }, planned);
}

/** The ledger entry of a new line; the CLI version is the checked one of the single tribe its scope names. */
function entryFor(added: NewLine, facts: EditFacts): ScriptureEntry {
  const [tribe, ...more] = added.scope?.tribe ?? [];
  const version = tribe === undefined || more.length > 0 ? undefined : facts.versions[tribe];
  return {
    id: facts.id,
    source: 'monk',
    source_verdict: added.source_verdict,
    ...(version === undefined ? {} : { cli_version: version }),
    added_at: facts.at,
    ...(added.merged.length === 0 ? {} : { merged_from: [...added.merged] }),
  };
}

/** The file with the new line at its end and its entry in the ledger, each unless there already; undefined when both are. */
function withLine(file: ScriptureFile, added: NewLine, facts: EditFacts): ScriptureFile | undefined {
  const written = linesOf(file).some((line) => line.id === facts.id);
  const kept = ledgerEntryOf(file.ledger, facts.id) !== undefined;
  if (written && kept) return undefined;
  const line = {
    id: facts.id,
    scope: added.scope ?? {},
    fail_kind: added.fail_kind,
    cli: null,
    text: added.text,
  };
  const text = written ? file.text : appendLine(file.text, formatLessonLine(line));
  const lessons = kept ? file.ledger.lessons : [...file.ledger.lessons, entryFor(added, facts)];
  return { ...file, text, ledger: { ...file.ledger, lessons } };
}

/** The new line in its owner's scripture, and its lesson.added line. */
function putIn(planned: Planned, added: NewLine, facts: EditFacts): Planned {
  const data = {
    lesson: facts.id,
    owner: added.owner,
    ...(added.scope === undefined ? {} : { scope: added.scope }),
    fail_kind: added.fail_kind,
    source: 'monk' as const,
    source_verdict: added.source_verdict,
    ...(added.merged.length === 0 ? {} : { merged_from: [...added.merged] }),
  };
  return [...planned.files.values()].reduce<Planned>((sofar, file) => {
    const after = file.owner === added.owner ? withLine(file, added, facts) : undefined;
    if (after === undefined) return sofar;
    return {
      files: new Map(sofar.files).set(file.owner, after),
      changed: new Set(sofar.changed).add(file.owner),
      events: [...sofar.events, { type: 'lesson.added', data }],
    };
  }, planned);
}

/** The files the checked operation changes, in the order of the state, and the lines of the log in the order written. */
function planOf(state: TempleState, checked: Checked, facts: EditFacts): ScriptureEdit {
  const taken = checked.takings.reduce((sofar, taking) => takeOut(sofar, taking, facts), startOf(state));
  const planned = checked.added === null ? taken : putIn(taken, checked.added, facts);
  const files = [...planned.files.values()].filter(({ owner }) => planned.changed.has(owner));
  return { files, events: planned.events };
}

/** Whether a stopped Steward already wrote part of this operation: then it is completed, not checked again. */
function begun(state: TempleState, operation: ScriptureOperation, facts: EditFacts): boolean {
  const retiredHere = (id: LessonId): boolean =>
    state.files.some((file) => ledgerEntryOf(file.ledger, id)?.retired?.command === facts.command);
  if (operation.op === 'retire') return retiredHere(operation.lesson);
  const file = state.files.find(({ owner }) => owner === operation.owner);
  const written =
    file !== undefined &&
    (ledgerEntryOf(file.ledger, facts.id) !== undefined || linesOf(file).some(({ id }) => id === facts.id));
  return written || (operation.op === 'merge' && operation.lessons.some(retiredHere));
}

/**
 * What one operation writes, checked against the scriptures as they are now (the owner may have edited them since the
 * report was written); refused with one code, and then nothing is written for it.
 */
export function scriptureEditOf(
  state: TempleState,
  operation: ScriptureOperation,
  facts: EditFacts,
): Result<ScriptureEdit, LessonRefusal> {
  const checked = checkedOf(state, operation, facts, !begun(state, operation, facts));
  return checked.ok ? ok(planOf(state, checked.value, facts)) : checked;
}
