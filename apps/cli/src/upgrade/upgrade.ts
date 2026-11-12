// `elvaria upgrade [--ref <ref>] | --rollback` (implementation-plan §3.16.4, ADR 0026 as amended 2026-11-11;
// PS-04b): the build a kingdom runs changes only through a step that tries it first and can be undone. The new
// build is a detached worktree of the repo this CLI runs from, at `<kingdom>/.builds/<sha>/`; it is installed,
// tried (trial.ts) and only then pinned in `.state/build.json`, with the build before it kept as the way back; then
// its migrate runs on the kingdom (the trial ran it on a copy). Two builds stay on disk. The command itself always
// runs on the code it is typed with (pin.ts).
import { inKingdom } from '@elvaria/store';

import { flagOption, textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { recordUpgrade } from '../events.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { buildCli } from './build-cli.ts';
import {
  buildDirOf,
  buildsBesides,
  commitOf,
  findTools,
  prepareBuild,
  reasonOf,
  removeBuild,
} from './build.ts';
import { BUILD_FILE, hasCli, readPointer, shortSha, writePointer } from './pointer.ts';
import { holdKingdom, rollbackKingdom } from './rollback.ts';
import { SELF_ROOT } from './self.ts';
import { buildTrial } from './trial.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { StepFailure, Tools } from './build.ts';
import type { BuildPointer } from './pointer.ts';
import type { Trial, TrialFailure } from './trial.ts';

/** The branch a build is made from unless `--ref` names another: the one the owner merges into. */
export const DEFAULT_REF = 'main';
/** How much of a failed step's output the owner sees: its end, where the reason is. */
const OUTPUT_LINES = 40;
const MIGRATE_MINUTES = 5;

export interface UpgradeDeps {
  /** The Elvaria repo builds are made from: the one this CLI runs from. */
  readonly source: string;
  readonly tools: Tools;
  readonly trial: Trial;
}

interface Plan {
  readonly ref: string;
  readonly sha: string;
  readonly dir: string;
  readonly pinned: BuildPointer | undefined;
  /** The build is the one before the pinned one, still on disk: it is tried again, not built again. */
  readonly reuse: boolean;
}

/** A child's output, indented under the line that names the step; its end, where the reason is. */
function printLines(output: string, print: (line: string) => void): void {
  const lines = output.split(/\r?\n/).filter((line) => line.trim() !== '');
  lines.slice(-OUTPUT_LINES).forEach((line) => {
    print(`    ${line}`);
  });
}

const printOutput = (ctx: KingdomContext, output: string): void => {
  printLines(output, ctx.io.err);
};

async function removeOne(ctx: KingdomContext, deps: UpgradeDeps, sha: string): Promise<void> {
  const left = await removeBuild(deps.tools, ctx.io, deps.source, buildDirOf(ctx.store.root, sha));
  if (left === undefined) ctx.io.out(ctx.t('cli.upgrade.removed', { sha: shortSha(sha) }));
  else ctx.io.err(ctx.t('cli.upgrade.left', { sha: shortSha(sha), reason: left }));
}

/** Worktree, install, hook; a folder of a failed earlier try is removed first. */
async function prepared(
  ctx: KingdomContext,
  deps: UpgradeDeps,
  plan: Plan,
): Promise<TrialFailure | undefined> {
  const label = ctx.t('cli.upgrade.step.prepare');
  if ((await buildsBesides(ctx.store.root, [])).includes(plan.sha)) await removeOne(ctx, deps, plan.sha);
  const failure: StepFailure | undefined = await prepareBuild(deps.tools, ctx.io, {
    source: deps.source,
    dir: plan.dir,
    sha: plan.sha,
  });
  ctx.io.out(
    failure === undefined
      ? ctx.t('cli.upgrade.step_passed', { step: label })
      : ctx.t('cli.upgrade.step_failed', { step: label, reason: failure.reason }),
  );
  return failure === undefined ? undefined : { step: 'prepare', ...failure };
}

async function refuse(
  ctx: KingdomContext,
  deps: UpgradeDeps,
  plan: Plan,
  failure: TrialFailure,
): Promise<ExitCode> {
  printOutput(ctx, failure.output);
  await recordUpgrade(ctx, 'upgrade.failed', { to: plan.sha, step: failure.step, reason: failure.reason });
  if (!plan.reuse) await removeOne(ctx, deps, plan.sha);
  const params = { sha: shortSha(plan.sha), step: failure.step };
  ctx.io.err(
    plan.pinned === undefined
      ? ctx.t('cli.upgrade.failed_first', params)
      : ctx.t('cli.upgrade.failed', { ...params, current: shortSha(plan.pinned.current) }),
  );
  return EXIT.failed;
}

/**
 * The new build's migrate on the kingdom itself, once it is pinned: the trial ran it on a copy, and the pinned
 * build cannot load the kingdom until it has run (a registry file it requires, a newer file version). Its lines are
 * the owner's to read; it keeps the old text of what it rewrites in `.backup/`.
 */
async function migrated(ctx: KingdomContext, plan: Plan): Promise<boolean> {
  ctx.io.out(ctx.t('cli.upgrade.migrating'));
  const outcome = await buildCli(plan.dir, ctx.io)(['migrate', '--kingdom', ctx.store.root], MIGRATE_MINUTES);
  printLines(outcome.stdout, ctx.io.out);
  if (outcome.code === 0) return true;
  printLines(outcome.stderr, ctx.io.err);
  ctx.io.err(ctx.t('cli.upgrade.migrate_failed', { reason: reasonOf(outcome) }));
  return false;
}

async function switchTo(ctx: KingdomContext, deps: UpgradeDeps, plan: Plan): Promise<ExitCode> {
  const from = plan.pinned?.current ?? null;
  await writePointer(ctx.store.root, { current: plan.sha, previous: from, switched_at: ctx.now() });
  await recordUpgrade(ctx, 'upgrade.switched', { from, to: plan.sha });
  ctx.io.out(
    from === null
      ? ctx.t('cli.upgrade.switched_first', { sha: shortSha(plan.sha) })
      : ctx.t('cli.upgrade.switched', { sha: shortSha(plan.sha), previous: shortSha(from) }),
  );
  const ready = await migrated(ctx, plan);
  for (const sha of await buildsBesides(ctx.store.root, from === null ? [plan.sha] : [plan.sha, from]))
    await removeOne(ctx, deps, sha);
  if (!ready) return EXIT.failed;
  ctx.io.out(ctx.t('cli.upgrade.then'));
  return EXIT.ok;
}

async function buildAndSwitch(ctx: KingdomContext, deps: UpgradeDeps, plan: Plan): Promise<ExitCode> {
  const { io, t } = ctx;
  await recordUpgrade(ctx, 'upgrade.started', {
    ref: plan.ref,
    to: plan.sha,
    from: plan.pinned?.current ?? null,
  });
  const where = { sha: shortSha(plan.sha), ref: plan.ref, source: deps.source, dir: plan.dir };
  io.out(plan.reuse ? t('cli.upgrade.reusing', where) : t('cli.upgrade.building', where));
  const failure =
    (plan.reuse ? undefined : await prepared(ctx, deps, plan)) ??
    (await deps.trial(
      { build: plan.dir, kingdom: ctx.store.root, tribes: ctx.kingdom.tribes },
      { t, out: io.out },
    ));
  return failure === undefined ? switchTo(ctx, deps, plan) : refuse(ctx, deps, plan, failure);
}

export async function upgradeKingdom(ctx: KingdomContext, ref: string, deps: UpgradeDeps): Promise<ExitCode> {
  const { io, t } = ctx;
  const root = ctx.store.root;
  const sha = await commitOf(deps.tools, io, deps.source, ref);
  if (sha === undefined) {
    io.err(t('cli.upgrade.unknown_ref', { ref, source: deps.source }));
    return EXIT.failed;
  }
  const read = await readPointer(root);
  if (read.kind === 'unreadable') {
    io.err(t('cli.build.unreadable', { file: inKingdom(root, BUILD_FILE) }));
    return EXIT.failed;
  }
  const pinned = read.kind === 'pinned' ? read.pointer : undefined;
  if (pinned?.current === sha) {
    io.out(t('cli.upgrade.already', { sha: shortSha(sha), ref }));
    return EXIT.ok;
  }
  const lock = await holdKingdom(ctx, true);
  if (lock === undefined) return EXIT.failed;
  try {
    const dir = buildDirOf(root, sha);
    const reuse = pinned?.previous === sha && (await hasCli(dir));
    return await buildAndSwitch(ctx, deps, { ref, sha, dir, pinned, reuse });
  } finally {
    await lock.release();
  }
}

async function runUpgrade(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const rollback = flagOption(input, 'rollback') === true;
  const ref = textOption(input, 'ref');
  if (rollback && ref !== undefined) {
    cli.io.err(cli.t('cli.upgrade.rollback_ref'));
    return EXIT.usage;
  }
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  if (rollback) return rollbackKingdom(ctx);
  const tools = await findTools(ctx.io);
  if ('missing' in tools) {
    ctx.io.err(ctx.t('cli.upgrade.no_tool', { program: tools.missing }));
    return EXIT.failed;
  }
  const deps = { source: SELF_ROOT, tools, trial: buildTrial(tools, ctx.io) };
  return upgradeKingdom(ctx, ref ?? DEFAULT_REF, deps);
}

export const UPGRADE: CommandSpec = {
  name: ['upgrade'],
  summary: 'cli.upgrade.summary',
  args: [],
  options: {
    ref: { type: 'string', value: '<ref>', help: 'cli.upgrade.option.ref' },
    rollback: { type: 'boolean', help: 'cli.upgrade.option.rollback' },
  },
  run: runUpgrade,
};
