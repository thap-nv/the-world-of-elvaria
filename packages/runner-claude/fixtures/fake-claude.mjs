// A fake Claude Code 2.1.318 for the adapter's specs and the conformance suite (implementation-plan §3.7, §3.14).
// Like the real CLI it runs the hooks the `--settings` file declares (exec form, payload on stdin, env with
// settings.env) and honours `permissions.deny`; its stream has the shapes of the redacted real runs next to it.
//   --version | auth status --json | purge --yes <dir>   answers as the real CLI does
//   -p /usage | -p "<ping>"                              replays usage-command.jsonl | probe.jsonl
//   -p (prompt on stdin)                                 plays env ELVARIA_FAKE_SCENARIO, or replays FAKE_CLAUDE_REPLAY
// Knobs: FAKE_CLAUDE_PING=rate_limit|error, FAKE_CLAUDE_USAGE_TEXT=<text of /usage>, FAKE_CLAUDE_RECORD=<file>
// (argv, cwd, env and prompt of a session, for the specs to read), and those of fake-claude-commands.mjs and
// fake-claude-leak.mjs (the fake-only scenario `leak`).
// Lines marked "self-built" have no real fixture yet: 429 is P1-16's (spike P1-02); they follow the docs.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { COMMANDS } from './fake-claude-commands.mjs';
import { hookDenial, ruleDenial } from './fake-claude-denials.mjs';
import { leak } from './fake-claude-leak.mjs';

const FIXTURES = import.meta.dirname;
const PING = 'Reply with the single word ok.';
const env = process.env;
const out = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const flag = (argv, name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const fixture = (file) =>
  readFileSync(path.join(FIXTURES, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
const hang = () => setInterval(() => undefined, 60_000);

function runHooks(settings, event, payload) {
  const answers = [];
  for (const matcher of settings.hooks?.[event] ?? []) {
    for (const hook of matcher.hooks ?? []) {
      const ran = spawnSync(hook.command, hook.args ?? [], {
        input: JSON.stringify({ ...payload, hook_event_name: event }),
        env: { ...env, ...settings.env },
        encoding: 'utf8',
        timeout: (hook.timeout ?? 60) * 1000,
      });
      const outcome = ran.status === 0 ? 'success' : 'error';
      out({
        type: 'system',
        subtype: 'hook_response',
        hook_event: event,
        stdout: ran.stdout ?? '',
        exit_code: ran.status,
        outcome,
        session_id: payload.session_id,
      });
      answers.push(ran.stdout ?? '');
    }
  }
  return answers;
}

function usageOf(tokens) {
  return {
    input_tokens: 2,
    output_tokens: tokens,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 0,
  };
}

function speak(play, content, tokens = 40) {
  play.messages += 1;
  const message = {
    id: `msg_fake_${play.messages}`,
    model: play.model,
    role: 'assistant',
    content,
    usage: usageOf(tokens),
  };
  out({ type: 'assistant', message, parent_tool_use_id: null, session_id: play.id });
}

function finish(play, fields = {}) {
  const modelUsage = {
    [play.model]: {
      inputTokens: 2 * play.messages,
      outputTokens: 40 * play.messages,
      cacheReadInputTokens: 1000 * play.messages,
      cacheCreationInputTokens: 0,
    },
  };
  const result = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: play.messages,
    terminal_reason: 'completed',
    session_id: play.id,
    permission_denials: [],
    modelUsage,
    ...fields,
  };
  out(result);
  return result.is_error ? 1 : 0;
}

function writeLetter(play, question) {
  const { ELVARIA_KINGDOM: kingdom, ELVARIA_QUEST: quest } = env;
  if (kingdom === undefined || quest === undefined) return;
  const dir = path.join(kingdom, 'quests', quest);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'handover.md'), play.core.fakeLetter(question));
}

function work(play, question) {
  speak(play, [{ type: 'text', text: 'done' }]);
  out({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed',
      unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 1793976600 } },
    },
    session_id: play.id,
  });
  writeLetter(play, question);
  return finish(play);
}

/** One Bash call through the hooks and the deny rules, as the real CLI makes it; the denial when refused. */
function tryCommand(play, command, toolId) {
  speak(play, [{ type: 'tool_use', id: toolId, name: 'Bash', input: { command } }]);
  const answers = runHooks(play.settings, 'PreToolUse', {
    session_id: play.id,
    tool_name: 'Bash',
    tool_input: { command },
  });
  const reason = hookDenial(answers) ?? ruleDenial(play.settings, command);
  const block = {
    type: 'tool_result',
    tool_use_id: toolId,
    content: reason ?? 'Everything up-to-date',
    is_error: reason !== undefined,
  };
  const meta =
    reason === undefined ? [] : [{ id: toolId, permission_decision: { decision: 'reject', source: 'hook' } }];
  out({
    type: 'user',
    message: { role: 'user', content: [block] },
    tool_result_meta: meta,
    session_id: play.id,
  });
  return reason === undefined ? [] : [{ tool_name: 'Bash', tool_use_id: toolId, tool_input: { command } }];
}

