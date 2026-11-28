// The conformance suite's `read_only_write` (P2-01d) for fake-claude.mjs: the knight of a read-only quest writes a
// source file of its plot with Write, through the PreToolUse hooks of its settings; a hook's deny keeps the file out
// and lands in permission_denials, as Claude Code reports a refused call. Without a deny the file is written.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { hookDenial } from './fake-claude-denials.mjs';

const TOOL_ID = 'toolu_fake_write';

/** `cli` holds fake-claude's own helpers: out, speak, runHooks, writeLetter, finish. */
export function readOnlyWrite(play, cli) {
  const input = {
    file_path: path.join(process.cwd(), play.core.FAKE_READ_ONLY_FILE),
    content: 'export {};\n',
  };
  cli.speak(play, [{ type: 'tool_use', id: TOOL_ID, name: 'Write', input }]);
  const call = { session_id: play.id, tool_name: 'Write', tool_input: input, cwd: process.cwd() };
  const reason = hookDenial(cli.runHooks(play.settings, 'PreToolUse', call));
  if (reason === undefined) writeFileSync(input.file_path, input.content);
  const block = {
    type: 'tool_result',
    tool_use_id: TOOL_ID,
    content: reason ?? 'File created.',
    is_error: reason !== undefined,
  };
  cli.out({ type: 'user', message: { role: 'user', content: [block] }, session_id: play.id });
  cli.speak(play, [{ type: 'text', text: 'done' }]);
  cli.writeLetter(play);
  const denials =
    reason === undefined ? [] : [{ tool_name: 'Write', tool_use_id: TOOL_ID, tool_input: input }];
  return cli.finish(play, { permission_denials: denials });
}
