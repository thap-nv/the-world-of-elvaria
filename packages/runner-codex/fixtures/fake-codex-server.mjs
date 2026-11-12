// The parts of fake-codex.mjs that are not a session (spike Codex 2026-11-12 §1.11, §3.1): the `-c` hooks it was
// given, and `codex app-server` answering JSON-RPC on stdio until stdin closes: `initialize`,
// `account/rateLimits/read` from rate-limits.json (or ELVARIA_FAKE_CODEX_RATE_LIMITS), `hooks/list` built from the
// `-c` hooks, with one of the owner's added when ELVARIA_FAKE_CODEX_USER_HOOK=1.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

const FIXTURES = import.meta.dirname;
const { env } = process;

const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

/** The hooks of `-c hooks.<Event>=[{hooks=[{type="command",command="…",command_windows="…",timeout=N}]}]`. */
export function declaredHooks(configs) {
  const string = '("(?:[^"\\\\]|\\\\.)*")';
  const shape = new RegExp(
    `^hooks\\.(\\w+)=\\[\\{hooks=\\[\\{type="command",command=${string},command_windows=${string},timeout=(\\d+)\\}\\]\\}\\]$`,
  );
  return configs.flatMap((setting) => {
    const match = shape.exec(setting);
    if (match === null) return [];
    const [, event, command, commandWindows, timeout] = match;
    const parsed = { command: JSON.parse(command), command_windows: JSON.parse(commandWindows) };
    return [{ event, ...parsed, timeout: Number(timeout) }];
  });
}

/** `hooks/list` as Codex answers it (fixture hooks-list.json): the effective command of this OS. */
function hookList(configs, cwds) {
  const camel = (event) => `${event.charAt(0).toLowerCase()}${event.slice(1)}`;
  const hooks = declaredHooks(configs).map((hook, index) => ({
    key: `<session-flags>/config.toml:${hook.event}:0:0`,
    eventName: camel(hook.event),
    handlerType: 'command',
    command: process.platform === 'win32' ? hook.command_windows : hook.command,
    timeoutSec: hook.timeout,
    sourcePath: '<session-flags>/config.toml',
    source: 'sessionFlags',
    displayOrder: index,
    enabled: true,
    isManaged: false,
    currentHash: 'sha256:fake',
    trustStatus: 'untrusted',
  }));
  const user = {
    eventName: 'preToolUse',
    source: 'user',
    sourcePath: '~/.codex/hooks.json',
    command: 'echo mine',
    enabled: true,
  };
  const listed = env.ELVARIA_FAKE_CODEX_USER_HOOK === '1' ? [...hooks, user] : hooks;
  return { data: (cwds ?? [process.cwd()]).map((cwd) => ({ cwd, hooks: listed, warnings: [], errors: [] })) };
}

/** JSON-RPC on stdio until stdin closes, as `codex app-server` does; resolves with its exit code. */
export function appServer(configs) {
  const rateLimits = path.resolve(FIXTURES, env.ELVARIA_FAKE_CODEX_RATE_LIMITS ?? 'rate-limits.json');
  const answers = {
    initialize: () => ({ userAgent: 'fake-codex', codexHome: 'fake', platformFamily: process.platform }),
    'account/rateLimits/read': () => JSON.parse(readFileSync(rateLimits, 'utf8')),
    'hooks/list': (params) => hookList(configs, params?.cwds),
  };
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', (line) => {
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    const reply = answers[request.method];
    if (reply === undefined) {
      print({ id: request.id, error: { code: -32601, message: `unknown method ${request.method}` } });
    } else print({ id: request.id, result: reply(request.params) });
  });
  return new Promise((resolve) => lines.on('close', () => resolve(0)));
}
