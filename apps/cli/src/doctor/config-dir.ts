// The config folder of a tribe's CLI (PS-27, ADR 0021): `tool.config_dir`, where the CLI keeps the account's sign-in and
// every transcript. `elvaria doctor --config-dir <tribe>=<folder>` pins it, refused before anything is checked or
// written (exit 2) for a folder that is not absolute, does not exist, or lies inside the kingdom or a territory's repo
// or worktree folder, which the characters' tools reach. The treasury, the only other place that holds secrets, lies
// outside the kingdom as well (ADR 0013): the folder proposed is beside it, ~/.elvaria/accounts/<tribe> (CT15). Each
// tribe's check holds a folder already in kingdom.json to the same places and to its adapter's declaration.
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { checkTribeConfigDir } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';
import { fromPortable, toPortable } from '@elvaria/store';

import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

const pathOn = (platform: NodeJS.Platform): path.PlatformPath =>
  platform === 'win32' ? path.win32 : path.posix;

/** A folder the characters' tools reach: the kingdom, a territory's repo, its worktree folder. */
interface Reached {
  readonly folder: string;
  /** The folder once links are followed (macOS: /var is /private/var); itself when it does not exist yet. */
  readonly real: string;
  /** undefined: the kingdom. */
  readonly territory?: string;
}

const realOf = (folder: string): Promise<string> => realpath(folder).catch(() => folder);

async function reachedOf(ctx: KingdomContext): Promise<Reached[]> {
  const { items } = await ctx.store.territories.list();
  const places = [
    { folder: ctx.store.root },
    ...items.flatMap(({ id, path: repo, worktree_dir: plots }) => {
      const folder = fromPortable(repo, ctx.io.platform);
      const worktrees = pathOn(ctx.io.platform).resolve(folder, fromPortable(plots, ctx.io.platform));
      return [
        { folder, territory: id },
        { folder: worktrees, territory: id },
      ];
    }),
  ];
  return Promise.all(places.map(async (place) => ({ ...place, real: await realOf(place.folder) })));
}

/** Whether `child` is `parent` or lies under it; without case where the file system has none (Windows, macOS). */
function within(parent: string, child: string, platform: NodeJS.Platform): boolean {
  const caseless = platform === 'win32' || platform === 'darwin';
  const [from, to] = caseless ? [parent.toLowerCase(), child.toLowerCase()] : [parent, child];
  const paths = pathOn(platform);
  const relative = paths.relative(from, to);
  return !(relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative));
}

/** Why a folder reached by the characters cannot hold a tribe's sign-in, or undefined when none reaches it. */
async function reachedProblem(ctx: KingdomContext, tribe: string, dir: string): Promise<string | undefined> {
  const real = await realOf(dir);
  const reached = (await reachedOf(ctx)).find((place) => within(place.real, real, ctx.io.platform));
  if (reached === undefined) return undefined;
  const params = { tribe, path: dir, folder: reached.folder };
  return reached.territory === undefined
    ? ctx.t('cli.doctor.config_dir_in_kingdom', params)
    : ctx.t('cli.doctor.config_dir_in_territory', { ...params, territory: reached.territory });
}

async function isFolder(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** The folder in kingdom.json's form: `/`, normalised, no `/` at the end. */
function portableDir(dir: string, platform: NodeJS.Platform): string {
  const normal = pathOn(platform).normalize(dir);
  const root = pathOn(platform).parse(normal).root;
  const trimmed = normal === root ? normal : normal.replace(/[\\/]+$/, '');
  return toPortable(trimmed, platform);
}

/**
 * The folders of `--config-dir` in kingdom.json's form (an empty one removes the field), or why one is refused. A
 * tribe kingdom.json does not have is refused with the other tribe options (optionProblems).
 */
export async function configDirsOf(
  ctx: KingdomContext,
  given: ReadonlyMap<string, string>,
): Promise<{ readonly dirs: Map<string, string> } | { readonly problems: string[] }> {
  const { platform } = ctx.io;
  const checked = await Promise.all(
    [...given].map(async ([tribe, dir]) => {
      if (dir === '') return undefined;
      const params = { tribe, path: dir };
      if (!pathOn(platform).isAbsolute(dir)) return ctx.t('cli.doctor.config_dir_relative', params);
      if (!(await isFolder(dir))) return ctx.t('cli.doctor.config_dir_missing', params);
      return reachedProblem(ctx, tribe, pathOn(platform).normalize(dir));
    }),
  );
  const problems = checked.filter((problem) => problem !== undefined);
  if (problems.length > 0) return { problems };
  const dirs = [...given].map(
    ([tribe, dir]) => [tribe, dir === '' ? '' : portableDir(dir, platform)] as const,
  );
  return { dirs: new Map(dirs) };
}

/**
 * What a tribe's config folder in kingdom.json breaks (PS-27, CT3, CT4): an adapter that does not run its CLI in one
 * (`capabilities.config_dir`, checkTribeConfigDir), or a folder the characters' tools reach. Both are errors, so
 * `--enable` keeps the tribe off. A tribe naming no folder says nothing.
 */
export async function configDirFindings(
  tribe: Tribe,
  capabilities: Pick<AdapterCapabilities, 'config_dir'>,
  ctx: KingdomContext,
): Promise<Finding[]> {
  const dir = tribe.tool?.config_dir;
  if (dir === undefined) return [];
  const params = { tribe: tribe.id, adapter: tribe.adapter, path: dir };
  const declared = checkTribeConfigDir(capabilities, tribe).ok
    ? []
    : [finding('error', ctx.t('cli.doctor.config_dir_not_declared', params))];
  const reached = await reachedProblem(ctx, tribe.id, fromPortable(dir, ctx.io.platform));
  return [...declared, ...(reached === undefined ? [] : [finding('error', reached)])];
}
