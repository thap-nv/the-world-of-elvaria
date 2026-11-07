// Data the mana functions decide with (implementation-plan §3.5, ADR 0009).

/**
 * Model-slug prefixes of each named pool: an account with several pools (Antigravity: Gemini models and the
 * Claude/GPT models it also serves) charges a character to the pool of its model. Keyed by pool, not by adapter,
 * so the core still never asks which CLI a tribe runs (ADR 0021); a tribe without `pools` is one pool.
 */
export const POOL_MODEL_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  gemini_models: ['gemini-'],
  claude_gpt_models: ['claude-', 'gpt-'],
};
