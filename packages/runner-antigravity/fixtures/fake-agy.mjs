// A stand-in for Antigravity CLI 1.5.2 (`agy`) in the adapter's tests (ADR 0006, implementation-plan §3.7).
// It answers `--version`, `--output-format json models`, `-p /usage` and `-p /hooks` from the spike's fixtures,
// and runs a session in one of two ways:
// - replay: env ELVARIA_FAKE_AGY_REPLAY=<fixture>.jsonl prints that recorded stream, its sibling .stderr.txt,
//   and exits with ELVARIA_FAKE_AGY_EXIT (default 0);
// - scenario: env ELVARIA_FAKE_SCENARIO (the conformance suite's) plays a session as agy 1.5.2 does (spike
//   §3, §4): it runs the hooks of <cwd>/.agents/hooks.json through cmd /c or sh -c, applies the --settings rules
//   as prefixes, and soft-denies a tool nothing grants, which ends the run.
// ELVARIA_FAKE_AGY_LOG=<file> appends each call's argv and the env the adapter must set, one JSON line per call.
// Exit codes are set, never forced: process.exit() can cut a piped stdout short.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const FIXTURES = import.meta.dirname;
const argv = process.argv.slice(2);
const { env } = process;

const flag = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const print = (value) => {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
};
const fixture = (name) => readFileSync(path.resolve(FIXTURES, name), 'utf8').trim();
const answer = (value) => {
  print(value);
  return 0;
};
const refuse = (code, message) => {
  process.stderr.write(`${message}\n`);
  return code;
};

const pathKey = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
if (env.ELVARIA_FAKE_AGY_LOG !== undefined) {
  const call = {
    argv,
    cwd: process.cwd(),
    auto_update: env.AGY_CLI_DISABLE_AUTO_UPDATE,
    path_head: (env[pathKey] ?? '').split(path.delimiter)[0],
  };
  appendFileSync(env.ELVARIA_FAKE_AGY_LOG, `${JSON.stringify(call)}\n`);
}

/** `.agents/hooks.json` of the workspace, listed as `agy -p /hooks` lists it (fixture hooks-json.jsonl). */
function declaredHooks() {
  const file = path.join(process.cwd(), '.agents', 'hooks.json');
  if (!existsSync(file)) return [];
  return Object.entries(JSON.parse(readFileSync(file, 'utf8'))).map(([name, events]) => ({
    name,
    enabled: true,
    source: file,
    actions: Object.entries(events).flatMap(([event, handlers]) =>
      handlers.flatMap((handler) => (handler.hooks ?? [handler]).map(({ command }) => ({ event, command }))),
    ),
  }));
}

function hookList() {
  const global = env.ELVARIA_FAKE_AGY_GLOBAL_HOOK;
  const extra = global === undefined ? [] : [{ name: 'mine', enabled: true, source: global, actions: [] }];
  const hooks = [...declaredHooks(), ...extra];
  return {
    conversation_id: '',
    status: 'SUCCESS',
    response: '',
    command: { name: 'hooks', data: { hooks } },
  };
}

const prompt = flag('-p');
let settings = {};

/** Calls that are not a session, and agy's checks before one; undefined when a scenario session may start. */
function before() {
  if (argv.includes('--version')) return answer(env.ELVARIA_FAKE_AGY_VERSION ?? '1.5.2');
  if (argv.includes('models')) return answer(fixture('models-json.jsonl'));
  if (argv.some((arg) => arg.startsWith('--dangerously')))
    return refuse(2, 'fake agy: Elvaria never skips review');
  if (argv.includes('--effort')) return refuse(1, 'fake agy: a full model slug conflicts with --effort');
  if (prompt === '/usage') return answer(fixture(env.ELVARIA_FAKE_AGY_USAGE ?? 'usage-json.jsonl'));
  if (prompt === '/hooks') return answer(hookList());
  if (prompt === undefined || flag('--output-format') !== 'stream-json' || flag('--model') === undefined)
    return refuse(2, 'usage: agy -p <prompt> --output-format stream-json --model <slug>');
  try {
    settings = JSON.parse(readFileSync(flag('--settings') ?? '', 'utf8'));
  } catch (error) {
    return refuse(1, `Error: --settings: ${error.message}`);
  }
  if (env.ELVARIA_FAKE_AGY_REPLAY === undefined) return undefined;
  const file = path.resolve(FIXTURES, env.ELVARIA_FAKE_AGY_REPLAY);
  process.stdout.write(readFileSync(file, 'utf8'));
  const stderr = file.replace(/\.jsonl$/, '.stderr.txt');
  if (existsSync(stderr)) process.stderr.write(readFileSync(stderr, 'utf8'));
  return Number(env.ELVARIA_FAKE_AGY_EXIT ?? 0);
}

