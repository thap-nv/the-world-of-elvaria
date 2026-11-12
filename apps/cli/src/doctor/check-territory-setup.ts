// What the quests of a territory need from the machine besides its programs (P1-56, (c) and (h) of the P1-50 report),
// each a thing that sent the owner in to fix something by hand in the P1-50 run: a Docker that is not running (five
// interventions), a repo without `user.email` where the Steward's commit failed, `.claude/rules/` outside
// `laws.patch_paths` where a character stopped on a question. All three are warnings: the machine can be put right
// in a minute, and none is an error of the kingdom's files.
import { ENVIRONMENT_RECHECK_MINUTES } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import { gitIn } from '../process/git.ts';
import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { RULES_GLOB, ruleFilesOf } from '../territory/claude-rules.ts';
import { territoryCommands } from './check-commands.ts';
import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** A daemon that is down answers at once; one that hangs does not, and the Steward would hang on it as well. */
const DOCKER_TIMEOUT_MS = 20_000;
/** How many rule files a warning names; the folder has the rest. */
const FILES_SHOWN = 10;

/** The daemon's version, which only a running daemon can print. */
const SERVER_VERSION_FORMAT = '{{.ServerVersion}}';

/** `docker compose`, `pnpm e2e:docker`, `docker-compose`: any command line that names docker as a word. */
const USES_DOCKER = /\bdocker\b/i;

const dockerCommandsOf = (territory: Territory) =>
  territoryCommands(territory).filter(({ line }) => USES_DOCKER.test(line));

type Docker =
  | { readonly kind: 'missing' }
  | { readonly kind: 'down' }
  | { readonly kind: 'up'; readonly version: string };

/**
 * The docker program, then the daemon: `docker info` with the env the Steward starts its commands with, so a
 * DOCKER_HOST only the owner's shell has is not seen here, as it is not by the Steward.
 */
async function dockerOf(ctx: KingdomContext): Promise<Docker> {
  const file = await findExecutable('docker', ctx.io.env, ctx.io.platform);
  const launch = file === undefined ? undefined : await launchOf(file, ctx.io.nodePath);
  if (launch === undefined) return { kind: 'missing' };
  const outcome = await runProcess(launch.file, [...launch.args, 'info', '--format', SERVER_VERSION_FORMAT], {
    env: minimalEnv(ctx.io.env),
    timeoutMs: DOCKER_TIMEOUT_MS,
  });
  const version = outcome.stdout.trim();
  return outcome.code === 0 && version !== '' ? { kind: 'up', version } : { kind: 'down' };
}

/** One line on Docker when some territory has a command that uses it; nothing otherwise. */
async function checkDocker(ctx: KingdomContext, territories: readonly Territory[]): Promise<Finding[]> {
  const using = territories.filter((territory) => dockerCommandsOf(territory).length > 0);
  if (using.length === 0) return [];
  const { t } = ctx;
  const ids = using.map(({ id }) => id).join(', ');
  const docker = await dockerOf(ctx);
  if (docker.kind === 'up')
    return [finding('ok', t('cli.doctor.docker_up', { version: docker.version, ids }))];
  const details = using.flatMap((territory) =>
    dockerCommandsOf(territory).map(({ field, line }) => `${territory.id}: ${field}: ${line}`),
  );
  return docker.kind === 'missing'
    ? [finding('warn', t('cli.doctor.docker_missing', { ids }), details)]
    : [finding('warn', t('cli.doctor.docker_down', { ids, minutes: ENVIRONMENT_RECHECK_MINUTES }), details)];
}

/**
 * The repo's own identity, which a commit in any worktree of it uses unless the owner has one for every repo: git
 * says so itself through `config`, so the global file counts. A folder that is no work tree is the business of
 * checkTerritories, and says nothing here.
 */
async function checkIdentity(ctx: KingdomContext, territory: Territory, folder: string): Promise<Finding[]> {
  const git = await gitIn(ctx.io, folder);
  if (git === undefined || (await git(['rev-parse', '--is-inside-work-tree'])) !== 'true') return [];
  const { t } = ctx;
  const email = await git(['config', 'user.email']);
  if (email !== undefined && email !== '')
    return [finding('ok', t('cli.doctor.git_identity', { id: territory.id }))];
  const params = { id: territory.id, path: territory.path };
  return [
    finding('warn', t('cli.doctor.git_identity_missing', params), [
      t('cli.doctor.git_identity_hint', params),
    ]),
  ];
}

/** `.claude/rules/` the Steward may not patch: Claude Code cannot write it, and the assignee can only ask. */
async function checkRules(ctx: KingdomContext, territory: Territory, folder: string): Promise<Finding[]> {
  const { found, uncovered } = await ruleFilesOf(folder, territory.laws.patch_paths);
  if (found.length === 0) return [];
  const { t } = ctx;
  const params = { id: territory.id, count: uncovered.length, glob: RULES_GLOB };
  if (uncovered.length === 0)
    return [finding('ok', t('cli.doctor.rules_patchable', { id: territory.id, count: found.length }))];
  return [finding('warn', t('cli.doctor.rules_outside_patch', params), uncovered.slice(0, FILES_SHOWN))];
}

/** Docker once for the kingdom, then identity and rules of each git territory (`patch_paths` is for git alone). */
export async function checkTerritorySetup(ctx: KingdomContext): Promise<Finding[]> {
  const { items } = await ctx.store.territories.list();
  const perTerritory = await Promise.all(
    items
      .filter(({ vcs }) => vcs.type === 'git')
      .map(async (territory) => {
        const folder = fromPortable(territory.path, ctx.io.platform);
        return [
          ...(await checkIdentity(ctx, territory, folder)),
          ...(await checkRules(ctx, territory, folder)),
        ];
      }),
  );
  return [...(await checkDocker(ctx, items)), ...perTerritory.flat()];
}
