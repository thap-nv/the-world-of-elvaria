// A stand-in for Codex CLI 0.167.0-alpha.4.1 in the adapter's tests (ADR 0006; spike Codex 2026-11-12). It answers
// `--version`, `login status` and `app-server` (JSON-RPC on stdio: `hooks/list` built from its own `-c hooks.*`
// flags, `account/rateLimits/read` from rate-limits.json), and runs `exec` (or `exec resume`) in one of two ways:
// - replay: env ELVARIA_FAKE_CODEX_REPLAY=<fixture>.jsonl prints that recorded stream, its sibling .stderr.txt, and
//   exits with ELVARIA_FAKE_CODEX_EXIT (default 0);
// - scenario: env ELVARIA_FAKE_SCENARIO (the conformance suite's) plays a session as Codex does (spike §1.5, §3): the
//   prompt read on stdin, the `-c` hooks run through PowerShell on Windows (`command_windows`) or sh, and skipped
//   without a word unless `--dangerously-bypass-hook-trust` is given; a refused shell call leaves only a stderr line.
// ELVARIA_FAKE_CODEX_LOG=<file> appends each call's argv, cwd, prompt length and PowerShell policy, one JSON line each.
// ELVARIA_FAKE_CODEX_LOGIN_HANGS=1 makes `login status` never answer; ELVARIA_FAKE_CODEX_LOGGED_OUT=1 refuses it.
// Exit codes are set, never forced: process.exit() can cut a piped stdout short.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { appServer, declaredHooks } from './fake-codex-server.mjs';

const FIXTURES = import.meta.dirname;
const argv = process.argv.slice(2);
const { env } = process;
const windows = process.platform === 'win32';

const flag = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const configs = argv.flatMap((arg, index) => (argv[index - 1] === '-c' ? [arg] : []));
const print = (value) =>
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
const answer = (value) => {
  print(value);
  return 0;
};
const refuse = (code, message) => {
  process.stderr.write(`${message}\n`);
  return code;
};
const log = (extra = {}) => {
  if (env.ELVARIA_FAKE_CODEX_LOG === undefined) return;
  const call = { argv, cwd: process.cwd(), ps_policy: env.PSExecutionPolicyPreference, ...extra };
  appendFileSync(env.ELVARIA_FAKE_CODEX_LOG, `${JSON.stringify(call)}\n`);
};

/** The prompt on stdin, to its end; read as a stream, since readFileSync(0) loses data on EAGAIN (hooks rules). */
async function readPrompt() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

const NEVER = [
  '--dangerously-bypass-approvals-and-sandbox',
  '--worktree',
  '--ephemeral',
  '-s',
  '-C',
  '--add-dir',
];

/** Calls that are not a scenario session; undefined when one may start. */
function before() {
  if (argv.includes('--version'))
    return answer(`codex-cli ${env.ELVARIA_FAKE_CODEX_VERSION ?? '0.167.0-alpha.4.1'}`);
  if (argv[0] === 'login' && argv[1] === 'status') {
    // A busy machine or a network that does not answer: doctor's timeout stops it (fix/busy-machine).
    if (env.ELVARIA_FAKE_CODEX_LOGIN_HANGS === '1') return 'hang';
    if (env.ELVARIA_FAKE_CODEX_LOGGED_OUT === '1') return refuse(1, 'Not logged in');
    return answer('Logged in using ChatGPT');
  }
  if (argv[0] === 'app-server') return 'server';
  if (argv[0] !== 'exec') return refuse(2, `fake codex: unknown call ${argv.join(' ')}`);
  const never = NEVER.find((name) => argv.includes(name));
  if (never !== undefined) return refuse(2, `fake codex: Elvaria never passes ${never}`);
  if (!argv.includes('--json') || flag('-m') === undefined || argv.at(-1) !== '-')
    return refuse(2, 'usage: codex exec --json -m <model> … -');
  if (env.ELVARIA_FAKE_CODEX_REPLAY === undefined) return undefined;
  const file = path.resolve(FIXTURES, env.ELVARIA_FAKE_CODEX_REPLAY);
  process.stdout.write(readFileSync(file, 'utf8'));
  const stderr = file.replace(/\.jsonl$/, '.stderr.txt');
  if (existsSync(stderr)) process.stderr.write(readFileSync(stderr, 'utf8'));
  return Number(env.ELVARIA_FAKE_CODEX_EXIT ?? 0);
}

const resumed = argv[1] === 'resume' ? argv.at(-2) : undefined;
const thread = resumed ?? randomUUID();
const trusted = argv.includes('--dangerously-bypass-hook-trust');
const run = { item: 0, tokens: 0 };
const base = (event, extra = {}) => ({
  session_id: thread,
  transcript_path: path.join('fake', 'rollout.jsonl'),
  cwd: process.cwd(),
  hook_event_name: event,
  model: flag('-m'),
  permission_mode: 'bypassPermissions',
  ...extra,
});

/** One hook call: its shell, cwd the session's, the payload on stdin, a JSON answer on stdout (spike §3.3). */
function runHook(event, payload) {
  const hook = trusted ? declaredHooks(configs).find((declared) => declared.event === event) : undefined;
  if (hook === undefined) return undefined;
  const ran = windows
    ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', hook.command_windows], {
        env,
        input: JSON.stringify(payload),
        encoding: 'utf8',
      })
    : spawnSync('/bin/sh', ['-c', hook.command], { env, input: JSON.stringify(payload), encoding: 'utf8' });
  if (ran.status !== 0 || ran.stdout.trim() === '') return undefined;
  try {
    return JSON.parse(ran.stdout);
  } catch {
    return undefined;
  }
}

