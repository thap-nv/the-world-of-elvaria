// The models agy serves and the family of each (capabilities.models, implementation-plan §3.14, PS-23): `agy models`
// on 1.5.6 lists Gemini, Claude and GPT models under their makers' own slugs (cli-facts 2026-11-12 §2.4), so the
// separation of duties knows a Gemini-tribe judge on `claude-opus-5-5-high` for a Claude model. The heads also cover
// a model a later agy adds; the starting levels are P1-26's.
import type { TribeModel } from '@elvaria/runner-core';

export const ANTIGRAVITY_MODELS: readonly TribeModel[] = [
  { id: 'gemini-4-argon', family: 'gemini', starting_level: 3 },
  { id: 'gemini-3.8-flash', family: 'gemini', starting_level: 2 },
  { id: 'gemini', family: 'gemini' },
  { id: 'claude-opus', family: 'claude', starting_level: 5 },
  { id: 'claude-sonnet', family: 'claude', starting_level: 4 },
  { id: 'claude', family: 'claude' },
  { id: 'gpt', family: 'gpt' },
];
