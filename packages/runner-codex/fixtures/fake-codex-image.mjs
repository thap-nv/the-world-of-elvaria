// The conformance suite's `image` (PS-11b) for fake-codex.mjs: a judge opens the probe's PNG with view_image, which no
// rule of Codex fences, its read-only sandbox included (vision spike 2026-11-17: it read any file on the disk); only
// Elvaria's PreToolUse hook may refuse it. Once the hook lets it through, the fake "sees" the stripes.
import process from 'node:process';

/** The judge's answer as JSON; `codex` holds fake-codex's own: core, runHook, base. */
export function viewImage(codex) {
  const file = codex.core.fakeImageOf(process.env);
  const call = {
    turn_id: 'turn',
    tool_name: 'view_image',
    tool_input: { path: file },
    tool_use_id: 'view-1',
  };
  const decision = codex.runHook('PreToolUse', codex.base('PreToolUse', call));
  const denied = decision?.hookSpecificOutput?.permissionDecision === 'deny';
  return JSON.stringify(codex.core.fakeImageAnswer(file, file !== undefined && !denied));
}
