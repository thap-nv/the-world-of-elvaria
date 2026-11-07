// `<run_dir>/settings.json`, generated for every session (implementation-plan §3.6, §3.7, ADR 0007): dontAsk with
// the allow/deny of the ToolPolicy, Elvaria's hooks in the exec form, the session env, no auto memory and no
// attribution line. Claude Code drops a malformed part of `--settings` without a word (spike P1-02), so the
// runner checks what it wrote before it spawns, and treats a session its SessionStart hook missed as broken.
import path from 'node:path';

import type { ToolPolicy } from '@elvaria/runner-core';

/** What `hookCommand(policyFile)` of @elvaria/hooks returns; apps/cli hands the function to the runner. */
export interface HookCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** The twelve events Elvaria registers (cli-facts §1.4); `CLAUDE_HOOK_EVENTS` of the hook, which we may not import. */
export const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'Notification',
] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** Seconds: the hook answers in < 100 ms (§3.6); this only bounds a stuck one. */
export const HOOK_TIMEOUT_SECONDS = 5;

/**
 * Tools whose bare allow would reach outside the plot: a bare `Read` read the main checkout's files and an
 * apprentice transcript in %TEMP% (spike P1-02). Their allow is scoped to the plot; Edit rules cover NotebookEdit.
 */
const FILE_TOOLS = ['Read', 'Edit', 'Write', 'NotebookEdit'] as const;
const IN_PLOT = './**';
/**
 * Search tools that get no allow rule at all. A bare `Glob` / `Grep` allow searched any folder and printed what it
 * found there; without one, dontAsk still lets them search the plot and refuses them outside it, and a scoped
 * `Grep(./**)` changes nothing (P1-09, a live run of 2.1.318). The tools stay in `--tools`.
 */
const SEARCH_TOOLS = ['Glob', 'Grep'] as const;

interface HookHandler {
  readonly type: 'command';
  readonly command: string;
  readonly args: readonly string[];
  readonly timeout: number;
  /** A PreToolUse hook that crashes or times out blocks the tool: closed when the laws cannot be checked. */
  readonly onFailure?: 'block';
}

export interface ClaudeSettings {
  readonly permissions: {
    readonly defaultMode: 'dontAsk';
    readonly allow: readonly string[];
    readonly deny: readonly string[];
  };
  /** Auto memory is one folder for the main checkout and every worktree; long memory is the journal (ADR 0010). */
  readonly autoMemoryEnabled: false;
  /** No Co-Authored-By trailer, no "Generated with" line, no session link (owner, §11; 2.1.318 schema). */
  readonly attribution: { readonly commit: ''; readonly pr: ''; readonly sessionUrl: false };
  readonly env: Readonly<Record<string, string>>;
  /** Keyed by HookEvent; a string key, because the check below must also read what a typo would leave out. */
  readonly hooks: Readonly<Record<string, readonly { readonly hooks: readonly HookHandler[] }[]>>;
}

/** `Read` → `Read(./**)`; any other rule as the policy wrote it. */
export const scopedRule = (rule: string): string =>
  (FILE_TOOLS as readonly string[]).includes(rule) ? `${rule}(${IN_PLOT})` : rule;

/** The allow rules of a ToolPolicy as Claude Code gets them: file tools scoped, bare search tools dropped. */
export const allowRules = (allow: readonly string[]): string[] =>
  allow.filter((rule) => !(SEARCH_TOOLS as readonly string[]).includes(rule)).map(scopedRule);

/**
 * An absolute path as a rule path: `//` + the path in the POSIX form Claude Code 2.1.318 compares rules in, where
 * `D:\k\q.md` reads `/d/k/q.md` (its own path conversion; `//etc/**` is its example of an absolute rule).
 */
export function absoluteRulePath(file: string): string {
  const drive = /^([A-Za-z]):[\\/]/.exec(file);
  const posix = drive === null ? file : `/${(drive[1] ?? '').toLowerCase()}${file.slice(2)}`;
  return `/${posix.replaceAll('\\', '/')}`;
}

/**
 * Rules for the handover letter, which lives in the kingdom (`quests/<id>/handover.md`, ADR 0010), outside the
 * plot that `./**` covers: without them the Stop gate would ask for a letter the character may not write.
 * Edit rules also cover Write (2.1.318), Write is named anyway for an older or stricter CLI.
 */
export const letterRules = (letter: string): string[] =>
  ['Read', 'Edit', 'Write'].map((tool) => `${tool}(${absoluteRulePath(letter)})`);

export function settingsOf(
  policy: ToolPolicy,
  hook: HookCommand,
  env: Readonly<Record<string, string>>,
  letter?: string,
): ClaudeSettings {
  const handler = (event: HookEvent): HookHandler => ({
    type: 'command',
    command: hook.command,
    args: hook.args,
    timeout: HOOK_TIMEOUT_SECONDS,
    ...(event === 'PreToolUse' ? { onFailure: 'block' as const } : {}),
  });
  // No matcher: the hook checks every tool (paths of Read, Grep and Glob too) and writes every agent.tool line.
  const hooks = Object.fromEntries(HOOK_EVENTS.map((event) => [event, [{ hooks: [handler(event)] }]]));
  return {
    permissions: {
      defaultMode: 'dontAsk',
      allow: [...allowRules(policy.allow), ...(letter === undefined ? [] : letterRules(letter))],
      deny: policy.deny,
    },
    autoMemoryEnabled: false,
    attribution: { commit: '', pr: '', sessionUrl: false },
    env,
    hooks,
  };
}

/** `Read`, `Bash(git push:*)`, `Agent(Explore)`, `Read(./infra/secrets/**)`. */
const RULE = /^[A-Za-z][\w-]*(?:\(.+\))?$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function handlerProblems(event: string, handler: HookHandler): string[] {
  const problems: string[] = [];
  if (!path.isAbsolute(handler.command)) problems.push(`hooks.${event}: command is not an absolute path`);
  if (!isStringList(handler.args)) problems.push(`hooks.${event}: args is not a list of strings`);
  if (!Number.isInteger(handler.timeout) || handler.timeout <= 0)
    problems.push(`hooks.${event}: bad timeout`);
  return problems;
}

/**
 * What would make Claude Code drop part of the file silently, or run a session the laws do not hold for. Empty
 * when the settings are sound.
 */
export function settingsProblems(settings: ClaudeSettings): string[] {
  const { permissions, env, hooks } = settings;
  const rules = [...permissions.allow, ...permissions.deny].filter((rule) => !RULE.test(rule));
  const names = Object.keys(env).filter((name) => !ENV_NAME.test(name) || typeof env[name] !== 'string');
  const missing = HOOK_EVENTS.filter((event) => (hooks[event]?.length ?? 0) === 0);
  const handlers = Object.entries(hooks).flatMap(([event, matchers]) =>
    matchers.flatMap(({ hooks: list }) => list.flatMap((handler) => handlerProblems(event, handler))),
  );
  return [
    ...rules.map((rule) => `permission rule ${JSON.stringify(rule)} is malformed`),
    ...names.map((name) => `env ${JSON.stringify(name)} is malformed`),
    ...missing.map((event) => `hooks.${event} is missing`),
    ...handlers,
  ];
}
