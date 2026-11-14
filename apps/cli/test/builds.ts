// Builds for the specs of `elvaria upgrade` and of the pin (PS-04b): a fixture repo whose commits carry a stub CLI
// at apps/cli/src/cli.ts, a stub pnpm, and pinned builds written straight into a kingdom. The stub answers the
// commands the trial runs as the `behavior.json` beside it says, and records every call, so a spec reads which
// build answered, with which words, in which folder and env.
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { git } from './cli.ts';
import type { Launch } from '../src/process/launch.ts';

/** What the stub does; a field left out is the happy path. */
export interface Behavior {
  /** Exit code per command (`doctor`, `tribe check`, `quest list`…); 0 when not named. */
  readonly exit?: Readonly<Record<string, number>>;
  /** `run`: the line it writes for the trial quest, or `exit` to stop before any. */
  readonly run?: 'verdict.pass' | 'verdict.fail' | 'exit';
  /** File every call is appended to, as JSON lines; ELVARIA_TEST_RECORD wins when set. */
  readonly record?: string;
  /** The trial of upgrade.spec.ts reads this instead of running the build's commands. */
  readonly trial?: 'pass' | 'migrate' | 'doctor' | 'conformance' | 'trial';
  /** `doctor` fails (exit 7) on a kingdom this build's `migrate` has not run on, as a build after PS-02 does. */
  readonly needs_migrate?: boolean;
}

/** What the stub's `migrate` leaves in the kingdom it ran on. */
export const MIGRATED_MARK = 'migrated-by-stub.txt';

export interface Call {
  readonly root: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly pinned: string | null;
  readonly token: string | null;
  readonly git_dir: string | null;
  /** `ELVARIA_UPGRADE_TRIAL`: what `upgrade` tells the new build's doctor (fix/held-tribe-sessions). */
  readonly trial: string | null;
}

/** Plain JavaScript, valid TypeScript: Node runs it as the build's `apps/cli/src/cli.ts`. */
export const STUB_CLI = `import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const behavior = JSON.parse(readFileSync(path.join(root, 'behavior.json'), 'utf8'));
const argv = process.argv.slice(2);
const flag = (name) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
const record = process.env.ELVARIA_TEST_RECORD ?? behavior.record;
const env = process.env;
if (record !== undefined)
  appendFileSync(record, JSON.stringify({ root, argv, cwd: process.cwd(), pinned: env.ELVARIA_PINNED_BUILD ?? null,
    token: env.NPM_TOKEN ?? null, git_dir: env.GIT_DIR ?? null, trial: env.ELVARIA_UPGRADE_TRIAL ?? null }) + '\\n');
const groups = ['tribe', 'quest', 'territory'];
const command = groups.includes(argv[0]) ? argv[0] + ' ' + argv[1] : argv[0];
const code = (behavior.exit ?? {})[command] ?? 0;
if (code !== 0) {
  console.log('stub: ' + command + ' fails');
  process.exit(code);
}
const kingdom = flag('--kingdom');
if (command === 'migrate') writeFileSync(path.join(kingdom, ${JSON.stringify(MIGRATED_MARK)}), root);
if (command === 'doctor' && behavior.needs_migrate === true) {
  try {
    readFileSync(path.join(kingdom, ${JSON.stringify(MIGRATED_MARK)}));
  } catch {
    console.log('stub: registry lacks memos.json; run elvaria migrate');
    process.exit(7);
  }
}
if (command === 'init') {
  mkdirSync(kingdom, { recursive: true });
  const tribes = [{ id: 'claude', enabled: true }, { id: 'gemini', enabled: true }, { id: 'codex', enabled: false }];
  writeFileSync(path.join(kingdom, 'kingdom.json'), JSON.stringify({ tribes }));
}
if (command === 'territory add') mkdirSync(path.join(kingdom, 'territories', 'land'), { recursive: true });
if (command === 'run') {
  if (behavior.run === 'exit') process.exit(4);
  mkdirSync(path.join(kingdom, 'events'), { recursive: true });
  const line = JSON.stringify({ v: 1, type: behavior.run ?? 'verdict.pass' });
  writeFileSync(path.join(kingdom, 'events', '2026-11-12.jsonl'), '{"torn\\n' + line + '\\n');
  setInterval(() => undefined, 1000);
}
`;

/** Where the stub pnpm's outward link leads: a folder beside the kingdom, `<kingdom>/../outside store ạ`. */
export const OUTSIDE_STORE = 'outside store ạ';

