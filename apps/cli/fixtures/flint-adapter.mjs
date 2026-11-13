// An owner adapter file for "flint", a made-up CLI with hooks of its own (implementation-plan §3.14, PS-23): the
// fourth tribe that needs no change to Elvaria's code. It exports createAdapter(kit) and imports nothing. flint runs
// several makers' models under names of its own, so it declares them with their families (`capabilities.models`);
// its hooks speak a payload of their own, so it describes them to Elvaria's hook in policy.json (`dialect`) and gets
// the tool gate and the events without a branch in @elvaria/hooks. docs/guides/adding-a-tribe.md walks through it.

const CAPABILITIES = Object.freeze({
  headless: true,
  context_file: false,
  events: true,
  tool_gate: true,
  usage: true,
  structured_output: true,
  resume: false,
  compact: false,
  subagent: false,
  auth: ['login'],
  // `swift` is an Anthropic model and `breeze` a Google one under flint's own names; `auto` lets flint pick, so its
  // family is unknown and it never counts as another family than anyone's.
  models: [
    { id: 'swift', family: 'claude', starting_level: 4 },
    { id: 'swift-max', family: 'claude', starting_level: 5 },
    { id: 'breeze', family: 'gemini', starting_level: 3 },
    { id: 'auto' },
  ],
});

/** How Elvaria's hook reads flint's payload and writes flint's answers (packages/hooks/src/neutral/dialect.ts). */
const DIALECT = Object.freeze({
  version: 1,
  event: 'kind',
  events: { session_start: 'begin', pre_tool: 'before_action', post_tool: 'after_action', stop: 'finish' },
  session: 'thread',
  model: 'engine',
  cwd: 'dir',
  tool_name: 'action.name',
  tool_input: 'action.params',
  exit: 'status',
  tools: {
    shell: { kind: 'bash', grants: ['Bash'], command: 'line' },
    open: { kind: 'read', grants: ['Read'], paths: ['file'] },
    save: { kind: 'write', grants: ['Edit', 'Write'], paths: ['file'] },
    'delegate*': { kind: 'other', refuse: 'subagent' },
    ask_human: { kind: 'other', refuse: 'ask' },
  },
  answers: {
    deny: { verdict: 'refuse', why: '{reason}' },
    stop: { verdict: 'again', why: '{reason}' },
    pass: { verdict: 'go' },
  },
});
const HOOK_EVENTS = Object.values(DIALECT.events);
const SHORT_CALL_MS = 10_000;

const parse = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/** How to start flint: a Node script, so with the Node running Elvaria, as an npm shim would. */
async function launch(kit) {
  const file = kit.tool_path;
  if (file === undefined)
    throw new Error(`tribe ${kit.tribe.id}: flint is not pinned (elvaria doctor --tool)`);
  const started = file.endsWith('.mjs') ? { file: kit.node_path, args: [file] } : await kit.launchOf(file);
  if (started === undefined) throw new Error(`tribe ${kit.tribe.id}: ${file} cannot start without a shell`);
  return started;
}

/**
 * The run's files: the prompt, the schema of a structured answer, the policy with the dialect, and flint's hooks:
 * Elvaria's hook for each event, the pre-tool one with `--event` so an unreadable call is still refused.
 */
async function argsOf(kit, req) {
  const io = kit.session;
  const policy = await io.writePolicyFile(req.run_dir, io.runContextOf(req), req.permissions, {
    dialect: DIALECT,
  });
  const hook = kit.hookCommand(policy);
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((event) => [
      event,
      {
        command: hook.command,
        args: event === DIALECT.events.pre_tool ? [...hook.args, '--event', event] : hook.args,
      },
    ]),
  );
  const prompt = await io.writeRunFile(req.run_dir, 'prompt.json', JSON.stringify(req.prompt));
  const hooksFile = await io.writeRunFile(req.run_dir, 'flint-hooks.json', JSON.stringify(hooks));
  const args = ['run', '--prompt', prompt, '--model', req.character.model, '--hooks', hooksFile];
  if (req.structured === undefined) return args;
  const schema = await io.writeRunFile(req.run_dir, 'schema.json', JSON.stringify(req.structured));
  return [...args, '--json-schema', schema];
}

