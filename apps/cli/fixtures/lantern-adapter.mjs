// An owner adapter file, as an owner would drop it into `<kingdom>/adapters/lantern.mjs` (implementation-plan §3.14,
// ADR 0021): it exports createAdapter(kit) and imports nothing; everything it needs comes in the kit. It drives
// fake-lantern.mjs, a CLI with a headless mode and usage but no tool gate, no hooks, no context file and no JSON
// Schema flag, so tribeLimitsOf keeps the tribe to quests of rank F–D and the start and end of each session, and its
// judges answer in text (prompt_and_parse, P1-33). The specs of `elvaria tribe` run the conformance suite against
// it, and the Steward takes a quest round with it.

const CAPABILITIES = Object.freeze({
  headless: true,
  context_file: false,
  events: false,
  tool_gate: false,
  usage: true,
  structured_output: false,
  resume: false,
  compact: false,
  subagent: false,
  auth: ['login'],
});
const SHORT_CALL_MS = 10_000;

const parse = (line) => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/** How to start lantern: a Node script, so with the Node running Elvaria, as an npm shim would. */
async function launch(kit) {
  const file = kit.tool_path;
  if (file === undefined)
    throw new Error(`tribe ${kit.tribe.id}: lantern is not pinned (elvaria doctor --tool)`);
  const started = file.endsWith('.mjs') ? { file: kit.node_path, args: [file] } : await kit.launchOf(file);
  if (started === undefined) throw new Error(`tribe ${kit.tribe.id}: ${file} cannot start without a shell`);
  return started;
}

/** What one stdout line means for the session. */
function onLine(state, line) {
  const message = parse(line);
  if (message === undefined) return;
  if (message.type === 'start') state.name(message.session);
  else if (message.type === 'text') state.channel.push({ kind: 'text', text: message.text });
  else if (message.type === 'usage') {
    state.tokens = message.tokens;
    state.channel.push({ kind: 'usage', tokens: message.tokens });
  } else if (message.type === 'result') state.structured = message.structured;
  else if (message.type === 'error' && message.rate_limited === true) {
    state.rate_limited = true;
    state.channel.push({ kind: 'rate_limit', detail: message.detail, resets_at: message.resets_at });
  }
}

/** The prompt (and the schema of a structured answer) go to files of the run, never into argv. */
async function argsOf(kit, req) {
  const io = kit.session;
  const prompt = await io.writeRunFile(req.run_dir, 'prompt.json', JSON.stringify(req.prompt));
  const args = ['run', '--prompt', prompt, '--model', req.character.model];
  if (req.structured === undefined) return args;
  const schema = await io.writeRunFile(req.run_dir, 'schema.json', JSON.stringify(req.structured));
  return [...args, '--json-schema', schema];
}

/** One session's state; `name` records its id once, and the start line that, without events, only it writes. */
function openState(kit, req) {
  const io = kit.session;
  const known = io.secretValuesOf(req);
  const state = {
    channel: io.createSignalChannel(),
    log: io.openRunLog(io.runContextOf(req), { known }),
    output: io.openRunOutput(req.run_dir, known),
    begun: Date.now(),
    tokens: 0,
    rate_limited: false,
    killed: false,
    over: false,
    started: Promise.resolve([]),
  };
  state.id = new Promise((resolve) => {
    state.name = (session) => {
      if (state.session !== undefined) return;
      state.session = session;
      resolve(session);
      const start = { type: 'agent.session.start', data: { session, model: req.character.model } };
      state.started = state.log.append([start], session);
    };
  });
  return state;
}

async function resultOf(kit, state, req, exit) {
  const session = state.session ?? `lantern-unstarted-${state.pid}`;
  state.name(session);
  const outcome = state.killed ? 'killed' : exit.code === 0 && !state.rate_limited ? 'completed' : 'error';
  const usage = { tokens: state.tokens };
  await state.started;
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
    permission_denials: [],
    rate_limited: state.rate_limited,
    ...(question === undefined ? {} : { question }),
  };
}

async function spawn(kit, req) {
  // How to start comes before the run's files open, as in the built-in runners: a CLI not pinned throws here and
  // leaves no stdout.jsonl/stderr.log stream opening into a folder the specs remove (fix/cli-lines, (76)).
  const started = await launch(kit);
  const args = await argsOf(kit, req);
  const state = openState(kit, req);
  const options = { cwd: req.cwd, env: req.env, onStderr: (chunk) => state.output.stderr(chunk) };
  const child = kit.process.startChild(started, args, options, (line) => {
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
  if (message?.rate_limited === true)
    return { status: 'rate_limited', detail: message.detail, resets_at: message.resets_at };
  return { status: 'error', detail: run.stderr.trim() || `lantern ping exited ${String(run.code)}` };
}

async function doctor(kit) {
  const options = { env: kit.env, timeout_ms: SHORT_CALL_MS };
  const run = await kit.process.runToEnd(await launch(kit), ['--version'], options);
  const version = run.stdout.trim().replace(/^lantern\s+/, '');
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
