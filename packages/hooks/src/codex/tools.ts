// Codex CLI tool calls in the normalised shape of `agent.tool` (implementation-plan §3.10; spike Codex 2026-11-12
// §1.7, §3.4, P1-12d). Codex hands its hooks Claude Code's payload shape, but its own tools: the shell is `Bash`
// (`exec_command`, whatever JavaScript of the `exec` tool called it), files change only through `apply_patch`, whose
// `command` is the patch text, and sub-agents are the `collaboration…` tools. There is no tool that reads or searches
// files: the shell does both.
import type { ToolCall, ToolKind } from '../claude/tools.ts';

export const CODEX_SHELL = 'Bash';
export const CODEX_PATCH = 'apply_patch';

/** The tools of a class (Claude Code names, policy `tools`) that grant each Codex tool. */
const CLASS_TOOLS: Readonly<Record<string, readonly string[]>> = {
  [CODEX_SHELL]: ['Bash'],
  [CODEX_PATCH]: ['Edit', 'Write'],
  view_image: ['Read'],
};

/** The web tools of the hosted model run on the server and never reach a hook; a local one is guarded by name. */
const WEB = /^web/i;
const WEB_TOOLS = ['WebFetch', 'WebSearch'];
/** `collaboration.spawn_agent` and its kin reach the hook as `collaborationspawn_agent` (spike §1.7). */
const SUBAGENT = /^collaboration/i;
/** Nobody answers under `codex exec`, which already refuses them (spike §1.7); the hook says what to do instead. */
const ASK = /^request_user_input/i;
/**
 * Tools no class of Elvaria grants: generated images, plugins the owner did not install, an MCP server's tools (the
 * runner starts Codex without the owner's config, so none is configured).
 */
const REFUSED = /^(?:image_gen|request_plugin_install|mcp__)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textAt = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * The files a patch adds, updates, deletes or moves to, as written (relative to the plot or absolute). A patch is
 * `*** Begin Patch`, then per file `*** Add File: <path>`, `*** Update File: <path>` (with `*** Move to: <path>`
 * when it renames) or `*** Delete File: <path>`, then `*** End Patch`.
 */
export function patchPathsOf(patch: string | undefined): string[] {
  if (patch === undefined) return [];
  const header = /^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm;
  return [...patch.matchAll(header)].map((match) => (match[1] ?? '').trim()).filter((file) => file !== '');
}

export function codexToolKindOf(name: string): ToolKind {
  if (name === CODEX_SHELL) return 'bash';
  if (name === CODEX_PATCH) return 'write';
  if (name === 'view_image') return 'read';
  return WEB.test(name) ? 'web' : 'other';
}

export function codexToolCallOf(name: unknown, rawInput: unknown): ToolCall {
  const tool = typeof name === 'string' ? name : '';
  const input = isRecord(rawInput) ? rawInput : {};
  const own = textAt(input, 'path');
  const named = own === undefined ? [] : [own];
  const paths = tool === CODEX_PATCH ? patchPathsOf(textAt(input, 'command')) : named;
  return {
    kind: codexToolKindOf(tool),
    paths,
    guarded: paths,
    command: tool === CODEX_SHELL ? textAt(input, 'command') : undefined,
    url: WEB.test(tool) ? textAt(input, 'url') : undefined,
    subagent: SUBAGENT.test(tool) ? tool : undefined,
    // Codex's sub-agents are refused outright, as agy's are: no model of theirs is ever weighed.
    model: undefined,
  };
}

/** The class tools that would grant `name`, when the class has none of them; undefined when it may use it. */
export function missingCodexTools(
  name: string,
  classTools: readonly string[] | undefined,
): readonly string[] | undefined {
  const granting = CLASS_TOOLS[name] ?? (WEB.test(name) ? WEB_TOOLS : undefined);
  if (classTools === undefined || granting === undefined) return undefined;
  return granting.some((tool) => classTools.includes(tool)) ? undefined : granting;
}

export const isAskTool = (name: string): boolean => ASK.test(name);
export const isRefusedTool = (name: string): boolean => REFUSED.test(name);