/** What one stdout line means for the session; the hook writes the start and the tool calls. */
function onLine(state, line) {
  const message = parse(line);
  if (message === undefined) return;
  if (message.type === 'start') state.name(message.session);
  else if (message.type === 'text') state.channel.push({ kind: 'text', text: message.text });
  else if (message.type === 'usage') {
    state.tokens = message.tokens;
    state.channel.push({ kind: 'usage', tokens: message.tokens });
  } else if (message.type === 'refused') {
    state.denials.push({ tool: message.tool, detail: message.detail });
    state.channel.push({ kind: 'tool_blocked', tool: message.tool, reason: message.why });
  } else if (message.type === 'result') state.structured = message.structured;
  else if (message.type === 'error' && message.rate_limited === true) {
    state.rate_limited = true;
    state.channel.push({ kind: 'rate_limit', detail: message.detail, resets_at: message.resets_at });
  }
}

function openState(kit, req) {
  const io = kit.session;
  const known = io.secretValuesOf(req);
  const state = {
    channel: io.createSignalChannel(),
    log: io.openRunLog(io.runContextOf(req), { known }),
    output: io.openRunOutput(req.run_dir, known),
    begun: Date.now(),
    tokens: 0,
    denials: [],
    rate_limited: false,
    killed: false,
    over: false,
  };
  state.id = new Promise((resolve) => {
    state.name = (session) => {
      if (state.session !== undefined) return;
      state.session = session;
      resolve(session);
    };
  });
  return state;
}

/** The end of the session is the adapter's line, as for every CLI: only the stream knows how it ended (§3.10). */
async function resultOf(kit, state, req, exit) {
  const session = state.session ?? `flint-unstarted-${state.pid}`;
  state.name(session);
  const outcome = state.killed ? 'killed' : exit.code === 0 && !state.rate_limited ? 'completed' : 'error';
  const usage = { tokens: state.tokens };
  const end = { type: 'agent.session.end', data: { outcome, usage } };
  (await state.log.append([end], session)).forEach(state.output.note);
  state.channel.close();
  await state.output.close();
  const question = await kit.session.readQuestion(req.handover).catch(() => undefined);
  return {
    outcome,
    exit_code: state.killed ? null : exit.code,
    usage,
    ...(state.structured === undefined ? {} : { structured: state.structured }),
    session_id: session,
    duration_ms: Date.now() - state.begun,
    permission_denials: state.denials,
    rate_limited: state.rate_limited,
    ...(question === undefined ? {} : { question }),
  };
}

async function spawn(kit, req) {
  const state = openState(kit, req);
  const env = { ...req.env, ...kit.session.contextEnv(kit.session.runContextOf(req)) };
  const options = { cwd: req.cwd, env, onStderr: (chunk) => state.output.stderr(chunk) };
  const child = kit.process.startChild(await launch(kit), await argsOf(kit, req), options, (line) => {
    state.output.stdout(line);
    onLine(state, line);
  });
  state.pid = child.pid;
  const result = child.exit.then((exit) => {
    state.over = true;
    return resultOf(kit, state, req, exit);
  });
  const kill = async (reason) => {
    if (!state.over && !state.killed) {
      state.killed = true;
      state.output.note(`killed: ${reason}`);
      child.kill();
    }
    await result;
  };
  return { session_id: state.id, pid: child.pid, signals: state.channel.iterable, wait: () => result, kill };
}

async function probe(kit) {
  const run = await kit.process.runToEnd(await launch(kit), ['ping'], {
    env: kit.env,
    timeout_ms: SHORT_CALL_MS,
  });
  const message = parse(run.stdout.split('\n').at(-1) ?? '');
  if (message?.type === 'pong') return { status: 'ok' };
  if (message?.rate_limited === true) return { status: 'rate_limited', detail: message.detail };
  return { status: 'error', detail: run.stderr.trim() || `flint ping exited ${String(run.code)}` };
}

async function doctor(kit) {
  const run = await kit.process.runToEnd(await launch(kit), ['--version'], {
    env: kit.env,
    timeout_ms: SHORT_CALL_MS,
  });
  const version = run.stdout.trim().replace(/^flint\s+/, '');
  return { path: kit.tool_path, version, auth_ok: run.code === 0 && version !== '' };
}

export function createAdapter(kit) {
  return {
    tribe: kit.tribe.id,
    adapter: kit.tribe.adapter,
    capabilities: CAPABILITIES,
    spawn: (req) => spawn(kit, req),
    probe: () => probe(kit),
    doctor: () => doctor(kit),
  };
}