const early = before();
// The conformance scenarios and the letter come from runner-core, loaded only for a scenario session.
const core = early === undefined ? await import('@elvaria/runner-core') : undefined;
const conversation = flag('--conversation') ?? randomUUID();
const commands = new Map();
for (const { actions } of declaredHooks())
  for (const { event, command } of actions) if (!commands.has(event)) commands.set(event, command);
const run = { step: 0, tokens: 0, responses: [] };
const base = (extra = {}) => ({
  conversationId: conversation,
  modelName: flag('--model'),
  lastUserInput: prompt,
  workspacePaths: [process.cwd().replaceAll('\\', '/')],
  ...extra,
});
const emit = (event, body) => print({ event, ...body });
const step = (fields) =>
  emit('step_update', { step_update: { conversation_id: conversation, step_index: run.step, ...fields } });

/** One hook call, as agy makes it: a shell, cwd .agents/, the payload on stdin, a JSON answer on stdout. */
function runHook(event, payload) {
  const command = commands.get(event);
  if (command === undefined) return { declared: false };
  const windows = process.platform === 'win32';
  const shell = windows ? (env.ComSpec ?? 'cmd.exe') : '/bin/sh';
  const ran = spawnSync(shell, windows ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command], {
    cwd: path.join(process.cwd(), '.agents'),
    env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    windowsVerbatimArguments: windows,
  });
  if (ran.status !== 0) return { declared: true, failed: true };
  try {
    return { declared: true, decision: ran.stdout.trim() === '' ? undefined : JSON.parse(ran.stdout) };
  } catch {
    return { declared: true, failed: true };
  }
}

function respond(text) {
  step({ state: 'ACTIVE', step_type: 'agent_response', text_delta: text });
  run.tokens += 1000;
  const usage = {
    input_tokens: 990,
    output_tokens: 10,
    thinking_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: 1000,
  };
  step({ state: 'DONE', step_type: 'agent_response', text_delta: '\n', usage });
  run.responses.push(text);
  run.step += 1;
}

/** agy's own check of a shell line: prefix rules, deny first; a compound line never matches (spike §3). */
function ruleFor(command) {
  const matches = (rule) => {
    const prefix = /^command\((.+)\)$/.exec(rule)?.[1];
    if (prefix === undefined || /[;&|]/.test(command)) return false;
    return command === prefix || command.startsWith(`${prefix} `);
  };
  if ((settings.permissions?.deny ?? []).some(matches)) return 'deny';
  return (settings.permissions?.allow ?? []).some(matches) ? 'allow' : 'none';
}

/**
 * What becomes of a shell call (spike §4): it runs, fails with an error the model reads, or is soft-denied.
 * The decision that skips every check is left out: Elvaria's hook never gives it.
 */
function permit(command, hook) {
  if (hook.failed) return { error: 'hook failed' };
  const decision = hook.declared ? hook.decision?.decision : 'allow';
  if (decision === undefined || decision === 'deny')
    return { error: `tool call denied by pre-tool hook: ${hook.decision?.reason ?? ''}` };
  const rule = ruleFor(command);
  const refused = `permission check failed for unsandboxed "${command}": Permission denied for unsandboxed(${command})`;
  if (rule === 'deny') return { error: `${refused}. Matches user-configured deny rule.` };
  if (rule === 'allow') return { ran: true };
  return decision === 'deny_unless_prior_grant' ? { error: refused } : { soft: true };
}

