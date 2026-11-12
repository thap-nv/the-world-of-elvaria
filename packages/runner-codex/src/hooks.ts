// Elvaria's hooks for one Codex session (spike Codex 2026-11-12 §3, P1-12d): given as session flags
// (`-c hooks.<Event>=…`), which Codex skips unless trusted; the owner chose to run them with
// `--dangerously-bypass-hook-trust` once `hooks/list` shows that every hook Codex would run is one of these (ADR 0021,
// amended 2026-11-12). Codex runs a hook's command through PowerShell on Windows (`command_windows`) and a POSIX shell
// elsewhere (`command`, not measured on macOS), so each argument is single-quoted for its shell.
import type { Launch } from './launch.ts';

/** The events the hook handles for Codex (packages/hooks CODEX_HOOK_EVENTS). */
export const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** A hook call takes ~70 ms; Codex's own default is 600 s, which would let a hung hook hold the session. */
export const HOOK_TIMEOUT_SECONDS = 10;
/** What tells the hook a Codex call from a Claude one: both payloads have the same shape (packages/hooks run-hook). */
export const DIALECT_ARGS = ['--dialect', 'codex'] as const;
/** How `hooks/list` names the source of hooks given with `-c` (spike §3.1). */
export const SESSION_FLAGS_SOURCE = 'sessionFlags';

/** In a POSIX shell nothing is special inside single quotes; a quote itself ends, is escaped, and opens again. */
export const posixQuote = (arg: string): string => `'${arg.replaceAll("'", String.raw`'\''`)}'`;
/** In PowerShell nothing is special inside single quotes but a quote, written twice. */
export const powershellQuote = (arg: string): string => `'${arg.replaceAll("'", "''")}'`;

export interface HookLines {
  /** POSIX form. */
  readonly command: string;
  /** PowerShell form: `&` calls the quoted program; without it PowerShell prints the string (spike §3.3). */
  readonly command_windows: string;
}

/**
 * The hook's command for `event`. PreToolUse carries `--event PreToolUse`, so a call whose payload cannot be read is
 * still denied (P1-36); the others name their event in the payload.
 */
export function hookLinesOf(hook: Launch, policyFile: string, event: HookEvent): HookLines {
  const argv = [
    hook.command,
    ...hook.args,
    '--policy',
    policyFile,
    ...DIALECT_ARGS,
    ...(event === 'PreToolUse' ? ['--event', event] : []),
  ];
  return {
    command: argv.map(posixQuote).join(' '),
    command_windows: `& ${argv.map(powershellQuote).join(' ')}`,
  };
}

/** A TOML basic string: JSON's escapes are TOML's. */
const toml = (text: string): string => JSON.stringify(text);

/** `-c hooks.<Event>=[…]` for each event: no matcher, so PreToolUse and PostToolUse see every tool. */
export function hookConfigArgs(hook: Launch, policyFile: string): string[] {
  return HOOK_EVENTS.flatMap((event) => {
    const lines = hookLinesOf(hook, policyFile, event);
    const handler = `{type="command",command=${toml(lines.command)},command_windows=${toml(lines.command_windows)},timeout=${HOOK_TIMEOUT_SECONDS}}`;
    return ['-c', `hooks.${event}=[{hooks=[${handler}]}]`];
  });
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const records = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const textAt = (value: Json, key: string): string => (typeof value[key] === 'string' ? value[key] : '');

/** `PreToolUse` → `preToolUse`, as `hooks/list` names events. */
const listedName = (event: string): string => `${event.charAt(0).toLowerCase()}${event.slice(1)}`;

/** One line per hook Codex would run that is not Elvaria's: the bypass would run it unreviewed. */
function foreignHooks(hooks: readonly Json[]): string[] {
  return hooks
    .filter((hook) => textAt(hook, 'source') !== SESSION_FLAGS_SOURCE)
    .map(
      (hook) =>
        `${textAt(hook, 'eventName')} hook from ${textAt(hook, 'source') || 'an unknown source'} (${textAt(hook, 'sourcePath')})`,
    );
}

/**
 * Why the session must not start with the trust bypass, from the answer of `hooks/list` for the plot; undefined
 * when Codex would run exactly Elvaria's hooks. `windows`: the machine runs `command_windows`, which is what
 * `hooks/list` reports there.
 */
export function hooksProblem(
  answer: unknown,
  hook: Launch,
  policyFile: string,
  windows: boolean,
): string | undefined {
  const entry = records(isRecord(answer) ? answer.data : undefined)[0];
  if (entry === undefined) return 'codex app-server listed no hooks for the plot';
  const errors = Array.isArray(entry.errors) ? entry.errors.map(String) : [];
  if (errors.length > 0) return `Codex could not load its hooks: ${errors.join('; ')}`;
  const hooks = records(entry.hooks);
  const foreign = foreignHooks(hooks);
  if (foreign.length > 0) {
    return `Codex would also run hooks that are not Elvaria's, without review: ${foreign.join(', ')}; Elvaria passes --dangerously-bypass-hook-trust only when every hook is its own (ADR 0021)`;
  }
  for (const event of HOOK_EVENTS) {
    const lines = hookLinesOf(hook, policyFile, event);
    const expected = windows ? lines.command_windows : lines.command;
    const ours = hooks.filter((listed) => textAt(listed, 'eventName') === listedName(event));
    if (ours.length !== 1 || textAt(ours[0] ?? {}, 'command') !== expected || ours[0]?.enabled !== true) {
      return `Codex does not list Elvaria's ${event} hook as given (hooks off in its features, or a changed command)`;
    }
  }
  return hooks.length === HOOK_EVENTS.length ? undefined : 'Codex lists more session hooks than Elvaria gave';
}
