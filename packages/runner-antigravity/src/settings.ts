// ToolPolicy (Claude Code syntax) → agy's per-run `--settings` (implementation-plan §3.7, spike P1-12a §3).
// agy rules are prefixes: `command(pnpm test)` matches `pnpm test --run`, `write_file(src/)` every file under
// src/, a path relative to the workspace. Deny blocks hard and wins over the hook; anything the allow list does
// not grant is a hard deny too, because the hook answers `deny_unless_prior_grant`.
import { toolOf } from '@elvaria/runner-core';
import type { ToolPolicy } from '@elvaria/runner-core';

import { AGENTS_DIR } from './hook-files.ts';

export interface AgySettings {
  readonly permissions: {
    readonly allow: readonly string[];
    readonly deny: readonly string[];
    /** Empty: nothing may ask under `-p`, where an unanswered question is a soft-deny that ends the run. */
    readonly ask: readonly string[];
  };
}

export const CONTEXT_FILE = 'GEMINI.md';
/** Files Elvaria generates in the plot: the character never rewrites its own fence or context. */
const GENERATED = [`write_file(${AGENTS_DIR}/)`, `write_file(${CONTEXT_FILE})`];

const WRITE_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
/** The whole workspace: reads there need no rule, writes do. */
const WORKSPACE = './';
/** Every web page, as a prefix of the URL. */
const WEB_PREFIXES = ['https://', 'http://'];

/** `Bash(pnpm test:*)` and `Bash(pnpm test)` → `pnpm test`. */
const commandOf = (rule: string): string | undefined => {
  const command = /^Bash\((.+?)(?::\*)?\)$/.exec(rule)?.[1]?.trim();
  return command === '' ? undefined : command;
};

/** The argument of a rule: `Read(./.env)` → `./.env`; undefined for a bare tool. */
const argumentOf = (rule: string): string | undefined => /^\w+\((.+)\)$/.exec(rule)?.[1];

/**
 * A Claude path glob as an agy prefix: `./infra/secrets/**` → `infra/secrets/`, `./.env.*` → `.env.`, `**` →
 * the workspace. A wildcard anywhere else cannot be a prefix: the hook's laws still guard that path.
 */
export function prefixOf(glob: string): string | undefined {
  const prefix = glob
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/(^|\/)\*\*(\/\*)?$/, '$1')
    .replace(/\*$/, '');
  if (/[*?[\]{}]/.test(prefix)) return undefined;
  return prefix === '' ? WORKSPACE : prefix;
}

function allowOf(rule: string, tools: ReadonlySet<string>): string[] {
  const tool = toolOf(rule);
  if (!tools.has(tool)) return [];
  if (tool === 'Bash') {
    const command = commandOf(rule);
    return command === undefined ? [] : [`command(${command})`];
  }
  if (WRITE_TOOLS.has(tool)) {
    const prefix = rule === tool ? WORKSPACE : prefixOf(argumentOf(rule) ?? '');
    return prefix === undefined ? [] : [`write_file(${prefix})`];
  }
  if (rule === 'WebFetch') return WEB_PREFIXES.map((url) => `read_url(${url})`);
  return [];
}

function denyOf(rule: string): string[] {
  const tool = toolOf(rule);
  const command = tool === 'Bash' ? commandOf(rule) : undefined;
  if (command !== undefined) return [`command(${command})`];
  const glob = argumentOf(rule);
  const prefix = glob === undefined ? undefined : prefixOf(glob);
  if (prefix === undefined || prefix === WORKSPACE) return [];
  if (tool === 'Read') return [`read_file(${prefix})`];
  return WRITE_TOOLS.has(tool) ? [`write_file(${prefix})`] : [];
}

/** `letter`: the assignee's `quests/<id>/handover.md` (SpawnRequest.handover), an absolute path. */
export function agySettingsOf(policy: ToolPolicy, letter?: string): AgySettings {
  const tools = new Set(policy.tools);
  const unique = (rules: string[]): string[] => [...new Set(rules)];
  // agy has no search tool (ANTIGRAVITY_CAPABILITIES.search): git's read-only search stands in for Glob and Grep, a
  // shell or not (P1-53). The prefix also matches `git grep -O<pager>`; the hook, which sees the whole line, refuses it.
  const search = (policy.search_commands ?? []).map((command) => `command(${command})`);
  // The code graph's commands the same way (PS-21): `command(graphify query)` also matches `--graph <other>`, which
  // the hook refuses; GRAPHIFY_OUT in the session's env names the quest's graph.
  const graph = (policy.graph_commands ?? []).map((command) => `command(${command})`);
  // The letter lives in the kingdom, outside the plot, where agy reads and writes nothing unless a rule says so.
  const own =
    letter === undefined
      ? []
      : [`read_file(${letter.replaceAll('\\', '/')})`, `write_file(${letter.replaceAll('\\', '/')})`];
  return {
    permissions: {
      allow: unique([...policy.allow.flatMap((rule) => allowOf(rule, tools)), ...search, ...graph, ...own]),
      deny: unique([...policy.deny.flatMap(denyOf), ...GENERATED]),
      ask: [],
    },
  };
}
