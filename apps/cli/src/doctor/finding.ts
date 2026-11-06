// One line of the doctor's report. An error makes `elvaria doctor` exit 1; a warning is printed and passes.

export type FindingLevel = 'ok' | 'warn' | 'error';

export interface Finding {
  readonly level: FindingLevel;
  /** Already in the owner's language. */
  readonly text: string;
  /** Indented under the line: file names, schema details, a command to run. */
  readonly details?: readonly string[];
}

const MARK: Readonly<Record<FindingLevel, string>> = { ok: '✓', warn: '!', error: '✗' };

export const finding = (level: FindingLevel, text: string, details: readonly string[] = []): Finding => ({
  level,
  text,
  details,
});

export function findingLines(item: Finding): string[] {
  return [`${MARK[item.level]} ${item.text}`, ...(item.details ?? []).map((line) => `    ${line}`)];
}
