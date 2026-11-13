// The neutral hook dialect, the writer's side (implementation-plan §3.6, PS-23): an adapter whose CLI has hooks of
// its own puts this into `policy.json` (`writePolicyFile(…, { dialect })`), and Elvaria's hook reads the CLI's
// payload and writes its answers by it, so the CLI gets the tool gate and the events without a branch in
// `@elvaria/hooks`. The reader and its checks are packages/hooks/src/neutral/dialect.ts, which runner-core may not
// import (§1.3); docs/guides/adding-a-tribe.md shows one whole.

/** One tool of the CLI; every key names a field of the tool's input, a dot path. */
export interface DialectTool {
  /** `agent.tool.tool`: read, write, bash, web, search or other. */
  readonly kind: 'read' | 'write' | 'bash' | 'web' | 'search' | 'other';
  /** Class tools in Claude Code names, any one of which grants it (`Bash`, `Edit`…); absent: every class may. */
  readonly grants?: readonly string[];
  readonly command?: string;
  readonly paths?: readonly string[];
  /** A patch in the `*** Update File: <path>` form (Codex's apply_patch). */
  readonly patch?: string;
  readonly url?: string;
  /** Refused whatever the class: a sub-agent, a question nobody answers, a tool no class has. */
  readonly refuse?: 'subagent' | 'ask' | 'tool';
}

/** policy.json `dialect` v1: where the payload names each thing (dot paths), and the answers with `{reason}`. */
export interface HookDialect {
  readonly version: 1;
  /** A dot path of the payload, or `argv` for the first argument after the hook's script. */
  readonly event: string;
  readonly events: {
    readonly session_start?: string;
    readonly pre_tool: string;
    readonly post_tool?: string;
    readonly stop?: string;
  };
  readonly session?: string;
  readonly model?: string;
  readonly cwd?: string;
  readonly tool_name: string;
  readonly tool_input: string;
  readonly exit?: string;
  /** By the CLI's tool name; a name ending in `*` stands for every tool that starts with the rest. */
  readonly tools: Readonly<Record<string, DialectTool>>;
  /** A tool `tools` does not name: refused (default) or let through as `other`. */
  readonly unknown_tools?: 'deny' | 'allow';
  readonly answers: {
    readonly deny: Readonly<Record<string, unknown>>;
    readonly stop?: Readonly<Record<string, unknown>>;
    readonly pass?: Readonly<Record<string, unknown>>;
  };
}
