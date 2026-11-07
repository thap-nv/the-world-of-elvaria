// Reading the CLI's JSON without trusting its shape: a field of the wrong type reads as absent, never throws.
// The stream is a contract of one CLI version (fixtures/), and a newer version may add or move fields.

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

/** Tokens of an API usage object (`message.usage`): input, output and both cache counts. */
export function usageTokens(usage: JsonObject | undefined): number {
  const keys = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
  return keys.reduce((sum, key) => sum + (numberOf(usage, key) ?? 0), 0);
}

/** Tokens of `result.modelUsage`, every model of the session (the apprentice's included, spike P1-02). */
export function modelUsageTokens(modelUsage: JsonObject | undefined): number {
  const keys = ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'];
  return Object.values(modelUsage ?? {})
    .filter(isObject)
    .reduce((sum, model) => sum + keys.reduce((part, key) => part + (numberOf(model, key) ?? 0), 0), 0);
}
