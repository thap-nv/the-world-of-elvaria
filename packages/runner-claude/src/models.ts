// The models Claude Code serves and their family (capabilities.models, implementation-plan §3.14, PS-23): all are
// Anthropic's. The heads cover a full slug (`claude-opus-5-5`) and Claude Code's own aliases (`opus`); the starting
// levels are P1-26's table, now the adapter's to say.
import type { TribeModel } from '@elvaria/runner-core';

export const CLAUDE_MODELS: readonly TribeModel[] = [
  { id: 'claude-opus', family: 'claude', starting_level: 5 },
  { id: 'claude-sonnet', family: 'claude', starting_level: 4 },
  { id: 'claude-haiku', family: 'claude', starting_level: 2 },
  { id: 'claude', family: 'claude' },
  { id: 'opus', family: 'claude', starting_level: 5 },
  { id: 'sonnet', family: 'claude', starting_level: 4 },
  { id: 'haiku', family: 'claude', starting_level: 2 },
];