const item = (type, fields, phase = 'item.completed') =>
  print({ type: phase, item: { id: `item_${run.item}`, type, ...fields } });

function say(text) {
  item('agent_message', { text });
  run.item += 1;
}

/**
 * A line the hook let through. The suite's spawn probe runs for real, but Codex 0.167's unelevated sandbox on Windows
 * runs a command and refuses the piped child it starts (`spawn EPERM`, P1-12e): there the probe's file says so.
 */
function runLine(command) {
  const unelevated = windows && configs.includes('windows.sandbox="unelevated"');
  if (!unelevated || command !== core.SPAWN_PROBE_COMMAND)
    return core.runFakeShellLine(command, process.cwd());
  writeFileSync(path.join(process.cwd(), core.SPAWN_PROBE_OUT), `${core.SPAWN_PROBE_FAILED}EPERM`);
}

/** A shell call: the hook first; a refusal leaves no item, only a line on stderr (spike §1.5). */
function shell(command) {
  const decision = runHook(
    'PreToolUse',
    base('PreToolUse', {
      turn_id: 'turn',
      tool_name: 'Bash',
      tool_input: { command },
      tool_use_id: `exec-${run.item}`,
    }),
  );
  const denied = decision?.hookSpecificOutput?.permissionDecision === 'deny';
  if (denied) {
    const reason = decision.hookSpecificOutput.permissionDecisionReason;
    process.stderr.write(
      `2026-11-12T12:00:00.000000Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: ${reason}. Command: ${command}\n`,
    );
    return;
  }
  const fields = {
    command: `powershell.exe -Command '${command}'`,
    aggregated_output: '',
    exit_code: null,
    status: 'in_progress',
  };
  item('command_execution', fields, 'item.started');
  runLine(command);
  item('command_execution', { ...fields, exit_code: 0, status: 'completed' });
  runHook(
    'PostToolUse',
    base('PostToolUse', { turn_id: 'turn', tool_name: 'Bash', tool_input: { command }, tool_response: '' }),
  );
  run.item += 1;
}

let core;
function letter(question) {
  const file = path.join(env.ELVARIA_KINGDOM, 'quests', env.ELVARIA_QUEST, 'handover.md');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, core.fakeLetter(question));
}

/** The end of a turn: Stop may ask for one more (spike §3.4), then the usage. */
function finish(question) {
  const stop = runHook(
    'Stop',
    base('Stop', { turn_id: 'turn', stop_hook_active: false, last_assistant_message: 'done' }),
  );
  if (stop?.decision === 'block') {
    letter(question);
    say('Letter updated.');
  }
  if (flag('--output-schema') !== undefined)
    say(env.ELVARIA_FAKE_CODEX_STRUCTURED ?? '{"result":"pass","notes":"Fake verdict."}');
  const usage = {
    input_tokens: 1000,
    cached_input_tokens: 800,
    cache_write_input_tokens: 0,
    output_tokens: 10,
    reasoning_output_tokens: 0,
  };
  print({ type: 'turn.completed', usage });
  return 0;
}

function fail(message) {
  print({ type: 'error', message });
  print({ type: 'turn.failed', error: { message } });
  return 1;
}

const USAGE_LIMIT =
  "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/settings/usage to purchase more credits or try again at 11:47 PM.";
const SCENARIOS = {
  submit: () => {
    say('Fake work done.');
    letter();
    return finish();
  },
  ask: () => {
    say('I need the owner.');
    letter(core.FAKE_QUESTION);
    return finish(core.FAKE_QUESTION);
  },
  forbidden_command: () => {
    shell(core.FAKE_FORBIDDEN_COMMAND);
    say('done');
    letter();
    return finish();
  },
  scratch_commit: () => {
    for (const command of core.FAKE_SCRATCH_COMMANDS) shell(command);
    say('done');
    letter();
    return finish();
  },
  // Each shell line of ELVARIA_FAKE_COMMANDS (a JSON list) once, in order.
  commands: (lines = JSON.parse(env.ELVARIA_FAKE_COMMANDS ?? '[]')) => {
    for (const command of lines) shell(command);
    say('done');
    letter();
    return finish();
  },
  // The suite's spawn probe (P1-12e).
  spawn_child: () => SCENARIOS.commands([core.SPAWN_PROBE_COMMAND]),
  crash: () => {
    say('Fake crash.');
    return fail('stream disconnected before completion: internal error');
  },
  rate_limit: () => {
    say('Fake work.');
    return fail(USAGE_LIMIT);
  },
  // Never ends: the runner kills it.
  hang: () => setInterval(() => undefined, 60_000) && undefined,
};

async function main() {
  const early = before();
  if (early === 'server') return appServer(configs);
  if (early === 'hang') return SCENARIOS.hang();
  if (early !== undefined) return early;
  const prompt = await readPrompt();
  log({ prompt_chars: prompt.length });
  if (prompt.trim() === '') return refuse(1, 'Error: no prompt on stdin');
  core = await import('@elvaria/runner-core');
  print({ type: 'thread.started', thread_id: thread });
  runHook('SessionStart', base('SessionStart', { source: resumed === undefined ? 'startup' : 'resume' }));
  print({ type: 'turn.started' });
  return (SCENARIOS[env[core.FAKE_SCENARIO_ENV]] ?? SCENARIOS.submit)();
}

const code = await main();
if (code !== undefined) process.exitCode = code;
