// The Monk's temple report, applied by the Steward (PS-12c, temple-first plan, ADR 0005, ADR 0027): the only writer of
// the scriptures' ledgers, and of a scripture's Markdown only to append or take out a line of the Monk. The domain
// decides each operation (scriptureEditOf) on the files as they are when it is applied, read again before each one; this
// writes what it decided, ledgers first, then the Markdown, then the lesson lines. A report that would replace a
// scripture is refused whole (templeReportIssues) and nothing is written. The letters become memos (letters.ts). Then the
// characters a new line frees are released (release.ts, PS-12g), and the bell rings once for the report.
import { scriptureEditOf, templeReportIssues } from '@elvaria/domain';
import type { CharacterId, EditFacts, InboxCommandOf, ScriptureOperation, Verdict } from '@elvaria/domain';
import { redact } from '@elvaria/eventlog';

import { ring } from '../context.ts';
import { rejected } from '../inbox/quest-commands.ts';
import { STEWARD } from '../quest/record.ts';
import { fileLetters } from './letters.ts';
import { newLineIdOf, releaseFreed } from './release.ts';
import { readScriptures, templeStateOf, writeEdit } from './scriptures.ts';
import type { Context } from '../context.ts';
import type { Outcome } from '../inbox/quest-commands.ts';

type TempleReport = InboxCommandOf<'temple_report'>;

interface Tally {
  readonly added: number;
  readonly retired: number;
  readonly refused: number;
}

const NONE: Tally = { added: 0, retired: 0, refused: 0 };

const warn = (ctx: Context, command: TempleReport, message: string): void => {
  ctx.deps.log.warn(`steward: temple report ${command.id}: ${message}`);
};

/** Why the report's writer may not write one: no such character, or none of a class of the Monk. */
function monkRefusal(ctx: Context, monk: CharacterId): string | undefined {
  const character = ctx.world.characters.get(monk);
  if (character === undefined) return 'unknown_character';
  const entry = ctx.world.registry.classes.find(({ id }) => id === character.class);
  return entry?.is_monk === true ? undefined : 'not_monk';
}

/** The verdicts the report names that exist. */
async function verdictsOf(ctx: Context, command: TempleReport): Promise<Map<string, Verdict>> {
  const { operations, letters } = command.payload;
  const ids = new Set([
    ...operations.flatMap((operation) => ('source_verdict' in operation ? [operation.source_verdict] : [])),
    ...letters.map(({ source_verdict: verdict }) => verdict),
  ]);
  const verdicts = new Map<string, Verdict>();
  for (const id of ids) {
    if (id === undefined) continue;
    const read = await ctx.deps.store.verdicts.read(id);
    if (read.ok) verdicts.set(id, read.value);
  }
  return verdicts;
}

/** The checked CLI version of each tribe: what it last passed `tribe check` on, else its pinned one. */
const versionsOf = (ctx: Context): Record<string, string> =>
  Object.fromEntries(
    ctx.world.kingdom.tribes.flatMap(({ id, tool }) => {
      const version = tool?.checked_version ?? tool?.version;
      return version === undefined ? [] : [[id, version]];
    }),
  );

/** The facts of the operation at `index`: its new line's id, made from the report, and what the domain cannot read. */
const factsOf = (
  ctx: Context,
  command: TempleReport,
  index: number,
  verdicts: ReadonlyMap<string, Verdict>,
): EditFacts => ({
  command: command.id,
  id: newLineIdOf(command, index),
  at: ctx.record.stamp(),
  verdicts: new Map([...verdicts].map(([id, verdict]) => [id, verdict.result])),
  versions: versionsOf(ctx),
  // ADR 0013: the patterns of the event log; a session's own secret values still keep a line out of its prompt.
  secret: (text) => redact(text, []) !== text,
});

/** One operation checked and written; its lesson lines, or its refusal. */
async function applyOne(
  ctx: Context,
  command: TempleReport,
  index: number,
  operation: ScriptureOperation,
  verdicts: ReadonlyMap<string, Verdict>,
): Promise<Tally> {
  const before = await readScriptures(ctx);
  if (typeof before === 'string') {
    warn(ctx, command, `operation ${String(index + 1)} is not applied: ${before}`);
    return NONE;
  }
  const edit = scriptureEditOf(templeStateOf(ctx, before), operation, factsOf(ctx, command, index, verdicts));
  if (!edit.ok) {
    const { code, lesson, issues } = edit.error;
    const data = {
      op: operation.op,
      code,
      ...(lesson === undefined ? {} : { lesson }),
      ...(issues === undefined ? {} : { issues }),
    };
    await ctx.record.note({ type: 'lesson.refused', actor: STEWARD, data });
    return { ...NONE, refused: 1 };
  }
  const failed = await writeEdit(ctx, before, edit.value);
  if (failed !== undefined) {
    warn(ctx, command, `operation ${String(index + 1)} is not written: ${failed}`);
    return NONE;
  }
  for (const { type, data } of edit.value.events) await ctx.record.note({ type, actor: STEWARD, data });
  const count = (type: string) => edit.value.events.filter((event) => event.type === type).length;
  return { added: count('lesson.added'), retired: count('lesson.retired'), refused: 0 };
}

/** Applies a temple report: whole, operation by operation, or not at all; then its letters; then the bell, once. */
export async function applyTempleReport(ctx: Context, command: TempleReport): Promise<Outcome> {
  const { character, operations, letters } = command.payload;
  const refusal = monkRefusal(ctx, character);
  if (refusal !== undefined) return rejected(refusal);
  const files = await readScriptures(ctx);
  if (typeof files === 'string') {
    warn(ctx, command, `a scripture cannot be read: ${files}`);
    return rejected('scripture_unreadable');
  }
  const whole = templeReportIssues(operations, files);
  if (!whole.ok) {
    const { code } = whole.error;
    await ring(ctx, {
      kind: 'temple',
      character,
      ...NONE,
      refused: operations.length,
      letters: 0,
      rejected: code,
    });
    return rejected(code);
  }
  const verdicts = await verdictsOf(ctx, command);
  let tally = NONE;
  for (const [index, operation] of operations.entries()) {
    const one = await applyOne(ctx, command, index, operation, verdicts);
    tally = {
      added: tally.added + one.added,
      retired: tally.retired + one.retired,
      refused: tally.refused + one.refused,
    };
  }
  const filed = await fileLetters(ctx, character, letters, verdicts);
  const released = await releaseFreed(ctx, command);
  const freed = released.length === 0 ? {} : { released };
  if (tally.added + tally.retired + tally.refused + filed + released.length > 0)
    await ring(ctx, { kind: 'temple', character, ...tally, letters: filed, ...freed });
  return { status: 'applied' };
}
