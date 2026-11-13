// (4) The gazetteer (PS-25): there, fresh, and naming the commands of the territory a character runs. A session reads
// the gazetteer before anything else on the territory; one that does not say how to set up, test and check sends the
// character to guess, and one written long ago describes a territory that moved (PS-21's stamp, gazetteer-drift.ts).
import { commandLinesOf } from '../schema/territory-checks.ts';
import { COMMIT_SHOWN, GAZETTEER_MAX_COMMITS } from './constants.ts';
import { failing, itemOf, reasonOf, standing } from './reasons.ts';
import type { Territory } from '../schema/territory.ts';
import type { Finding, ScorecardItem } from './reasons.ts';

export interface GazetteerState {
  /** territories/<id>/gazetteer.md; null when there is none. */
  readonly text: string | null;
  /** The commit its first line stamps (`<!-- elvaria:commit <sha> -->`, runner-core's gazetteerStampOf). */
  readonly stamp?: string;
  /**
   * Commits since the stamp up to the commit tried; null when git does not know the stamp (another repo's, a history
   * rewritten); absent when they were not counted (no stamp, or no git to count with).
   */
  readonly commits_since?: number | null;
}

/** A command the gazetteer should name, and the field of territory.json it is written in. */
export interface NamedCommand {
  readonly field: string;
  /** A check of several commands is named when one of them is. */
  readonly lines: readonly string[];
}

/** The commands a session meets: not commands.reset, commands.coverage or a check's cleanup, which only the machine runs. */
const SESSION_COMMANDS = ['setup', 'test', 'lint', 'typecheck', 'build'] as const;

export function sessionCommandsOf(territory: Territory): NamedCommand[] {
  const { commands } = territory;
  return [
    ...SESSION_COMMANDS.flatMap((name) => {
      const line = commands[name];
      return line === undefined ? [] : [{ field: `commands.${name}`, lines: [line] }];
    }),
    ...(commands.generate ?? []).map((line) => ({ field: 'commands.generate', lines: [line] })),
    ...territory.checks.map(({ id, run }) => ({ field: `checks.${id}.run`, lines: commandLinesOf(run) })),
  ];
}

const collapsed = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * A line's leading words up to its first option (`pnpm install --frozen-lockfile` → `pnpm install`), when that is two
 * words or more: the gazetteer may name a command without the flags the territory runs it with.
 */
function stemOf(line: string): string | undefined {
  const words = collapsed(line).split(' ');
  const firstOption = words.findIndex((word) => word.startsWith('-'));
  const stem = firstOption === -1 ? words : words.slice(0, firstOption);
  return stem.length > 1 ? stem.join(' ') : undefined;
}

/** Whether `text` names the command `line`: the whole line, or its stem, whitespace aside. */
export function namesCommand(text: string, line: string): boolean {
  const said = collapsed(text);
  const stem = stemOf(line);
  return said.includes(collapsed(line)) || (stem !== undefined && said.includes(stem));
}

function freshness(state: GazetteerState): Finding {
  const { stamp, commits_since: commits } = state;
  if (stamp === undefined) return failing(reasonOf('gazetteer_unstamped'));
  const shown = stamp.slice(0, COMMIT_SHOWN);
  if (commits === undefined) return standing(reasonOf('gazetteer_stamp_unchecked', { stamp: shown }));
  if (commits === null) return failing(reasonOf('gazetteer_stamp_unknown', { stamp: shown }));
  if (commits > GAZETTEER_MAX_COMMITS)
    return failing(reasonOf('gazetteer_stale', { stamp: shown, commits, max: GAZETTEER_MAX_COMMITS }));
  return standing(reasonOf('gazetteer_fresh', { stamp: shown, commits }));
}

function namingFindings(territory: Territory, text: string): Finding[] {
  const commands = sessionCommandsOf(territory);
  const unnamed = commands.filter(({ lines }) => !lines.some((line) => namesCommand(text, line)));
  if (unnamed.length > 0)
    return unnamed.map(({ field, lines }) =>
      failing(reasonOf('command_unnamed', { field, command: lines.join(' && ') })),
    );
  return commands.length === 0 ? [] : [standing(reasonOf('gazetteer_names', { count: commands.length }))];
}

export function gazetteerItem(territory: Territory, state: GazetteerState): ScorecardItem {
  const { text } = state;
  if (text === null || text.trim() === '')
    return itemOf('gazetteer', [failing(reasonOf('gazetteer_missing'))]);
  return itemOf('gazetteer', [freshness(state), ...namingFindings(territory, text)]);
}
