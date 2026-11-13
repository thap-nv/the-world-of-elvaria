// How a session reads a file, the last sentence of prompts/shell.md (implementation-plan §3.14, PS-23).

/** `git grep` printing every line of one tracked file with its number: how a class without a shell reads (PS-23). */
export const GIT_READ_LINE = "git grep -h -n -e '^' -- '<path>'";

/**
 * How the session reads a file (PS-23): with its CLI's Read tool; or, when the CLI has none (`capabilities.read:
 * false`, Codex), with read-only commands of its shell, which the adapter lets run; or, for a class without a shell,
 * through the search command that prints a tracked file. Before PS-23 Codex's context file said the same over a
 * prompt that named a Read tool it does not have.
 */
export function readSentence(reads: boolean | undefined, shell: boolean, search: readonly string[]): string {
  if (reads !== false) return 'Read files with Read, not with the shell.';
  if (shell)
    return 'Your CLI has no tool that reads files, so your shell also runs read-only commands that read, list and search them.';
  return search.includes('git grep')
    ? `Your CLI has no tool that reads files: read a file git tracks with \`${GIT_READ_LINE}\`.`
    : '';
}
