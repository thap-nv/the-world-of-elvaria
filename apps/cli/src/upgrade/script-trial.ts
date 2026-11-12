// The last trial of a new build (implementation-plan §3.16.4, ADR 0026; PS-04b): one script-tier quest, 0 mana,
// end to end on a throwaway kingdom, through the new build's own commands: init, every tribe off (no CLI starts),
// a one-commit territory, `quest add --script count-files`, then its Steward until the quest has a verdict. Only a
// pass lets the pointer move. The throwaway folder has a space in its name, like the owner's (implementation-plan §6).
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { killTree } from '@elvaria/runner-core';

import { buildCli, startBuildCli } from './build-cli.ts';
import { gitRun, outputOf, reasonOf } from './build.ts';
import type { CliIo } from '../io.ts';
import type { BuildCli, LongChild } from './build-cli.ts';
import type { StepFailure, Tools } from './build.ts';

const POLL_MS = 500;
/** How long the Steward may take to judge the quest: one tick claims and runs it, the next judges (about 10 s). */
const MAX_POLLS = 360;
const CLI_MINUTES = 2;
const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;
/** Fixed by the git config of this repo only: the trial's commit is nobody's work. */
const IDENTITY = ['-c', 'user.name=elvaria', '-c', 'user.email=elvaria@localhost'];
const TRIAL = 'upgrade-trial';
const README_FILE = 'README.md';
const MARKDOWN_GLOB = '**/*.md';
const TRIAL_DIR_PREFIX = 'elvaria upgrade ';
const PASS = 'verdict.pass';
const ENDS = new Set([PASS, 'verdict.fail', 'verdict.partial', 'quest.infirmary']);

const failed = (reason: string, output = ''): StepFailure => ({ reason, output });

/** A territory of one commit: a README for count-files to find. */
async function makeLand(tools: Tools, io: CliIo, land: string): Promise<StepFailure | undefined> {
  await mkdir(land, { recursive: true });
  await writeFile(path.join(land, README_FILE), `# ${TRIAL}\n`);
  const git = gitRun(tools, io);
  for (const args of [
    ['init', '-b', 'main'],
    ['add', '--all'],
    [...IDENTITY, 'commit', '-m', TRIAL],
  ]) {
    const outcome = await git(land, args);
    if (outcome.code !== 0) return failed(reasonOf(outcome), outputOf(outcome));
  }
  return undefined;
}

/** The tribes the new build's `init` enabled, read from the file it wrote. */
async function enabledTribes(kingdom: string): Promise<string[]> {
  const file = JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')) as {
    tribes?: { id: string; enabled?: boolean }[];
  };
  return (file.tribes ?? []).filter(({ enabled }) => enabled === true).map(({ id }) => id);
}

/** Runs each command in turn; the first that fails stops the trial. */
async function each(
  cli: BuildCli,
  commands: readonly (readonly string[])[],
): Promise<StepFailure | undefined> {
  for (const args of commands) {
    const outcome = await cli(args, CLI_MINUTES);
    if (outcome.code !== 0) return failed(reasonOf(outcome), outputOf(outcome));
  }
  return undefined;
}

async function foundKingdom(cli: BuildCli, kingdom: string, land: string): Promise<StepFailure | undefined> {
  const at = ['--kingdom', kingdom];
  const founded = await each(cli, [['init', ...at, '--name', TRIAL]]);
  if (founded !== undefined) return founded;
  const off = (await enabledTribes(kingdom)).map((tribe) => ['tribe', 'disable', tribe, ...at]);
  const ready = await each(cli, [...off, ['territory', 'add', land, ...at]]);
  if (ready !== undefined) return ready;
  const [territory = ''] = await readdir(path.join(kingdom, 'territories'));
  const quest = ['--territory', territory, '--kind', 'analyze', '--rank', 'E', '--title', TRIAL];
  const script = ['--script', 'count-files', '--params', JSON.stringify({ globs: [MARKDOWN_GLOB] })];
  return each(cli, [['quest', 'add', ...quest, '--description', TRIAL, ...script, ...at]]);
}

/** `type` of one log line; a torn last line has none. Read as plain JSON, whatever the new build's schema. */
function typeOf(line: string): unknown {
  try {
    return (JSON.parse(line) as { type?: unknown }).type;
  } catch {
    return undefined;
  }
}

/** The first line of the log that ends the quest's trial, if one is there yet. */
async function endOf(kingdom: string): Promise<string | undefined> {
  const dir = path.join(kingdom, 'events');
  const files = (await readdir(dir).catch(() => [])).filter((name) => name.endsWith('.jsonl'));
  for (const file of files.sort()) {
    for (const line of (await readFile(path.join(dir, file), 'utf8')).split('\n')) {
      const type = typeOf(line);
      if (typeof type === 'string' && ENDS.has(type)) return type;
    }
  }
  return undefined;
}

/** Waits for the verdict while the Steward runs; it stopping first is a failure of its own. */
async function verdictOf(run: LongChild, kingdom: string): Promise<StepFailure | undefined> {
  let output = '';
  let exit: number | null | undefined;
  run.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  run.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
  run.on('exit', (code) => (exit = code));
  // A Node that cannot start says so with `error` and may never say `exit`.
  run.on('error', () => (exit = null));
  for (let poll = 0; poll < MAX_POLLS && exit === undefined; poll += 1) {
    const end = await endOf(kingdom);
    if (end !== undefined) return end === PASS ? undefined : failed(end, output);
    await delay(POLL_MS);
  }
  // The Steward may have written the verdict as it stopped.
  const end = await endOf(kingdom);
  if (end !== undefined) return end === PASS ? undefined : failed(end, output);
  return failed(exit === undefined ? 'no_verdict' : reasonOf({ code: exit, stdout: '', stderr: '' }), output);
}

async function stop(run: LongChild): Promise<void> {
  const exited = new Promise((resolve) => {
    if (run.exitCode !== null || run.signalCode !== null || run.pid === undefined) resolve(undefined);
    else {
      run.on('exit', resolve);
      run.on('error', resolve);
    }
  });
  await killTree(run.pid ?? 0);
  await exited;
}

export async function scriptTrial(tools: Tools, io: CliIo, build: string): Promise<StepFailure | undefined> {
  const dir = await mkdtemp(path.join(tmpdir(), TRIAL_DIR_PREFIX));
  try {
    const land = path.join(dir, 'land');
    const kingdom = path.join(dir, 'kingdom');
    const ready =
      (await makeLand(tools, io, land)) ?? (await foundKingdom(buildCli(build, io), kingdom, land));
    if (ready !== undefined) return ready;
    const run = startBuildCli(build, io, ['run', '--kingdom', kingdom]);
    try {
      return await verdictOf(run, kingdom);
    } finally {
      await stop(run);
    }
  } finally {
    await rm(dir, RM_TEMP).catch(() => undefined);
  }
}
