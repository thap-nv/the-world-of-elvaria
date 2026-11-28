// The `read_only_write` check of the conformance suite (P2-01d, 383a, W7): a knight on a read-only quest, whose class
// has Edit and Write, tries to write a source file of its plot; the write fence refuses it, the file is not there
// afterwards, and the session goes on. Live too, one short session a tribe (the owner's W7): only the real CLI shows
// that its hook sees the write (Codex's apply_patch, agy's write_to_file) and that the refusal holds.
import assert from 'node:assert/strict';

import { gatedCheck } from './play.ts';
import { FAKE_READ_ONLY_FILE } from './scenarios.ts';
import type { ConformanceCheck } from './target.ts';

export const readOnlyCheck: ConformanceCheck = gatedCheck(
  'read_only_write',
  'read_only_write',
  ({ result, probe_written: written }) => {
    assert.equal(result.outcome, 'completed', 'a refused write does not end the session');
    assert.equal(written, undefined, `a read-only quest's session wrote ${FAKE_READ_ONLY_FILE} in its plot`);
    assert.ok(
      result.permission_denials.some((denial) => denial.detail.includes(FAKE_READ_ONLY_FILE)),
      `tool_gate declared but the write of ${FAKE_READ_ONLY_FILE} was not refused`,
    );
  },
);
