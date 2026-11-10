// The program of every territory command (P1-41, the P1-35 proposal (a)). The Steward starts `checks[].run`,
// `checks[].cleanup` and `commands.setup|reset|coverage` without a shell, finding the program on its own PATH
// (processHostOf, implementation-plan §6), and a session's shell gets that PATH for the others (`commands.generate`).
// A program missing there fails only when a quest reaches the command: `sh` under PowerShell on Windows, where Git
// for Windows puts its usr\bin on PATH inside Git Bash alone (P1-35). doctor looks the program up the same way.
import { commandLinesOf } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';
import { splitCommandLine } from '@elvaria/runner-core';

import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { finding } from './finding.ts';
import type { CliIo } from '../io.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** One command line of a territory and the field it is written in (`checks.e2e.run`, `commands.reset`). */
export interface TerritoryCommand {
  readonly field: string;
  readonly line: string;
}

/** Every command of the territory, `commands.*` first, then each check's `run` and `cleanup`. */
export function territoryCommands(territory: Territory): TerritoryCommand[] {
  const commands = Object.entries(territory.commands).flatMap(([name, value]) =>
    value === undefined ? [] : commandLinesOf(value).map((line) => ({ field: `commands.${name}`, line })),
  );
  const checks = territory.checks.flatMap(({ id, run, cleanup }) => [
    ...commandLinesOf(run).map((line) => ({ field: `checks.${id}.run`, line })),
    ...(cleanup === undefined ? [] : [{ field: `checks.${id}.cleanup`, line: cleanup }]),
  ]);
  return [...commands, ...checks];
}

/** Where a program is for the Steward: found, absent from PATH, or a `.cmd`/`.bat` only a shell can start. */
type Program =
  | { readonly kind: 'found' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'shell'; readonly file: string };

async function programOf(name: string, io: CliIo): Promise<Program> {
  const file = await findExecutable(name, io.env, io.platform);
  if (file === undefined) return { kind: 'missing' };
  return (await launchOf(file, io.nodePath)) === undefined ? { kind: 'shell', file } : { kind: 'found' };
}

const commandLine = ({ field, line }: TerritoryCommand): string => `${field}: ${line}`;

/** The territory's commands grouped by what is wrong with their program; `unsplit` cannot run without a shell. */
async function sortCommands(
  commands: readonly TerritoryCommand[],
  io: CliIo,
  known: Map<string, Promise<Program>>,
) {
  const unsplit: TerritoryCommand[] = [];
  const byProgram = new Map<string, TerritoryCommand[]>();
  for (const command of commands) {
    const words = splitCommandLine(command.line);
    if (!words.ok) {
      unsplit.push(command);
      continue;
    }
    const [program = ''] = words.value;
    byProgram.set(program, [...(byProgram.get(program) ?? []), command]);
  }
  const programs = await Promise.all(
    [...byProgram.keys()].map(async (name) => {
      const found = known.get(name) ?? programOf(name, io);
      known.set(name, found);
      return [name, await found] as const;
    }),
  );
  return { unsplit, byProgram, programs };
}

/** One line per program the Steward cannot start, naming the commands that use it; one ✓ line when all start. */
async function territoryFindings(
  territory: Territory,
  ctx: KingdomContext,
  known: Map<string, Promise<Program>>,
): Promise<Finding[]> {
  const { t } = ctx;
  const commands = territoryCommands(territory);
  if (commands.length === 0) return [];
  const { unsplit, byProgram, programs } = await sortCommands(commands, ctx.io, known);
  const id = territory.id;
  const unsplitFindings =
    unsplit.length === 0
      ? []
      : [finding('error', t('cli.doctor.command_shell_syntax', { id }), unsplit.map(commandLine))];
  const programFindings = programs.flatMap(([program, found]) => {
    if (found.kind === 'found') return [];
    const lines = (byProgram.get(program) ?? []).map(commandLine);
    if (found.kind === 'shell')
      return [finding('error', t('cli.doctor.program_shell_only', { id, program, path: found.file }), lines)];
    return [
      finding('error', t('cli.doctor.program_missing', { id, program }), [
        ...lines,
        t('cli.doctor.program_hint'),
      ]),
    ];
  });
  const problems = [...unsplitFindings, ...programFindings];
  if (problems.length > 0) return problems;
  const names = programs.map(([program]) => program).join(', ');
  return [finding('ok', t('cli.doctor.programs', { id, count: commands.length, programs: names }))];
}

/** The programs of every readable territory's commands, each program looked up once. */
export async function checkTerritoryCommands(ctx: KingdomContext): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  const known = new Map<string, Promise<Program>>();
  const findings = await Promise.all(items.map((territory) => territoryFindings(territory, ctx, known)));
  return findings.flat();
}
