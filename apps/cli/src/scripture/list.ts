// `elvaria scripture list [--character <id>]` (PS-12): each lesson of the kingdom's scriptures with its ref (the id
// of its line, or `T_…` for a line without one, as the load trace names it), its scope, its fail kind and its source.
// With a character, its own scripture then the temple's in load order, and which lines its heaviest session loads
// (worstLoadOf: the role and territory that load the most, a quest with every tag) and which the 40-line cap cuts.
import { LESSON_SCOPE_KEYS, SCRIPTURE_LINES_MAX, loadableIn, selectLessons } from '@elvaria/domain';
import type { Character, LessonScope, LessonSelection } from '@elvaria/domain';
import { lessonsIn } from '@elvaria/steward';
import type { ScriptureLesson } from '@elvaria/steward';
import type { MessageKey } from '@elvaria/i18n';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { registryIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { NONE, printListing } from '../listing.ts';
import { heaviestLoadOf, lessonsOfCharacter, readKingdomScriptures } from './read.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { KingdomScriptures } from './read.ts';

const HEADER: readonly MessageKey[] = [
  'cli.column.ref',
  'cli.column.file',
  'cli.column.line',
  'cli.column.scope',
  'cli.column.fail_kind',
  'cli.column.source',
  'cli.column.load',
  'cli.column.text',
];

/** `role=verifier tribe=codex,claude`, as the line's head writes it, without fail_kind and cli. */
const scopeCell = (scope: LessonScope): string =>
  LESSON_SCOPE_KEYS.flatMap((key) => {
    const values = scope[key];
    return values === undefined ? [] : [`${key}=${values.join(',')}`];
  }).join(' ') || NONE;

type LoadState = 'loaded' | 'out_of_scope' | 'unreadable' | 'over_cap';

const STATE_LABELS: Readonly<Record<LoadState, MessageKey>> = {
  loaded: 'cli.scripture.state.loaded',
  out_of_scope: 'cli.scripture.state.out_of_scope',
  unreadable: 'cli.scripture.state.unreadable',
  over_cap: 'cli.scripture.state.over_cap',
};

/** Where the selection put the lesson; without one, only whether it can load at all. */
function stateOf(
  scriptures: KingdomScriptures,
  selection: LessonSelection<ScriptureLesson> | null,
  lesson: ScriptureLesson,
): LoadState | null {
  if (selection === null) return loadableIn(lesson, scriptures.vocabulary) ? null : 'unreadable';
  const states: readonly LoadState[] = ['loaded', 'out_of_scope', 'unreadable', 'over_cap'];
  return states.find((state) => selection[state].includes(lesson)) ?? null;
}

function rowOf(ctx: KingdomContext, lesson: ScriptureLesson, state: LoadState | null): string[] {
  return [
    lesson.ref,
    lesson.file,
    String(lesson.line),
    scopeCell(lesson.scope),
    lesson.fail_kind ?? NONE,
    // Until the ledger beside the scripture (PS-12c), every line is the owner's (ADR 0027).
    ctx.t('cli.scripture.source.user'),
    state === null ? NONE : ctx.t(STATE_LABELS[state]),
    lesson.text,
  ];
}

/** The heaviest session's selection of the character's lessons, after the line that names that session. */
function characterSelection(
  ctx: KingdomContext,
  scriptures: KingdomScriptures,
  character: Character,
  lessons: readonly ScriptureLesson[],
): LessonSelection<ScriptureLesson> | null {
  const load = heaviestLoadOf(scriptures, character);
  if (load === null) {
    ctx.io.out(ctx.t('cli.scripture.list.no_territory', { character: character.id }));
    return null;
  }
  const session = {
    role: load.role,
    class: character.class,
    tribe: character.tribe,
    os: scriptures.os,
    territory: load.territory,
    tags: scriptures.tags,
  };
  const selection = selectLessons(lessons, session, scriptures.vocabulary);
  ctx.io.out(
    ctx.t('cli.scripture.list.session', {
      character: character.id,
      role: load.role,
      territory: load.territory,
      loaded: selection.loaded.length,
      lines: load.lines,
      max: SCRIPTURE_LINES_MAX,
    }),
  );
  return selection;
}

async function runScriptureList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const scriptures = await readKingdomScriptures(ctx);
  if ('problems' in scriptures) {
    scriptures.problems.flatMap((issue) => registryIssueLines(ctx.t, issue)).forEach(ctx.io.err);
    return EXIT.failed;
  }
  const id = textOption(input, 'character');
  const character = scriptures.characters.find((each) => each.id === id);
  if (id !== undefined && character === undefined) {
    ctx.io.err(ctx.t('cli.scripture.unknown_character', { id }));
    return EXIT.failed;
  }
  const lessons =
    character === undefined ? lessonsIn(scriptures.files) : lessonsOfCharacter(scriptures, character);
  const selection =
    character === undefined || lessons.length === 0
      ? null
      : characterSelection(ctx, scriptures, character, lessons);
  return printListing(ctx, {
    header: HEADER,
    rows: lessons.map((lesson) => rowOf(ctx, lesson, stateOf(scriptures, selection, lesson))),
    issues: scriptures.issues,
    empty: 'cli.scripture.list.none',
  });
}

export const SCRIPTURE_LIST: CommandSpec = {
  name: ['scripture', 'list'],
  summary: 'cli.scripture.list.summary',
  args: [],
  options: {
    character: { type: 'string', value: '<id>', help: 'cli.scripture.option.character' },
  },
  run: runScriptureList,
};
