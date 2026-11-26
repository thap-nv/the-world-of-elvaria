// Where Claude Code is when kingdom.json has not pinned it yet (implementation-plan §3.7): PATH, the native
// installer's `~/.local/bin`, npm's global folder on Windows, and the binary that ships inside the VS Code
// extension, which is often the only one and never on PATH (cli-facts §0). runner-core's `locateTool` looks;
// `elvaria doctor` pins the answer into `tribes[].tool.path`, so later runs never search.
import { locateTool, toolCandidates } from '@elvaria/runner-core';
import type { ToolEnv, ToolSearch } from '@elvaria/runner-core';

const CLAUDE_SEARCH: ToolSearch = {
  program: 'claude',
  home_bin: ['.local', 'bin'],
  extension: { id: 'anthropic.claude-code', binary_dir: ['resources', 'native-binary'] },
};

/** Every place to look, in order of preference. */
export const claudeCandidates = (env: ToolEnv, platform: NodeJS.Platform): Promise<string[]> =>
  toolCandidates(CLAUDE_SEARCH, env, platform);

/** The first Claude Code found, or undefined. */
export const locateClaude = (env: ToolEnv, platform: NodeJS.Platform): Promise<string | undefined> =>
  locateTool(CLAUDE_SEARCH, env, platform);
