// Reading the CLI's JSON without trusting its shape: a field of the wrong type reads as absent, never throws.
// The stream is a contract of one CLI version (fixtures/), and a newer version may add or move fields.
import type { SessionTokens } from '@elvaria/runner-core';

export type JsonObject = Readonly<Record<string, unknown>>;

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const textOf = (value: JsonObject | undefined, key: string): string | undefined => {
  const found = value?.[key];
  return typeof found === 'string' ? found : undefined;
};

export const numberOf = (value: JsonObject | undefined, key: string): number | undefined => {
  const found = value?.[key];
  return typeof found === 'number' && Number.isFinite(found) ? found : undefined;
};

export const objectOf = (value: JsonObject | undefined, key: string): JsonObject | undefined => {
  const found = value?.[key];
  return isObject(found) ? found : undefined;
};

export const objectsOf = (value: JsonObject | undefined, key: string): JsonObject[] => {
  const found = value?.[key];
  return Array.isArray(found) ? found.filter(isObject) : [];
};

/** One line of output as an object; undefined for anything else (a blank line, a log line, broken JSON). */
export function parseLine(line: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

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
      .filter(isObject)
      .map((model) => ({
        tokens: sumOf(model, ['inputTokens', 'outputTokens', 'cacheCreationInputTokens']),
        cache_read: numberOf(model, 'cacheReadInputTokens') ?? 0,
      })),
  );