/** `forbidden_command` tries the push; `scratch_commit` a judge's commit then push from its scratch plot (P1-20). */
function forbidden(play, commands = [play.core.FAKE_FORBIDDEN_COMMAND]) {
  const denials = commands.flatMap((command, index) => tryCommand(play, command, `toolu_fake_${index + 1}`));
  speak(play, [{ type: 'text', text: 'done' }]);
  writeLetter(play);
  return finish(play, { permission_denials: denials });
}

/** Self-built from the docs (cli-facts §1.2, spike P1-02 "429: chưa quan sát"): two retries, then the end. */
function rateLimited(play) {
  for (const attempt of [1, 2]) {
    out({
      type: 'system',
      subtype: 'api_retry',
      attempt,
      max_retries: 2,
      retry_delay_ms: 1000,
      error_status: 429,
      error: 'rate_limit',
      session_id: play.id,
    });
  }
  out({
    type: 'rate_limit_event',
    rate_limit_info: { status: 'rejected', resetsAt: 1793976600, rateLimitType: 'five_hour' },
    session_id: play.id,
  });
  return finish(play, {
    is_error: true,
    terminal_reason: 'api_error',
    api_error_status: 429,
    result: 'API Error: 429 rate_limit_error',
  });
}

const SCENARIOS = {
  leak: (play) => leak(play, { speak, runHooks, writeLetter, finish }),
  submit: (play) => work(play),
  ask: (play) => work(play, play.core.FAKE_QUESTION),
  forbidden_command: (play) => forbidden(play),
  scratch_commit: (play) => forbidden(play, play.core.FAKE_SCRATCH_COMMANDS),
  rate_limit: rateLimited,
  crash: (play) => {
    process.stderr.write('fake claude: crashed\n');
    return finish(play, {
      is_error: true,
      terminal_reason: 'api_error',
      api_error_status: 500,
      result: 'API Error: 500',
    });
  },
  hang: () => {
    hang();
    return undefined;
  },
};

/** A real run, verbatim; the hooks see its session id so the runner's check holds. Without a result it hangs. */
function replay(settings, file) {
  const lines = fixture(file);
  const parsed = lines.map((line) => JSON.parse(line));
  const id = parsed.find((line) => line.subtype === 'init')?.session_id;
  runHooks(settings, 'SessionStart', { session_id: id, source: 'startup', cwd: process.cwd() });
  lines.forEach((line) => process.stdout.write(`${line}\n`));
  const result = parsed.findLast((line) => line.type === 'result');
  if (result !== undefined) return result.is_error ? 1 : 0;
  hang();
  return undefined;
}

/** The prompt on stdin, with the real hook's fallback for a pipe left non-blocking (EAGAIN on macOS, PR #32). */
async function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch (error) {
    if (error?.code !== 'EAGAIN') throw error;
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function session(argv) {
  const prompt = await readStdin();
  if (env.FAKE_CLAUDE_RECORD !== undefined)
    writeFileSync(env.FAKE_CLAUDE_RECORD, JSON.stringify({ argv, cwd: process.cwd(), env, prompt }));
  const settings = JSON.parse(readFileSync(flag(argv, '--settings'), 'utf8'));
  if (env.FAKE_CLAUDE_REPLAY !== undefined) return replay(settings, env.FAKE_CLAUDE_REPLAY);
  const core = await import('@elvaria/runner-core');
  const play = {
    id: flag(argv, '--session-id') ?? flag(argv, '--resume'),
    model: flag(argv, '--model'),
    settings,
    core,
    messages: 0,
  };
  runHooks(settings, 'SessionStart', { session_id: play.id, source: 'startup', cwd: process.cwd() });
  const tools = (flag(argv, '--tools') ?? '').split(',').filter(Boolean);
  out({
    type: 'system',
    subtype: 'init',
    session_id: play.id,
    model: play.model,
    tools,
    permissionMode: flag(argv, '--permission-mode'),
    cwd: process.cwd(),
  });
  return SCENARIOS[env[core.FAKE_SCENARIO_ENV] ?? 'submit'](play);
}

function usage() {
  const text = env.FAKE_CLAUDE_USAGE_TEXT;
  if (text === undefined) return replay({}, 'usage-command.jsonl');
  out({ type: 'system', subtype: 'init', session_id: 'fake-usage' });
  out({ type: 'result', subtype: 'success', is_error: false, num_turns: 0, result: text, session_id: 'u' });
  return 0;
}

function ping() {
  if (env.FAKE_CLAUDE_PING === 'error') return replay({}, 'error-model-not-found.jsonl');
  if (env.FAKE_CLAUDE_PING !== 'rate_limit') return replay({}, 'probe.jsonl');
  return rateLimited({ id: 'fake-ping', model: 'claude-haiku-5-5', messages: 0 });
}

async function main(argv) {
  if (COMMANDS[argv[0]] !== undefined) return COMMANDS[argv[0]](argv);
  if (argv[0] !== '-p') return 2;
  if (argv[1] === '/usage') return usage();
  if (argv[1] === PING) return ping();
  return session(argv);
}

const code = await main(process.argv.slice(2));
if (code !== undefined) process.exitCode = code;
