// A stand-in for Elvaria's hook in the adapter's specs, which may not import @elvaria/hooks (§1.3). It does the two
// things the runner depends on, the way the real hook does them (packages/hooks, P1-08): SessionStart writes
// `agent.session.start` to the quest's journal, and PreToolUse refuses a shell command that a law of the run's
// policy.json forbids, answering with JSON on stdout and exit 0. Run as `node fake-hook.mjs --policy <file>`.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid() {
  let time = Date.now();
  let head = '';
  for (let index = 0; index < 10; index += 1) {
    head = CROCKFORD[time % 32] + head;
    time = Math.floor(time / 32);
  }
  let tail = '';
  for (let index = 0; index < 16; index += 1) tail += CROCKFORD[Math.floor(Math.random() * 32)];
  return head + tail;
}

function policyOf(argv) {
  const index = argv.indexOf('--policy');
  if (index === -1) return {};
  return JSON.parse(readFileSync(argv[index + 1], 'utf8'));
}

function sessionStart(payload, env) {
  const { ELVARIA_KINGDOM: kingdom, ELVARIA_QUEST: quest } = env;
  if (kingdom === undefined || quest === undefined) return;
  const line = {
    v: 1,
    id: ulid(),
    ts: new Date().toISOString(),
    type: 'agent.session.start',
    actor: { kind: 'character', id: env.ELVARIA_CHARACTER },
    quest,
    ...(env.ELVARIA_ATTEMPT === undefined ? {} : { attempt: Number(env.ELVARIA_ATTEMPT) }),
    session: payload.session_id,
    data: { session: payload.session_id, model: env.ELVARIA_MODEL ?? 'unknown' },
  };
  const dir = path.join(kingdom, 'quests', quest);
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, 'journal.jsonl'), `${JSON.stringify(line)}\n`);
}

function preToolUse(payload, laws) {
  const command = payload.tool_input?.command;
  if (payload.tool_name !== 'Bash' || typeof command !== 'string') return;
  const law = (laws?.forbidden_commands ?? []).find((pattern) => new RegExp(pattern, 'i').test(command));
  if (law === undefined) return;
  const reason = `Elvaria: "${command}" is forbidden by a law of this run.`;
  const answer = {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: answer })}\n`);
}

const payload = JSON.parse(readFileSync(0, 'utf8'));
const policy = policyOf(process.argv);
if (payload.hook_event_name === 'SessionStart') sessionStart(payload, process.env);
if (payload.hook_event_name === 'PreToolUse') preToolUse(payload, policy.laws);
