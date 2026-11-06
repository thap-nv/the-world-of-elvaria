// A line before it is stamped: the hook decides the type and data, write.ts adds v, id, ts, actor and the
// session fields (implementation-plan §2.3, §3.10).

export interface Draft {
  /** `group.action` of the v1 catalogue (docs/events.md). */
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * The hook's answer to the CLI, printed to stdout as one JSON object with exit 0: a `deny` of PreToolUse or a
 * `block` of Stop. Not exit 2, whose reason reaches the model prefixed with the whole hook command line, run
 * folder included (spike P1-02, §3.6).
 */
export type Decision = Readonly<Record<string, unknown>>;

/** What one call does: the lines to append, and the decision when it stops the CLI. */
export interface Translation {
  readonly drafts: readonly Draft[];
  readonly decision: Decision | undefined;
  /** Things the call could not do, for stderr; they never block (§3.6). */
  readonly problems: readonly string[];
}

export const translation = (drafts: readonly Draft[], extra: Partial<Translation> = {}): Translation => ({
  drafts,
  decision: extra.decision,
  problems: extra.problems ?? [],
});

/** PreToolUse: the call does not run, and the model reads `reason`. */
export const denyTool = (reason: string): Decision => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
});

/** Stop: the session goes on, and the model reads `reason`. */
export const blockStop = (reason: string): Decision => ({ decision: 'block', reason });

/** `agent.notification`, whose data is open in v1: one shape for the CLI's notices and the hook's own. */
export const notification = (notificationType: string, message: string): Draft => ({
  type: 'agent.notification',
  data: { notification_type: notificationType, message },
});

export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Event data without its unset fields: the v1 data schemas are strict and have no `null` for "unknown". */
export const withoutUndefined = (data: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
