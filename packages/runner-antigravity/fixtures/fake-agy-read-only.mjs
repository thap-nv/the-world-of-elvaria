// The conformance suite's `read_only_write` (P2-01d) for fake-agy.mjs: the knight of a read-only quest writes a source
// file of its plot with write_to_file, through the PreToolUse hook; a deny comes back as the tool's error, which the
// adapter reads as a refusal, and keeps the file out. Without a deny the file is written.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** One write_to_file call; `agy` holds fake-agy's own: core, runHook, base, step, and the run's step counter. */
export function writeProbe(agy) {
  const parameters = {
    TargetFile: path.join(process.cwd(), agy.core.FAKE_READ_ONLY_FILE),
    CodeContent: 'export {};\n',
  };
  const tool = { tool_name: 'write_to_file', step_type: 'tool' };
  agy.step({ state: 'ACTIVE', ...tool, tool_info: { name: 'write_to_file', parameters } });
  const toolCall = { name: 'write_to_file', args: parameters };
  const hook = agy.runHook('PreToolUse', agy.base({ stepIdx: agy.run.step, toolCall }));
  const denied = hook.failed === true || hook.decision?.decision === 'deny';
  if (!denied) writeFileSync(parameters.TargetFile, parameters.CodeContent);
  const message = `tool call denied by pre-tool hook: ${hook.decision?.reason ?? ''}`;
  const info = denied ? { error: { type: 'TOOL_ERROR', message } } : { output: 'Created file.\n' };
  agy.step({
    state: denied ? 'ERROR' : 'DONE',
    ...tool,
    tool_info: { name: 'write_to_file', parameters, ...info },
  });
  agy.run.step += 1;
}
