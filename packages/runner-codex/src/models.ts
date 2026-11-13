// The models Codex serves and their family (capabilities.models, implementation-plan §3.14, PS-23): all are OpenAI's.
// The account's list is `codex debug models` (spike Codex 2026-11-12, cli-facts §5); a reasoning suffix (`-low`) needs
// no entry. Before PS-23 a character on these started at level 1 unless `--level`, since P1-26's words did not know
// them (the P1-12d list of what a third tribe touched outside its package).
import type { TribeModel } from '@elvaria/runner-core';

export const CODEX_MODELS: readonly TribeModel[] = [
  { id: 'gpt-6-astra', family: 'gpt', starting_level: 5 },
  { id: 'gpt-6.1-sol', family: 'gpt', starting_level: 4 },
  { id: 'gpt-6-sol', family: 'gpt', starting_level: 4 },
  { id: 'gpt-5.6-sol', family: 'gpt', starting_level: 4 },
  { id: 'gpt-6.1-terra', family: 'gpt', starting_level: 3 },
  { id: 'gpt-5.6-terra', family: 'gpt', starting_level: 3 },
  { id: 'gpt-6-luna', family: 'gpt', starting_level: 2 },
  { id: 'gpt-5.6-luna', family: 'gpt', starting_level: 2 },
  { id: 'gpt', family: 'gpt' },
  { id: 'codex', family: 'gpt' },
];
