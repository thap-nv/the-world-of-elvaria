// The models agy serves and the family of each (capabilities.models, implementation-plan §3.14, PS-23): `agy models`
// on 1.5.18 lists Gemini, Claude and GPT models under their makers' own slugs (cli-facts 2026-11-21, (607)), so the
// separation of duties knows a Gemini-tribe judge on `claude-opus-5-5-high` for a Claude model. The heads also cover
// a model a later agy adds; (607) sets Carbon 4, Neon 3 and Hydrogen 2 before Argon/Flash retire on 2026-11-30.
import type { TribeModel } from '@elvaria/runner-core';

export const ANTIGRAVITY_MODELS: readonly TribeModel[] = [
  { id: 'gemini-4-carbon', family: 'gemini', starting_level: 4 },
  { id: 'gemini-4-neon', family: 'gemini', starting_level: 3 },
  { id: 'gemini-4-hydrogen', family: 'gemini', starting_level: 2 },
  { id: 'gemini', family: 'gemini' },
  { id: 'claude-opus', family: 'claude', starting_level: 5 },
  { id: 'claude-sonnet', family: 'claude', starting_level: 4 },
  { id: 'claude', family: 'claude' },
  { id: 'gpt', family: 'gpt' },
];
