// A stand-in for "flint", a made-up agent CLI with hooks of its own, driven by the owner adapter file next to it
// (flint-adapter.mjs) in the specs of the fourth tribe (implementation-plan §3.14, PS-23).
//   --version                     prints `flint <version>` (env FAKE_FLINT_VERSION, default 2.0.1)
//   ping                          prints {"type":"pong"}
//   run --prompt <file> --model <slug> --hooks <file> [--json-schema <file>]
//                                 a session: plays env ELVARIA_FAKE_SCENARIO (the conformance suite's), else submit
// The hooks file maps flint's events (begin, before_action, after_action, finish) to a command in the exec form; each
// hook gets flint's own payload on stdin, {"kind", "thread", "engine", "dir", "action": {"name", "params"}, "status"},
// and answers {"verdict": "go" | "refuse" | "again", "why"}. A refused action prints {"type": "refused", …} and does not
// run; a finish answered `again` asks for one more turn, in which the session writes its letter. Stdout is one JSON
// object per line: start, text, usage, refused, result, error. Exit codes are set, never forced.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const { env } = process;
const TOKENS = 1200;
const thread = `flint-${randomUUID()}`;

const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

let core;
let hooks = {};

/** One hook call: flint's payload on stdin, its JSON answer on stdout; a hook that says nothing lets it go. */
function hook(kind, extra = {}) {
  const command = hooks[kind];
  if (command === undefined) return undefined;
  const payload = { kind, thread, engine: flag('--model'), dir: process.cwd(), ...extra };
  const ran = spawnSync(command.command, command.args, {
    env,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  if (ran.status !== 0 || ran.stdout.trim() === '') return undefined;
  try {
    return JSON.parse(ran.stdout);
  } catch {
    return undefined;
  }
}

/** An action through the hooks: refused, or run and reported after. */
function act(name, params, run) {
  const answer = hook('before_action', { action: { name, params } });
  if (answer?.verdict === 'refuse') {
    print({ type: 'refused', tool: name, detail: params.line ?? params.file ?? name, why: answer.why });
    return false;
  }
  const status = run?.() ?? 0;
  hook('after_action', { action: { name, params }, status });
  return true;
}

const shell = (line) => act('shell', { line }, () => (core.runFakeShellLine(line, process.cwd()), 0));

function writeLetter(question) {
  if (env.ELVARIA_ROLE !== 'assignee' || !env.ELVARIA_KINGDOM || !env.ELVARIA_QUEST) return;
  const file = path.join(env.ELVARIA_KINGDOM, 'quests', env.ELVARIA_QUEST, 'handover.md');
  mkdirSync(path.dirname(file), { recursive: true });
  act('save', { file }, () => (writeFileSync(file, core.fakeLetter(question)), 0));
}

/** The end of a turn: finish may ask for one more, in which the letter is written; then the answer and usage. */
function finish(
  question,
  answer = env.FAKE_FLINT_STRUCTURED ?? '{"result":"pass","notes":"Read the diff; every check passes."}',
) {
  if (hook('finish')?.verdict === 'again') {
    writeLetter(question);
    hook('finish');
  }
  print({ type: 'text', text: 'done' });
  print({ type: 'usage', tokens: TOKENS });
  if (flag('--json-schema') !== undefined) print({ type: 'result', structured: JSON.parse(answer) });
  return 0;
}

const SCENARIOS = {
  submit: () => finish(),
  ask: () => finish(core.FAKE_QUESTION),
  forbidden_command: () => {
    shell(core.FAKE_FORBIDDEN_COMMAND);
    return finish();
  },
  scratch_commit: () => {
    for (const line of core.FAKE_SCRATCH_COMMANDS) shell(line);
    return finish();
  },
  spawn_child: () => {
    shell(core.SPAWN_PROBE_COMMAND);
    return finish();
  },
  // A judge's verdict under --json-schema (fix/codex-output-schema).
  structured: () => finish(undefined, JSON.stringify(core.FAKE_STRUCTURED_ANSWER)),
  crash: () => {
    process.stderr.write('flint: internal error\n');
    return 1;
  },
  rate_limit: () => {
    print({ type: 'error', rate_limited: true, detail: 'quota reached', resets_at: '2026-11-13T12:00:00Z' });
    return 2;
  },
  hang: () => {
    setInterval(() => undefined, 1000);
    return undefined;
  },
};

async function session() {
  const prompt = flag('--prompt');
  const hooksFile = flag('--hooks');
  if (
    prompt === undefined ||
    !existsSync(prompt) ||
    flag('--model') === undefined ||
    hooksFile === undefined
  ) {
    process.stderr.write('flint run: --prompt <file>, --model <slug> and --hooks <file> are required\n');
    return 2;
  }
  JSON.parse(readFileSync(prompt, 'utf8'));
  hooks = JSON.parse(readFileSync(hooksFile, 'utf8'));
  core = await import('@elvaria/runner-core');
  print({ type: 'start', session: thread });
  hook('begin');
  const play = SCENARIOS[env[core.FAKE_SCENARIO_ENV] ?? 'submit'] ?? SCENARIOS.submit;
  return play();
}

async function main() {
  if (argv.includes('--version')) {
    process.stdout.write(`flint ${env.FAKE_FLINT_VERSION ?? '2.0.1'}\n`);
    return 0;
  }
  if (argv[0] === 'ping') {
    print({ type: 'pong' });
    return 0;
  }
  if (argv[0] === 'run') return session();
  process.stderr.write(`flint: unknown command ${argv.join(' ')}\n`);
  return 2;
}

const code = await main();
if (code !== undefined) process.exitCode = code;
