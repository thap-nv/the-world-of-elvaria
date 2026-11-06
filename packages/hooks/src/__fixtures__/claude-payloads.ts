// Claude Code hook payloads (stdin), one per event Elvaria registers, shaped after the hooks reference of Claude
// Code 2.1.318 (code.claude.com/docs/en/hooks, read 2026-11-06), so every event has a case with every field.
// The payloads Claude Code really sent are in packages/runner-claude/fixtures/hook-payloads.jsonl (spike
// P1-02, real-payloads.spec.ts); PostToolUseFailure, PreCompact, PostCompact and Notification were not seen
// there. Paths are Windows paths: the hook must read backslashes on every OS (cli-facts §1.5).

export const QUEST = 'q_20261106_7k3m2a';
export const CHARACTER = 'thorn';
export const SESSION = '00893aaf-19fa-41d2-8238-13269b9b3ca0';
export const PLOT = `C:\\Users\\dev\\dc1-se-team\\.elvaria\\worktrees\\${QUEST}`;

type Payload = Record<string, unknown>;

const common = (event: string): Payload => ({
  session_id: SESSION,
  transcript_path: `C:\\Users\\dev\\.claude\\projects\\C--Users-dev-dc1-se-team\\${SESSION}.jsonl`,
  cwd: PLOT,
  permission_mode: 'dontAsk',
  hook_event_name: event,
});

/** The twelve events of cli-facts §1.4, in that order. */
export const PAYLOADS = {
  SessionStart: { ...common('SessionStart'), source: 'startup', model: 'claude-opus-5-5' },
  SessionEnd: { ...common('SessionEnd'), reason: 'other' },
  PreToolUse: {
    ...common('PreToolUse'),
    tool_name: 'Edit',
    tool_input: { file_path: `${PLOT}\\apps\\api\\src\\score.ts`, old_string: 'a', new_string: 'b' },
    tool_use_id: 'toolu_01ABC123',
  },
  PostToolUse: {
    ...common('PostToolUse'),
    tool_name: 'Edit',
    tool_input: { file_path: `${PLOT}\\apps\\api\\src\\score.ts`, old_string: 'a', new_string: 'b' },
    tool_response: { filePath: `${PLOT}\\apps\\api\\src\\score.ts`, type: 'update' },
    tool_use_id: 'toolu_01ABC123',
    duration_ms: 12,
  },
  PostToolUseFailure: {
    ...common('PostToolUseFailure'),
    tool_name: 'Bash',
    tool_input: { command: 'pnpm --filter @dc1/api test', description: 'Run the API tests' },
    tool_use_id: 'toolu_01ABC124',
    error: "Exit code 1\nError: Cannot find module 'express'",
    is_interrupt: false,
    duration_ms: 4187,
  },
  Stop: {
    ...common('Stop'),
    stop_hook_active: false,
    last_assistant_message: 'Done: scoring rules updated.',
  },
  StopFailure: {
    ...common('StopFailure'),
    error: 'rate_limit',
    error_details: '429 Too Many Requests',
    last_assistant_message: 'API Error: Rate limit reached',
  },
  SubagentStart: { ...common('SubagentStart'), agent_id: 'agent-def456', agent_type: 'apprentice' },
  SubagentStop: {
    ...common('SubagentStop'),
    stop_hook_active: false,
    agent_id: 'agent-def456',
    agent_type: 'apprentice',
    agent_transcript_path: `C:\\Users\\dev\\.claude\\projects\\x\\${SESSION}\\subagents\\agent-def456.jsonl`,
    last_assistant_message: 'Found 3 call sites.',
  },
  PreCompact: { ...common('PreCompact'), trigger: 'auto', custom_instructions: null },
  PostCompact: {
    ...common('PostCompact'),
    trigger: 'auto',
    compact_summary: 'Summary of the compacted conversation…',
  },
  Notification: {
    ...common('Notification'),
    message: 'Claude is waiting for your input',
    notification_type: 'idle_prompt',
  },
} as const satisfies Record<string, Payload>;

export type ClaudeEvent = keyof typeof PAYLOADS;

/** The line types each payload yields for a verifier (no handover gate) with laws that allow the call. */
export const EXPECTED_TYPES: Readonly<Record<ClaudeEvent, readonly string[]>> = {
  SessionStart: ['agent.session.start'],
  SessionEnd: [],
  PreToolUse: [],
  PostToolUse: ['agent.tool'],
  PostToolUseFailure: ['agent.tool'],
  Stop: [],
  StopFailure: ['mana.signal'],
  SubagentStart: [],
  SubagentStop: [],
  PreCompact: ['agent.compact'],
  PostCompact: ['agent.compact'],
  Notification: ['agent.notification'],
};

/** A payload with fields replaced. */
export const payload = (event: ClaudeEvent, fields: Payload = {}): Payload => ({
  ...PAYLOADS[event],
  ...fields,
});

/** The laws of the dc1 example territory (packages/domain/examples/territory.json). */
export const DC1_LAWS = {
  forbidden_paths: ['.env', '.env.*', 'infra/secrets/**'],
  forbidden_commands: [
    'git\\s+(-C\\s+\\S+\\s+)?push',
    'drizzle-kit\\s+(drop|push)',
    'docker\\s+compose\\s+.*down\\s+-v',
  ],
};
