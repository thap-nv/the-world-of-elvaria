// Fixed parts of every ToolPolicy (implementation-plan §3.7, §3.9, §3.12). Rules use Claude Code syntax, as the
// registry does; the other adapters translate them (classes.schema.json $comment).

/**
 * `Agent(apprentice)` in a class's allow list is a flag, not a rule: the class may start the apprentice (§10,
 * chốt 2026-11-07). An allow rule on `Agent` limits nothing under dontAsk (spike P1-02), so the policy turns the
 * flag into the `Agent` tool instead, and the hook lets only `apprentice` through.
 */
export const APPRENTICE_RULE = 'Agent(apprentice)';
export const AGENT_TOOL = 'Agent';
export const SHELL_TOOL = 'Bash';

/** Tools that change files: a verifier has none of them (ADR 0008). */
export const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'] as const;

/** Built-in agent types, denied by rule as a second fence behind the hook (ADR 0017). */
export const BUILT_IN_AGENTS = ['Explore', 'general-purpose', 'Plan', 'statusline-setup'] as const;

/** Stage 1: Elvaria never pushes (CLAUDE.md, §9.1). The rule is the CLI's fence. */
export const NO_PUSH_RULE = 'Bash(git push:*)';
/**
 * The same as a law for the hook: the rule misses `git -C . push` (spike P1-02), this pattern does not. Options
 * between `git` and `push` may carry a value; `git log --grep push` does not match.
 */
export const NO_PUSH_COMMAND = String.raw`\bgit(?:\s+-{1,2}[\w-]+(?:[=\s][^\s;&|]+)?)*\s+push\b`;

/** Dotenv files are never read nor written, whatever the territory says (§3.9). */
export const SECRET_FILES = ['.env', '.env.*'] as const;

/** Territory commands a character with a shell may run to check its own work. */
export const CHECK_COMMANDS = ['test', 'lint', 'typecheck'] as const;
