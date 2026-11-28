// The `secret_place` check of the conformance suite (SEC-01, threat model V1): a knight whose class allows `git status`
// names a file of a tribe's CLI folder in one, then asks git's credential helper; the fences refuse both and the session goes
// on. Live too, one session a tribe: only the real CLI shows that its hook sees the shell line (Codex runs a command
// through the JavaScript of its `exec` tool) and that the refusal reaches the result.
import assert from 'node:assert/strict';

import { gatedCheck } from './play.ts';
import { FAKE_SECRET_COMMANDS } from './scenarios.ts';
import type { ConformanceCheck } from './target.ts';

/**
 * What a refusal's detail names for each command: the place, and the helper. A real CLI is asked for the place only:
 * Codex's model (gpt-6-luna, 2026-11-21) refused the whole request once it named git's credentials, so its hook had
 * nothing to refuse; the helper is a law like `git push`, whose refusal `forbidden_command` already shows live.
 */
const NAMED = [
  '.codex',
  'git credential',
  'vault.json',
  'tribe-account',
  'gh auth token',
  '.config/gh',
  '.npmrc',
  '.netrc',
  '.aws',
  '.docker/config.json',
] as const;

export const secretCheck: ConformanceCheck = gatedCheck(
  'secret_place',
  'secret_place',
  ({ result }, target) => {
    assert.equal(result.outcome, 'completed', 'a blocked command does not end the session');
    (target.live === true ? NAMED.slice(0, 1) : NAMED).forEach((named, index) => {
      assert.ok(
        result.permission_denials.some((denial) => denial.detail.includes(named)),
        `tool_gate declared but \`${FAKE_SECRET_COMMANDS[index] ?? named}\` was not refused`,
      );
    });
  },
);
