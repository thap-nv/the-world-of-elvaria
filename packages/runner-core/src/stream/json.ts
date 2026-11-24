// Reading a CLI's JSON without trusting its shape: a field of the wrong type reads as absent, never throws. Each
// stream is a contract of one CLI version (fixtures/), and a newer version may add or move fields. One copy for every
// adapter (AH-09: Claude's, Codex's and agy's readers each had their own).

export type JsonObject = Readonly<Record<string, unknown>>;

export const isJsonObject = (value: unknown): value is JsonObject =>
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
  return isJsonObject(found) ? found : undefined;
};

export const objectsOf = (value: JsonObject | undefined, key: string): JsonObject[] => {
  const found = value?.[key];
  return Array.isArray(found) ? found.filter(isJsonObject) : [];
};

/** One line of output as an object; undefined for anything else (a blank line, a log line, broken JSON). */
export function parseJsonLine(line: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return isJsonObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
