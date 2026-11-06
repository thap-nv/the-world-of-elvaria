// A Claude Code hook payload (stdin JSON), read defensively: fields come and go between CLI versions
// (cli-facts §1.4), and a missing field must never crash the hook.

export interface ClaudeInput {
  readonly raw: Readonly<Record<string, unknown>>;
  /** `hook_event_name`, e.g. `PreToolUse`. */
  readonly event: string;
  /** `session_id`. */
  readonly session: string | undefined;
  /** A non-empty string field. */
  text(key: string): string | undefined;
  /** A finite number field. */
  number(key: string): number | undefined;
}

export function claudeInputOf(raw: Readonly<Record<string, unknown>>): ClaudeInput {
  const text = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const number = (key: string): number | undefined => {
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  return { raw, event: text('hook_event_name') ?? '', session: text('session_id'), text, number };
}
