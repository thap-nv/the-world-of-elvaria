// The Antigravity CLI adapter (`antigravity`, the Gemini tribe's default runner; implementation-plan §3.7,
// ADR 0006, 0018). It turns a SpawnRequest into agy's argv, env and per-run files, and agy's stream into
// signals and a RunResult; everything else (prompt, policy, plot, checks) is runner-core's.
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  NOTE_PREFIX,
  STDERR_FILE,
  contextEnv,
  openRunLog,
  openRunOutput,
  runContextOf,
  runToEnd,
  secretValuesOf,
} from '@elvaria/runner-core';
import type {
  AdapterTool,
  AgentRunner,
  ProbeResult,
  RunningSession,
  SpawnRequest,
  ToolInfo,
} from '@elvaria/runner-core';

import { hookPlanOf, hooksProblem } from './hook-files.ts';
import { ANTIGRAVITY_MODELS } from './models.ts';
import { commandLineProblem, programOf } from './launch.ts';
import { removeRunFiles, writeRunFiles } from './run-files.ts';
import { startSession } from './session.ts';
import { probeOf, usageBuckets, windowsOf } from './usage.ts';
import type { HookPlan } from './hook-files.ts';
import type { Launch } from './launch.ts';
import type { RunFiles } from './run-files.ts';

export const ANTIGRAVITY_ADAPTER = 'antigravity';

/**
 * agy 1.5.2 (spike P1-12a, this task): resume is `--conversation <id>` under `-p`, checked on a real machine;
 * no compaction event; sub-agents run uncapped and unkillable, so the hook denies them (ADR 0017).
 */
export const ANTIGRAVITY_CAPABILITIES: AgentRunner['capabilities'] = {
  headless: true,
  context_file: true,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: true,
  compact: false,
  subagent: false,
  // The owner's Google sign-in; agy has no API-key mode (P1-19).
  auth: ['login'],
  // `run_command` runs through powershell.exe on Windows (spike P1-12a §1 row 16; P1-35: `pnpm.ps1` under the
  // Execution Policy). Not measured on macOS or Linux, so not declared there: the prompt then names no shell (P1-40).
  shell: { win32: 'Windows PowerShell (powershell.exe)' },
  // No tool searches files under `-p` (spike P1-12a, the tools a model reported): a class with Glob or Grep gets
  // runner-core's `git grep` and `git ls-files` instead, as `command(...)` rules (settings.ts, P1-53).
  search: false,
  // Gemini, Claude and GPT models under their makers' slugs (PS-23): the family of each, for the separation of duties.
  models: ANTIGRAVITY_MODELS,
};

/**
 * agy for `elvaria doctor` (PS-23): on PATH only; the owner acknowledges Google's terms first, since Antigravity is not
 * supported on consumer plans when wrapped (ADR 0018); the fake CLI `elvaria upgrade` tries a build with.
 */
export const ANTIGRAVITY_TOOL: AdapterTool = {
  program: 'agy',
  terms: true,
  fake_cli: 'fixtures/fake-agy.mjs',
};

export interface AntigravityOptions {
  readonly tribe: AgentRunner['tribe'];
  /** How to start agy: `{command: tribes[].tool.path, args: []}`, or node and a script for a fake CLI. */
  readonly launch: Launch;
  /** `hookCommand()` of @elvaria/hooks, which apps/cli hands over (an adapter may not import it, §1.3). */
  readonly hook: Launch;
  /** `tribes[].tool.terms_acknowledged_at`: without it the tribe does not run (ADR 0018). */
  readonly terms_acknowledged_at: string | undefined;
  /** The minimal env (§3.9) for the calls outside a session: `--version`, `models`, `/usage`. */
  readonly env: Readonly<Record<string, string>>;
  /** `tribes[].pools` that are enabled; the probe watches these. Default: gemini_models. */
  readonly pools?: readonly string[];
  /** How long a call outside a session may take; 30 s by default (`/usage` takes ~3 s). */
  readonly timeout_ms?: number;
  /** Whose command-line limit applies (launch.ts); this machine's by default, another in the specs. */
  readonly platform?: NodeJS.Platform;
}

