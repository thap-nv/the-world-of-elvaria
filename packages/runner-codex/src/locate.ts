// Where Codex CLI is when kingdom.json has not pinned it yet (spike Codex 2026-11-12 §1.1): PATH, npm's global folder on
// Windows, and the binary that ships inside the VS Code extension `openai.chatgpt`, which is often the only one and
// never on PATH: `<extension>/bin/<os-arch>/codex(.exe)`. The extension's folder name carries its version, so an
// update moves the binary. runner-core's `locateTool` looks; `elvaria doctor` pins the answer into `tribes[].tool.path`.
import { locateTool, toolCandidates } from '@elvaria/runner-core';
import type { ToolEnv, ToolSearch } from '@elvaria/runner-core';

const CODEX_SEARCH: ToolSearch = {
  program: 'codex',
  extension: { id: 'openai.chatgpt', binary_dir: ['bin', '*'] },
};

/** Every place to look, in order of preference. */
export const codexCandidates = (env: ToolEnv, platform: NodeJS.Platform): Promise<string[]> =>
  toolCandidates(CODEX_SEARCH, env, platform);

/** The first Codex CLI found, or undefined. */
export const locateCodex = (env: ToolEnv, platform: NodeJS.Platform): Promise<string | undefined> =>
  locateTool(CODEX_SEARCH, env, platform);
