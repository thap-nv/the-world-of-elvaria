// The Codex CLI adapter (`codex_cli`, the third tribe; implementation-plan §3.7, §3.14, ADR 0006, 0021; spike
// Codex 2026-11-12). It turns a SpawnRequest into Codex's argv, env, AGENTS.override.md and `-c` hooks, and Codex's
// stream into signals and a RunResult; everything else (prompt, policy, plot, checks) is runner-core's.
import process from 'node:process';

import {
  childEnvOf,
  contextEnv,
  programOf,
  runContextOf,
  startLineSession,
  withPlotFiles,
} from '@elvaria/runner-core';
import type {
  AdapterTool,
  AgentRunner,
  ProbeResult,
  RunningSession,
  SpawnRequest,
  ToolInfo,
} from '@elvaria/runner-core';

import { homeEnv } from './account.ts';
import { askAppServer } from './app-server.ts';
import { hooksCheckArgs, sessionArgs } from './args.ts';
import { doctorCodex } from './doctor.ts';
import { hooksProblem } from './hooks.ts';
import { locateCodex } from './locate.ts';
import { CODEX_MODELS } from './models.ts';
import { codexEnding } from './outcome.ts';
import { removeRunFiles, writeRunFiles } from './run-files.ts';
import { createStreamReader } from './stream.ts';
import { probeOf } from './usage.ts';
import type { CommandLaunch } from '@elvaria/runner-core';

export const CODEX_ADAPTER = 'codex_cli';

/**
 * Codex CLI 0.167.0-alpha.4.1 (spike §5): hooks give the tool gate and the events, `--output-schema` the structured
 * output, `exec resume` the resume; compaction not tried; sub-agents cannot be turned off, so the hook refuses them.
 */
export const CODEX_CAPABILITIES: AgentRunner['capabilities'] = {
  headless: true,
  context_file: true,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: true,
  compact: false,
  subagent: false,
  // The owner's ChatGPT sign-in; CODEX_API_KEY was not tried (spike §1.2).
  auth: ['login'],
  // Every process of the tribe runs with CODEX_HOME = tool.config_dir when it names one (./account.ts, PS-27c): a
  // second ChatGPT account is a second tribe.
  config_dir: true,
  // The shell tool runs `powershell.exe -Command` on Windows (spike §1.8); macOS and Linux not measured.
  shell: { win32: 'Windows PowerShell (powershell.exe)' },
  // No tool of its own reads or searches files (spike §1.7): a class with Glob or Grep gets git grep and git ls-files.
  search: false,
  // No tool reads a file either (spike §1.7): the prompt says to read with the shell, or `git grep` without one (PS-23).
  read: false,
  models: CODEX_MODELS,
  // view_image read a PNG and the model saw it (vision spike 2026-11-17, Windows). It reads any file on the disk, its
  // sandbox aside, so only Elvaria's hook keeps a judge to the screens of its review (policy `images`, owner's (Q3)):
  // declared because no session of this runner starts without that hook (hooksProblem, before every session).
  vision: true,
};

/**
 * Codex for `elvaria doctor` (PS-23): `codex` on PATH, else npm's folder or the `openai.chatgpt` extension's binary
 * (P1-12d); the fake CLI `elvaria upgrade` tries a build with.
 */
export const CODEX_TOOL: AdapterTool = {
  program: 'codex',
  locate: locateCodex,
  fake_cli: 'fixtures/fake-codex.mjs',
};

