// Claude Code's token counts in its JSON: an API usage object and `result.modelUsage`, read with runner-core's
// accessors (a field of the wrong type reads as absent, never throws; AH-09 moved them there for every adapter).
import { isJsonObject, numberOf } from '@elvaria/runner-core';
import type { JsonObject, SessionTokens } from '@elvaria/runner-core';

const sumOf = (value: JsonObject | undefined, keys: readonly string[]): number =>
  keys.reduce((sum, key) => sum + (numberOf(value, key) ?? 0), 0);

/** Both parts added up; `countedTokens` of runner-core turns the sum into the session's tokens (P1-23). */
export const addTokens = (parts: readonly SessionTokens[]): SessionTokens =>
  parts.reduce(
    (sum, part) => ({ tokens: sum.tokens + part.tokens, cache_read: sum.cache_read + part.cache_read }),
    {
      tokens: 0,
      cache_read: 0,
    },
  );

/**
 * Tokens of an API usage object (`message.usage`): input, output and cache writes, and apart from them cache reads,
 * which Claude Code makes of its whole context on every model call (85-90 % of the sum, phase-1 report §5.2).
 */
export const usageTokens = (usage: JsonObject | undefined): SessionTokens => ({
  tokens: sumOf(usage, ['input_tokens', 'output_tokens', 'cache_creation_input_tokens']),
  cache_read: numberOf(usage, 'cache_read_input_tokens') ?? 0,
});

/** The same of `result.modelUsage`, every model of the session (the apprentice's included, spike P1-02). */
export const modelUsageTokens = (modelUsage: JsonObject | undefined): SessionTokens =>
  addTokens(
    Object.values(modelUsage ?? {})
      .filter(isJsonObject)
      .map((model) => ({
        tokens: sumOf(model, ['inputTokens', 'outputTokens', 'cacheCreationInputTokens']),
        cache_read: numberOf(model, 'cacheReadInputTokens') ?? 0,
      })),
  );