/** The value `1` does not turn the updater off; `true` does (spike §2.1). */
export const NO_AUTO_UPDATE = { AGY_CLI_DISABLE_AUTO_UPDATE: 'true' } as const;
const DEFAULT_TIMEOUT_MS = 30_000;
const TERMS =
  'the owner has not acknowledged the Antigravity terms (ADR 0018): elvaria doctor --acknowledge-terms';

/**
 * agy's env: the given one without git's variables (§6), the updater off, and Elvaria's Node first on PATH for
 * the hook's bare `node`. `extra` (the session context as `ELVARIA_*`) goes over the given env.
 */
export function agyEnv(
  env: Readonly<Record<string, string>>,
  nodeDir: string | undefined,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const base = Object.entries(env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'));
  const out: Record<string, string> = { ...Object.fromEntries(base), ...extra, ...NO_AUTO_UPDATE };
  if (nodeDir === undefined) return out;
  // Windows keeps `Path`; adding `PATH` beside it would give the child two.
  const key = Object.keys(out).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const current = out[key];
  out[key] = current === undefined || current === '' ? nodeDir : `${nodeDir}${path.delimiter}${current}`;
  return out;
}

/** agy's argv for one session (§3.7). No `--effort`: the model slug carries it, and both conflict (spike §1 #14). */
export function sessionArgs(req: SpawnRequest, files: RunFiles): string[] {
  const minutes = Math.max(1, Math.ceil(req.budget.max_minutes));
  return [
    ...['-p', req.prompt.user, '--output-format', 'stream-json', '--model', req.character.model],
    ...['--settings', files.settings, '--print-timeout', `${minutes}m`, '--log-file', files.log],
    ...(files.schema === undefined ? [] : ['--json-schema', files.schema]),
    ...(req.resume === undefined ? [] : ['--conversation', req.resume.session_id]),
  ];
}

/** `agy --version` prints `1.5.2`; read on every spawn, since the extension swaps the binary in place. */
const versionOf = (stdout: string): string | undefined => /\d+\.\d+\.\d+\S*/.exec(stdout)?.[0];

/**
 * The plot without Elvaria's files (P1-23). A file that will not go (a Windows lock past the retries) costs the
 * session nothing: the run folder's stderr.log says so, for the owner whose check then fails on it.
 */
async function clearPlot(req: SpawnRequest): Promise<void> {
  try {
    await removeRunFiles(req.cwd);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    const note = `${NOTE_PREFIX}the hook files stay in the plot: ${why}\n`;
    await appendFile(path.join(req.run_dir, STDERR_FILE), note, 'utf8').catch(() => undefined);
  }
}

/** The session, whose end (wait, kill) settles only once its files left the plot. */
function clearingOnEnd(session: RunningSession, req: SpawnRequest): RunningSession {
  const result = session.wait().then(async (end) => {
    await clearPlot(req);
    return end;
  });
  return {
    ...session,
    wait: () => result,
    kill: async (reason) => {
      await session.kill(reason);
      await result;
    },
  };
}

async function spawnAgy(req: SpawnRequest, options: AntigravityOptions, plan: HookPlan) {
  if (options.terms_acknowledged_at === undefined) throw new Error(TERMS);
  // The same context as the Claude adapter: kingdom, attempt and zone from env, character, role, model from
  // the request (runner-core's runContextOf), for policy.json, the hook's env and the lines the runner writes.
  const ctx = runContextOf(req);
  const env = agyEnv(req.env, plan.node_dir, contextEnv(ctx));
  const call = { cwd: req.cwd, env, timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS };
  const version = versionOf((await runToEnd(programOf(options.launch), ['--version'], call)).stdout);
  try {
    return clearingOnEnd(await startAgy(req, options, plan, { ctx, env, call, version }), req);
  } catch (error) {
    // A session that never started leaves no file behind either.
    await clearPlot(req);
    throw error;
  }
}

interface Prepared {
  readonly ctx: ReturnType<typeof runContextOf>;
  readonly env: Record<string, string>;
  readonly call: { readonly cwd: string; readonly env: Record<string, string>; readonly timeout_ms: number };
  readonly version: string | undefined;
}

async function startAgy(req: SpawnRequest, options: AntigravityOptions, plan: HookPlan, prepared: Prepared) {
  const { ctx, env, call, version } = prepared;
  const files = await writeRunFiles(req, ctx, plan);
  const args = sessionArgs(req, files);
  // A prompt Windows cannot pass to agy is refused before any mana is spent, with the reason (P1-15).
  const tooLong = commandLineProblem(options.launch, args, options.platform ?? process.platform);
  if (tooLong !== undefined) throw new Error(tooLong);
  // The run folder belongs to the attempt: its version is recorded there (quest attempts have no such field).
  await writeFile(path.join(req.run_dir, 'agy-version.txt'), `${version ?? 'unknown'}\n`, 'utf8');
  // A hooks.json agy does not load is silent but for one log line, and without the hook every unlisted tool
  // ends the run (spike §1 #18): check before the session burns mana.
  const listed = await runToEnd(programOf(options.launch), ['-p', '/hooks', '--output-format', 'json'], call);
  const problem = hooksProblem(listed.stdout, files.hooks);
  if (problem !== undefined) throw new Error(problem);
  // The session's secret values are masked before the patterns in every line the runner writes (§3.9).
  const known = secretValuesOf(req);
  return startSession({
    launch: options.launch,
    args,
    cwd: req.cwd,
    env,
    max_turns: req.budget.max_turns,
    handover: req.handover,
    log: openRunLog(ctx, { known }),
    output: openRunOutput(req.run_dir, known),
  });
}

async function probe(options: AntigravityOptions): Promise<ProbeResult> {
  const call = { env: agyEnv(options.env, undefined), timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS };
  const ran = await runToEnd(programOf(options.launch), ['-p', '/usage', '--output-format', 'json'], call);
  const buckets = ran.code === 0 ? usageBuckets(ran.stdout) : undefined;
  if (buckets === undefined) {
    return { status: 'error', detail: `agy -p /usage: exit ${String(ran.code)} ${ran.stderr.trim()}`.trim() };
  }
  // /usage costs no mana, so `ping: false` changes nothing here; the windows feed the mana gauge (P1-05).
  const windows = windowsOf(buckets);
  const answer = probeOf(buckets, options.pools ?? ['gemini_models']);
  return windows.length === 0 ? answer : { ...answer, windows };
}

/** Version, sign-in (`agy models` needs both login and network, 0 tokens) and the terms (ADR 0018). */
async function doctor(options: AntigravityOptions): Promise<ToolInfo> {
  const call = { env: agyEnv(options.env, undefined), timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS };
  const version = versionOf((await runToEnd(programOf(options.launch), ['--version'], call)).stdout);
  const models = await runToEnd(programOf(options.launch), ['--output-format', 'json', 'models'], call);
  const signedIn = models.code === 0 && /"models"\s*:\s*\[\s*\{/.test(models.stdout);
  const problems = [
    ...(signedIn ? [] : [`agy models failed (exit ${String(models.code)}): not signed in, or offline`]),
    ...(options.terms_acknowledged_at === undefined ? [TERMS] : []),
  ];
  return {
    path: options.launch.command,
    version: version ?? 'unknown',
    auth_ok: problems.length === 0,
    ...(problems.length === 0 ? {} : { detail: problems.join('; ') }),
  };
}

export function createAntigravityRunner(options: AntigravityOptions): AgentRunner {
  const plan = hookPlanOf(options.hook);
  return {
    tribe: options.tribe,
    adapter: ANTIGRAVITY_ADAPTER,
    capabilities: ANTIGRAVITY_CAPABILITIES,
    spawn: (req) => spawnAgy(req, options, plan),
    probe: () => probe(options),
    doctor: () => doctor(options),
  };
}
