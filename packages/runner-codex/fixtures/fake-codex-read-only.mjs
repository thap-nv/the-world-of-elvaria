// The conformance suite's `read_only_write` (P2-01d) for fake-codex.mjs: the knight of a read-only quest adds a source
// file to its plot with apply_patch, through the PreToolUse hook. Codex writes a refusal on stderr only (spike §1.5);
// for a patch its `Command:` is the patch, first line on the refusal's line and the rest on lines of their own, as
// codex-cli 0.171.0-alpha.13.2 wrote it in P2-01d's live run (stream-read-only.stderr.txt), so the adapter keeps the
// hook's reason, which names the file. Without a deny the file is written, as Codex's workspace-write sandbox lets it.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** One apply_patch call; `codex` holds fake-codex's own: core, runHook, base. */
export function patchProbe(codex) {
  const file = codex.core.FAKE_READ_ONLY_FILE;
  const command = `*** Begin Patch\n*** Add File: ${file}\n+export {};\n*** End Patch\n`;
  const payload = {
    turn_id: 'turn',
    tool_name: 'apply_patch',
    tool_input: { command },
    tool_use_id: 'patch-1',
  };
  const decision = codex.runHook('PreToolUse', codex.base('PreToolUse', payload));
  if (decision?.hookSpecificOutput?.permissionDecision !== 'deny') {
    writeFileSync(path.join(process.cwd(), file), 'export {};\n');
    return;
  }
  const reason = decision.hookSpecificOutput.permissionDecisionReason;
  process.stderr.write(
    `2026-11-28T12:00:00.000000Z ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: ${reason}. Command: ${command}`,
  );
}