export interface CodexOptions {
  readonly tribe: AgentRunner['tribe'];
  /** How to start Codex: `{command: tribes[].tool.path, args: []}`, or node and a script for a fake CLI. */
  readonly launch: CommandLaunch;
  /** `hookCommand()` of @elvaria/hooks, which apps/cli hands over (an adapter may not import it, §1.3). */
  readonly hook: CommandLaunch;
  /** The minimal env (§3.9) for the calls outside a session: `--version`, `login status`, the app-server. */
  readonly env: Readonly<Record<string, string>>;
  /** How long a call outside a session may take; 30 s by default (the app-server answers in ~1 s). */
  readonly timeout_ms?: number;
  /** Which form of the hook command Codex runs (PowerShell on Windows); this machine's by default. */
  readonly platform?: NodeJS.Platform;
  /**
   * `tribes[].tool.config_dir` in the machine's path form (PS-27c): every call and session runs with CODEX_HOME set to
   * it, and doctor checks Codex heard it; undefined runs every one without the variable.
   */
  readonly configDir?: string | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * PowerShell's execution policy for the commands of a session, Windows only (P1-12e): inside the `mxc` sandbox
 * PowerShell cannot read the policy from the registry ("AuthorizationManager check failed"), so `pnpm`, `npm` and
 * `npx`, which resolve to their `.ps1` shims, would not start. RemoteSigned runs local scripts, not unsigned
 * downloaded ones; the variable sets the policy of that one process, nothing is written.
 */
export const SHELL_POLICY_ENV: Readonly<Record<string, string>> = {
  PSExecutionPolicyPreference: 'RemoteSigned',
};

/**
 * Codex's env: the given one without git's variables (§6), `extra` (the session context as `ELVARIA_*`) over it, and
 * CODEX_HOME last, the tribe's folder or none (./account.ts, PS-27c). `configDir` takes no default, so no call of the
 * tribe can forget it.
 */
export function codexEnv(
  env: Readonly<Record<string, string>>,
  configDir: string | undefined,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return homeEnv({ ...childEnvOf(env), ...extra }, configDir);
}

/** AGENTS.override.md goes when the session ends or never starts; one that will not go costs it nothing but a note. */
const PLOT_FILES = { remove: removeRunFiles, stay: 'AGENTS.override.md stays' };

async function startCodex(req: SpawnRequest, options: CodexOptions): Promise<RunningSession> {
  const ctx = runContextOf(req);
  const windows = (options.platform ?? process.platform) === 'win32';
  // The tribe's home wins over any CODEX_HOME in req.env, a secret named so included (PS-27c).
  const env = codexEnv(req.env, options.configDir, {
    ...(windows ? SHELL_POLICY_ENV : {}),
    ...contextEnv(ctx),
  });
  const files = await writeRunFiles(req, ctx, windows);
  // The trust bypass runs every hook Codex has enabled: first make sure they are Elvaria's own (0 mana).
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const listed = await askAppServer(
    options.launch,
    hooksCheckArgs(files, options.hook),
    [{ method: 'hooks/list', params: { cwds: [req.cwd] } }],
    { env, cwd: req.cwd, timeout_ms: timeout },
  );
  if (!listed.ok) throw new Error(`the session's hooks could not be checked: ${listed.problem}`);
  const problem = hooksProblem(listed.results[0], options.hook, files.policy, windows);
  if (problem !== undefined) throw new Error(problem);
  return startLineSession({
    req,
    ctx,
    name: 'codex',
    turn: 'an action',
    program: programOf(options.launch),
    args: sessionArgs(req, files, options.hook),
    env,
    stdin: req.prompt.user,
    reader: createStreamReader(),
    ...codexEnding(req.structured !== undefined),
  });
}

const spawnCodex = (req: SpawnRequest, options: CodexOptions): Promise<RunningSession> =>
  withPlotFiles(req, PLOT_FILES, () => startCodex(req, options));

/** The account's windows, 0 mana: `ping: false` changes nothing, no model is ever called. */
async function probe(options: CodexOptions): Promise<ProbeResult> {
  const call = {
    env: codexEnv(options.env, options.configDir),
    timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS,
  };
  const read = await askAppServer(options.launch, [], [{ method: 'account/rateLimits/read' }], call);
  return read.ok ? probeOf(read.results[0]) : { status: 'error', cli_text: read.problem };
}

function doctor(options: CodexOptions): Promise<ToolInfo> {
  return doctorCodex({
    launch: options.launch,
    hook: options.hook,
    env: codexEnv(options.env, options.configDir),
    timeout_ms: options.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    configDir: options.configDir,
    platform: options.platform ?? process.platform,
  });
}

export function createCodexRunner(options: CodexOptions): AgentRunner {
  return {
    tribe: options.tribe,
    adapter: CODEX_ADAPTER,
    capabilities: CODEX_CAPABILITIES,
    spawn: (req) => spawnCodex(req, options),
    probe: () => probe(options),
    doctor: () => doctor(options),
  };
}
