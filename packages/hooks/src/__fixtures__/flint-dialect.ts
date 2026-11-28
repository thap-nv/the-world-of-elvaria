// flint, the made-up CLI of apps/cli's fixtures, as its adapter describes it to the neutral dialect (PS-23): the event
// in `kind`, the tool under `action.params`, answers `{"verdict": "refuse", "why": …}`.
import type { HookDialect } from '../neutral/dialect.ts';

export const FLINT_DIALECT: HookDialect = {
  version: 1,
  event: 'kind',
  events: { session_start: 'begin', pre_tool: 'before_action', post_tool: 'after_action', stop: 'finish' },
  session: 'thread',
  model: 'engine',
  cwd: 'dir',
  tool_name: 'action.name',
  tool_input: 'action.params',
  exit: 'status',
  tools: {
    shell: { kind: 'bash', grants: ['Bash'], command: 'line' },
    open: { kind: 'read', grants: ['Read'], paths: ['file'] },
    save: { kind: 'write', grants: ['Edit', 'Write'], paths: ['file', 'files'] },
    patch: { kind: 'write', grants: ['Edit', 'Write'], patch: 'text' },
    'delegate*': { kind: 'other', refuse: 'subagent' },
    ask_human: { kind: 'other', refuse: 'ask' },
    fetch: { kind: 'web', grants: ['WebFetch'], url: 'address' },
  },
  answers: {
    deny: { verdict: 'refuse', why: '{reason}' },
    stop: { verdict: 'again', why: '{reason}' },
    pass: { verdict: 'go' },
  },
};