/** run_command, from the hook to its result; false when it was soft-denied, which ends the run. */
function shell(command) {
  const parameters = { CommandLine: command };
  const tool = { tool_name: 'run_command', step_type: 'tool' };
  step({ state: 'ACTIVE', ...tool, tool_info: { name: 'run_command', parameters } });
  const toolCall = { name: 'run_command', args: { ...parameters, WaitMsBeforeAsync: 5000 } };
  const verdict = permit(command, runHook('PreToolUse', base({ stepIdx: run.step, toolCall })));
  if (verdict.soft) return false;
  const info = verdict.ran
    ? { output: 'Command exited with code 0.\n' }
    : { error: { type: 'TOOL_ERROR', message: verdict.error } };
  step({
    state: verdict.ran ? 'DONE' : 'ERROR',
    ...tool,
    tool_info: { name: 'run_command', parameters, ...info },
  });
  if (verdict.ran) runHook('PostToolUse', base({ stepIdx: run.step, toolCall, error: '' }));
  run.step += 1;
  return true;
}

function letter(question) {
  const file = path.join(env.ELVARIA_KINGDOM, 'quests', env.ELVARIA_QUEST, 'handover.md');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, core.fakeLetter(question));
}

/** The end of a run: Stop may ask for one more turn (spike §1 #19), then the result line. */
function finish(question) {
  const stop = runHook('Stop', base({ terminationReason: 'TERMINAL_STEP_TYPE', executionNum: 0 }));
  if (stop.decision?.decision === 'continue') {
    letter(question);
    respond('Letter updated.');
  }
  const usage = { input_tokens: run.tokens - 10, output_tokens: 10, total_tokens: run.tokens };
  const response = `${run.responses.join('\n')}\n`;
  emit('result', {
    result: { conversation_id: conversation, status: 'SUCCESS', response, num_turns: 1, usage },
  });
  return 0;
}

function failWith(error, agyError) {
  emit('result', {
    result: { conversation_id: conversation, status: 'ERROR', response: '', error, finished_reason: 'error' },
  });
  return refuse(3, `AGY_ERROR: ${JSON.stringify(agyError)}`);
}

function softDenied() {
  const denied_actions = [{ action: 'command', display_name: 'RunCommand' }];
  emit('result', {
    result: { conversation_id: conversation, status: 'SUCCESS', response: '', denied_actions },
  });
  return refuse(
    0,
    'jetski: no output produced — a tool required the "command" permission headless mode cannot ask for',
  );
}

const QUOTA = 'You have exhausted your capacity on this model.';
const SCENARIOS = {
  submit: () => {
    respond('Fake work done.');
    letter();
    return finish();
  },
  ask: () => {
    respond('I need the owner.');
    letter(core.FAKE_QUESTION);
    return finish(core.FAKE_QUESTION);
  },
  forbidden_command: () => {
    if (!shell(core.FAKE_FORBIDDEN_COMMAND)) return softDenied();
    respond('done');
    letter();
    return finish();
  },
  crash: () => {
    respond('Fake crash.');
    return failWith('internal error', { status: 'INTERNAL', retryable: false, reason: 'model_error' });
  },
  rate_limit: () => {
    respond('Fake work.');
    return failWith(QUOTA, { short_error: QUOTA, status: 'RESOURCE_EXHAUSTED', retryable: false });
  },
  // Never ends: the runner kills it.
  hang: () => setInterval(() => undefined, 60_000) && undefined,
};

function session() {
  const init = { model: flag('--model'), cwd: process.cwd(), permission_mode: 'request-review' };
  emit('init', { conversation_id: conversation, init });
  runHook('SessionStart', base());
  step({ state: 'DONE', step_type: 'user_input' });
  run.step += 1;
  return (SCENARIOS[env[core.FAKE_SCENARIO_ENV]] ?? SCENARIOS.submit)();
}

process.exitCode = early ?? session();
