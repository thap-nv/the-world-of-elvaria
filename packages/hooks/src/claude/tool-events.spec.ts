// PreToolUse on a path the CLI guards that the territory lets the Steward patch (P1-28, implementation-plan §3.3):
// the reason names the patch file instead of the owner, and says no "do not try another way" after it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS, PLOT, SESSION } from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { loadContext } from '../context.ts';
import { compileLaws } from '../laws.ts';
import { claudeInputOf } from './input.ts';
import { preToolUse } from './tool-events.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';
import type { HookContext } from '../context.ts';

let kingdom: TempKingdom;
let ctx: HookContext;
beforeEach(async () => {
  kingdom = await tempKingdom();
  const laws = { ...DC1_LAWS, patch_paths: ['.husky/**'] };
  const extras = { cliProtected: ['.husky/**', '.npmrc'], patchFile: 'elvaria.patch' };
  ctx = { ...loadContext(kingdom.env(), []), laws: compileLaws(laws, extras) };
});
afterEach(() => kingdom.remove());

/** The reason Claude Code reads from a PreToolUse deny, or undefined when the call goes on. */
function reasonOf(tool: string, input: Record<string, unknown>): string | undefined {
  const raw = {
    hook_event_name: 'PreToolUse',
    session_id: SESSION,
    cwd: PLOT,
    tool_name: tool,
    tool_input: input,
  };
  const output = preToolUse(claudeInputOf(raw), ctx).decision?.hookSpecificOutput as
    { permissionDecisionReason?: string } | undefined;
  return output?.permissionDecisionReason;
}

describe('a protected path of laws.patch_paths (P1-28)', () => {
  it('is refused with the patch the Steward applies as the way, not a question for the owner', () => {
    const reason = reasonOf('Edit', {
      file_path: `${PLOT}\\.husky\\pre-push`,
      old_string: 'a',
      new_string: 'b',
    });
    expect(reason).toMatch(
      /^Elvaria rule: .*pre-push is in a path your CLI refuses to write .*\(\.husky\/\*\*\), but/,
    );
    expect(reason).toContain('write the change as a git patch');
    expect(reason).toContain('to elvaria.patch at the root of your plot');
    expect(reason).toMatch(
      /The Steward applies it when your session completes; do not ask the owner for it\.$/,
    );
    expect(reason).not.toContain('Question section');
  });

  it('leaves a protected path outside patch_paths to the owner, and the patch file to the character', () => {
    expect(reasonOf('Write', { file_path: '.npmrc', content: 'x' })).toMatch(
      /Question section.*Do not try another way around it/,
    );
    expect(reasonOf('Write', { file_path: 'elvaria.patch', content: 'diff --git' })).toBeUndefined();
  });

  it('sends the change to the owner when the policy names no patch file', () => {
    ctx = {
      ...ctx,
      laws: compileLaws({ ...DC1_LAWS, patch_paths: ['.husky/**'] }, { cliProtected: ['.husky/**'] }),
    };
    expect(reasonOf('Write', { file_path: '.husky/pre-push', content: 'x' })).toMatch(/Question section/);
  });
});

describe("git's own folder (P1-49)", () => {
  it("refuses a Claude write tool in .git/ and on a worktree's .git file, not reads nor .gitignore", () => {
    // runner-claude's protected list has `.git/**`, which runner-core's policy file keeps for every tribe.
    ctx = { ...ctx, laws: compileLaws(DC1_LAWS, { cliProtected: ['.git/**', '.husky/**'] }) };
    for (const file of [`${PLOT}\\.git`, '.git/config', 'C:\\Users\\elvaria\\dc1-se-team\\.git\\HEAD']) {
      expect(reasonOf('Write', { file_path: file, content: 'x' })).toMatch(
        /^Elvaria rule: .*refuses to write .*\(\.git\/\*\*\); .*Question section/,
      );
    }
    expect(reasonOf('Write', { file_path: '.gitignore', content: 'x' })).toBeUndefined();
    expect(reasonOf('Read', { file_path: `${PLOT}/.git/HEAD` })).toBeUndefined();
    expect(reasonOf('Bash', { command: 'grep -r --exclude-dir=.git TODO .' })).toBeUndefined();
  });
});
