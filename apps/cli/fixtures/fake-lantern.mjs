// A stand-in for "lantern", a made-up agent CLI with no tool gate, driven by the owner adapter file next to it
// (lantern-adapter.mjs) in the specs of `elvaria tribe` and the round of one quest (implementation-plan §3.14, P1-19).
//   --version                     prints `lantern <version>` (env FAKE_LANTERN_VERSION, default 0.4.2)
//   ping                          prints {"type":"pong"}; env FAKE_LANTERN_PING=rate_limit answers as a spent account
//   run --prompt <file> --model <slug> [--json-schema <file>]
//                                 a session: plays env ELVARIA_FAKE_SCENARIO (the conformance suite's), else submit
// A session prints one JSON object per line: start {session}, text {text}, usage {tokens}, result {structured},
// error {rate_limited, detail, resets_at}. An assignee leaves its letter where the hook would ask for it,
// <ELVARIA_KINGDOM>/quests/<ELVARIA_QUEST>/handover.md; a session given a JSON Schema hands in env
// FAKE_LANTERN_STRUCTURED (default: a passing verdict), and so, as its last text, does a session whose prompt names
// a reply format instead (prompt_and_parse, P1-33). Exit codes are set, never forced: process.exit() can cut a piped
// stdout short.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const { env } = process;
const TOKENS = 900;
/** The conformance suite's FAKE_QUESTION (runner-core). */
const QUESTION = 'Should the release notes go on main or on the release branch?';
const SECTIONS = [
  'Where I am',
  'Done',
  'Not done',
  'Tried and failed',
  'Decisions taken',
  'Next step',
  'Question',
];

const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

function letter(question) {
  const body = (section) => {
    if (section === 'Question') return question ?? '';
    return section === 'Where I am' ? 'A fake lantern session.' : '-';
  };
  return `${SECTIONS.map((section) => `## ${section}\n\n${body(section)}`.trimEnd()).join('\n\n')}\n`;
}

function writeLetter(question) {
  if (env.ELVARIA_ROLE !== 'assignee' || !env.ELVARIA_KINGDOM || !env.ELVARIA_QUEST) return;
  const file = path.join(env.ELVARIA_KINGDOM, 'quests', env.ELVARIA_QUEST, 'handover.md');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, letter(question));
}

/** The prompt's system part asks for the reply as JSON in text (runner-core replyFormatBlock). */
const asksForJson = () =>
  JSON.parse(readFileSync(flag('--prompt'), 'utf8')).system?.includes('# Reply format') === true;

function finish(question) {
  writeLetter(question);
  const answer = env.FAKE_LANTERN_STRUCTURED ?? '{"result":"pass"}';
  print({ type: 'text', text: asksForJson() ? `My verdict:\n${answer}` : 'done' });
  print({ type: 'usage', tokens: TOKENS });
  if (flag('--json-schema') !== undefined) print({ type: 'result', structured: JSON.parse(answer) });
  return 0;
}

const SCENARIOS = {
  submit: () => finish(),
  // No tool gate: nothing stops the push, so the suite skips this check and the session just submits.
  forbidden_command: () => finish(),
  ask: () => finish(QUESTION),
  crash: () => {
    process.stderr.write('lantern: internal error\n');
    return 1;
  },
  rate_limit: () => {
    print({
      type: 'error',
      rate_limited: true,
      detail: 'usage limit reached',
      resets_at: '2026-11-09T12:00:00Z',
    });
    return 2;
  },
  hang: () => {
    setInterval(() => undefined, 1000);
    return undefined;
  },
};

function session() {
  const prompt = flag('--prompt');
  if (prompt === undefined || !existsSync(prompt) || flag('--model') === undefined) {
    process.stderr.write('lantern run: --prompt <file> and --model <slug> are required\n');
    return 2;
  }
  JSON.parse(readFileSync(prompt, 'utf8'));
  print({ type: 'start', session: `lantern-${randomUUID()}` });
  const play = SCENARIOS[env.ELVARIA_FAKE_SCENARIO ?? 'submit'] ?? SCENARIOS.submit;
  return play();
}

function main() {
  if (argv.includes('--version')) {
    process.stdout.write(`lantern ${env.FAKE_LANTERN_VERSION ?? '0.4.2'}\n`);
    return 0;
  }
  if (argv[0] === 'ping') {
    if (env.FAKE_LANTERN_PING === 'rate_limit') return SCENARIOS.rate_limit();
    print({ type: 'pong' });
    return 0;
  }
  if (argv[0] === 'run') return session();
  process.stderr.write(`lantern: unknown command ${argv.join(' ')}\n`);
  return 2;
}

const code = main();
if (code !== undefined) process.exitCode = code;
