// `elvaria territory add <path>`: attach a repo or folder to the kingdom (opening a realm, implementation-plan
// §2.3). The CLI writes the new territory.json itself: a territory is settings the Steward reads, not quest or
// character state (ADR 0005); attach_territory in the inbox is for the herald and the phone, which cannot look at
// the disk. Laws and checks are filled per territory (P1-11); the worktree exclude comes with the plot (P1-07).
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { NAME_MAX_LENGTH, TerritoryIdSchema, TerritorySchema } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';
import { comparePath, toPortable } from '@elvaria/store';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { recordTerritoryAttached } from '../events.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { gitIn } from '../process/git.ts';
import { RULES_GLOB, ruleFilesOf } from './claude-rules.ts';
import { readGitInfo } from './git-info.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const TERRITORY_KINDS = ['code', 'docs', 'content', 'data', 'mixed'] as const;
type TerritoryKind = (typeof TERRITORY_KINDS)[number];
const isTerritoryKind = (value: string): value is TerritoryKind =>
  (TERRITORY_KINDS as readonly string[]).includes(value);
const SLUG_MAX_LENGTH = 32;

/** A territory id from a folder name: `Tool - DC1` → `tool-dc1`, `Đồ án` → `do-an`. */
export function slugOf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}

async function isFolder(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Same folder once links are followed: git prints real paths, and on macOS the temp folder `/var/…` is a link to
 * `/private/var/…`.
 */
async function sameFolder(a: string, b: string, platform: NodeJS.Platform): Promise<boolean> {
  const [left, right] = await Promise.all([realpath(a), realpath(b)]);
  return comparePath(left, right, platform) === 0;
}

/** `vcs` of the new territory, or the sentence that says why it cannot be attached. */
async function detectVcs(
  folder: string,
  branch: string | undefined,
  ctx: KingdomContext,
): Promise<Territory['vcs'] | string> {
  const git = await gitIn(ctx.io, folder);
  if (git === undefined) {
    return (await isFolder(path.join(folder, '.git')))
      ? ctx.t('cli.territory.git_missing')
      : { type: 'none' };
  }
  const info = await readGitInfo(git);
  if (info === undefined) return { type: 'none' };
  if (!(await sameFolder(info.root, folder, ctx.io.platform)))
    ctx.io.out(ctx.t('cli.territory.inside_repo', { root: info.root }));
  const defaultBranch = branch ?? info.defaultBranch;
  if (defaultBranch === undefined) return ctx.t('cli.territory.no_branch');
  return {
    type: 'git',
    default_branch: defaultBranch,
    ...(info.remote === undefined ? {} : { remote: info.remote }),
  };
}

/** The new territory's id, name and kind as typed, or the problems with them. */
function readNames(input: CommandInput, folder: string, ctx: KingdomContext) {
  const problems: string[] = [];
  const id = textOption(input, 'id') ?? slugOf(path.basename(folder));
  if (!TerritoryIdSchema.safeParse(id).success) problems.push(ctx.t('cli.territory.bad_id', { id }));
  // macOS may hand back a folder name in decomposed form (NFD); names are stored composed, as typed.
  const name = textOption(input, 'name') ?? path.basename(folder).normalize('NFC').slice(0, NAME_MAX_LENGTH);
  if (name.length === 0 || name.length > NAME_MAX_LENGTH)
    problems.push(ctx.t('cli.error.name_length', { max: NAME_MAX_LENGTH }));
  const kind = textOption(input, 'kind') ?? 'code';
  if (!isTerritoryKind(kind))
    problems.push(ctx.t('cli.error.choice', { option: '--kind', choices: TERRITORY_KINDS.join(', ') }));
  return { id, name, kind, problems };
}

/** Another territory already has this id or this folder. */
async function clashOf(ctx: KingdomContext, id: string, folder: string): Promise<string | undefined> {
  const { items } = await ctx.store.territories.list();
  const sameId = items.find((territory) => territory.id === id);
  if (sameId !== undefined) return ctx.t('cli.territory.id_taken', { id });
  const samePath = items.find((territory) => comparePath(territory.path, folder, ctx.io.platform) === 0);
  return samePath === undefined ? undefined : ctx.t('cli.territory.path_taken', { id: samePath.id });
}

async function runTerritoryAdd(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const folder = path.resolve(ctx.io.cwd, input.positionals[0] ?? '');
  if (!(await isFolder(folder))) {
    ctx.io.err(ctx.t('cli.territory.not_a_folder', { path: folder }));
    return EXIT.failed;
  }
  const { id, name, kind, problems } = readNames(input, folder, ctx);
  const clash = problems.length === 0 ? await clashOf(ctx, id, folder) : undefined;
  const vcs = await detectVcs(folder, textOption(input, 'branch'), ctx);
  const all = [
    ...problems,
    ...(clash === undefined ? [] : [clash]),
    ...(typeof vcs === 'string' ? [vcs] : []),
  ];
  if (all.length > 0 || typeof vcs === 'string') {
    all.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const territory = TerritorySchema.parse({
    version: 1,
    id,
    name,
    path: toPortable(folder, ctx.io.platform),
    kind,
    vcs,
  });
  const written = await ctx.store.territories.write(territory);
  if (!written.ok) {
    storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
    return EXIT.failed;
  }
  await recordTerritoryAttached(ctx, written.value);
  ctx.io.out(ctx.t('cli.territory.added', { name, id, path: territory.path }));
  if (vcs.type === 'git') {
    ctx.io.out(ctx.t('cli.territory.git', { branch: vcs.default_branch ?? '' }));
    await hintRules(ctx, folder, territory);
  }
  return EXIT.ok;
}

/** (h) of the P1-50 report: a repo with `.claude/rules/` is told to let the Steward patch it (P1-56). */
async function hintRules(ctx: KingdomContext, folder: string, territory: Territory): Promise<void> {
  const { uncovered } = await ruleFilesOf(folder, territory.laws.patch_paths);
  if (uncovered.length > 0)
    ctx.io.out(
      ctx.t('cli.territory.rules_hint', { id: territory.id, count: uncovered.length, glob: RULES_GLOB }),
    );
}

export const TERRITORY_ADD: CommandSpec = {
  name: ['territory', 'add'],
  summary: 'cli.territory.add.summary',
  args: [{ name: '<path>', help: 'cli.territory.add.arg.path' }],
  options: {
    id: { type: 'string', value: '<id>', help: 'cli.territory.add.option.id' },
    name: { type: 'string', value: '<name>', help: 'cli.territory.add.option.name' },
    kind: { type: 'string', value: '<kind>', help: 'cli.territory.add.option.kind' },
    branch: { type: 'string', value: '<branch>', help: 'cli.territory.add.option.branch' },
  },
  run: runTerritoryAdd,
};