/**
 * pnpm in a build: `install` leaves a store-like folder and a link into it, as pnpm's junctions do, a path past 260
 * characters (git for Windows does not delete those), and a link out of the build into OUTSIDE_STORE beside the
 * kingdom (pnpm's global virtual store would make such links): removing the build must not follow it.
 */
const STUB_PNPM = `import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
if (process.env.HUSKY !== '0') process.exit(9);
if (args[0] === 'install') {
  const real = path.join('node_modules', '.pnpm', 'pkg');
  mkdirSync(real, { recursive: true });
  writeFileSync(path.join(real, 'index.js'), '');
  symlinkSync(path.resolve(real), path.join('node_modules', 'pkg'), 'junction');
  const deep = path.resolve('node_modules', '.pnpm', 'a'.repeat(120), 'node_modules', 'b'.repeat(80));
  mkdirSync(deep, { recursive: true });
  writeFileSync(path.join(deep, 'index.js'), '');
  const store = path.resolve('..', '..', '..', ${JSON.stringify(OUTSIDE_STORE)});
  mkdirSync(store, { recursive: true });
  writeFileSync(path.join(store, 'keep.txt'), 'kept');
  symlinkSync(store, path.join('node_modules', 'outside'), 'junction');
}
if (args.includes('build')) {
  mkdirSync(path.join('packages', 'hooks', 'dist'), { recursive: true });
  writeFileSync(path.join('packages', 'hooks', 'dist', 'elvaria-hook.js'), '');
}
`;

/** A pnpm that does what STUB_PNPM does, run with Node. */
export async function stubPnpm(dir: string): Promise<Launch> {
  const script = path.join(dir, 'stub pnpm.mjs');
  await writeFile(script, STUB_PNPM);
  return { file: process.execPath, args: [script] };
}

export interface SourceRepo {
  readonly repo: string;
  /** Commits the stub with this behavior; returns the commit id. */
  commit(behavior: Behavior, message?: string): Promise<string>;
}

/** A repo builds are made from: its `main` holds the stub CLI, a node_modules ignore, and a behavior per commit. */
export async function sourceRepo(dir: string): Promise<SourceRepo> {
  const repo = path.join(dir, 'elvaria source');
  await mkdir(path.join(repo, 'apps', 'cli', 'src'), { recursive: true });
  await writeFile(path.join(repo, 'apps', 'cli', 'src', 'cli.ts'), STUB_CLI);
  await writeFile(path.join(repo, '.gitignore'), 'node_modules/\npackages/hooks/dist/\n');
  git(repo, 'init', '-q', '-b', 'main');
  let count = 0;
  return {
    repo,
    commit: async (behavior, message) => {
      count += 1;
      await writeFile(path.join(repo, 'behavior.json'), JSON.stringify(behavior));
      git(repo, '-c', 'core.autocrlf=false', 'add', '--all');
      git(repo, 'commit', '-q', '--allow-empty', '-m', message ?? `build ${String(count)}`);
      return git(repo, 'rev-parse', 'HEAD').trim();
    },
  };
}

/** A build put in place by hand (no git): the stub CLI and its behavior under `<kingdom>/.builds/<sha>/`. */
export async function placeBuild(kingdom: string, sha: string, behavior: Behavior): Promise<string> {
  const build = path.join(kingdom, '.builds', sha);
  await mkdir(path.join(build, 'apps', 'cli', 'src'), { recursive: true });
  await writeFile(path.join(build, 'apps', 'cli', 'src', 'cli.ts'), STUB_CLI);
  await writeFile(path.join(build, 'behavior.json'), JSON.stringify(behavior));
  return build;
}

export async function writePin(
  kingdom: string,
  current: string,
  previous: string | null = null,
): Promise<void> {
  await mkdir(path.join(kingdom, '.state'), { recursive: true });
  const pointer = { version: 1, current, previous, switched_at: '2026-11-12T15:00:00+07:00' };
  await writeFile(path.join(kingdom, '.state', 'build.json'), JSON.stringify(pointer));
}

export async function readPin(kingdom: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(kingdom, '.state', 'build.json'), 'utf8'));
}

export async function calls(record: string): Promise<Call[]> {
  const text = await readFile(record, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Call);
}

/**
 * A folder as the stub reports it (`root`, `cwd`, the mark its migrate writes): Node gives the stub real paths, and on
 * macOS the temp folder sits under `/var`, a link to `/private/var` (CI run 43192167201). The JS `realpathSync`
 * follows links only; its `.native` form would also expand Windows 8.3 names such as the CI runner's `RUNNER~1`,
 * which the stub does not see.
 */
export function real(folder: string): string {
  return realpathSync(folder);
}

export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);
