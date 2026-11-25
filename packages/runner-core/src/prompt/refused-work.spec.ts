// What a session reads of the work the Steward could not take from the run before it: a refused patch (P1-31), or a
// commit git refused while the quest waited on the doer's amendment (fix/session-notes) or that went back for a heal
// (ADR 0034). Each reason is fenced, so
// a line it quotes is not read as the prompt's.
import { describe, expect, it } from 'vitest';

import { refusedCommitBlock, refusedPatchBlock, refusedWorkBlock } from './refused-work.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();

/** A hook's first lines, as commitPlot keeps them (hookOutputHead). */
const HOOK_SAID = 'husky - pre-commit script failed (code 1)\nsrc/app.ts:3:7 error no-unused-vars';
const PATCH_HEADING = '## The patch that was not applied';
const COMMIT_HEADING = '## The commit that was refused';

describe('refusedPatchBlock (P1-31)', () => {
  it("fences the Steward's reason, so a line of the patch it quotes is not read as the prompt's", () => {
    const block = refusedPatchBlock(
      '\nit does not apply: error: patch failed: .husky/pre-push:1\n',
      templates,
    );
    expect(block).toContain(PATCH_HEADING);
    expect(block).toContain('```text\nit does not apply: error: patch failed: .husky/pre-push:1\n```');
    expect(block).toContain('If `elvaria.patch` is still at the root of your plot, it is that patch.');
  });

  it('is empty when the last run had no patch refused', () => {
    expect(refusedPatchBlock(undefined, templates)).toBe('');
    expect(refusedPatchBlock(' \n', templates)).toBe('');
  });
});

describe('refusedCommitBlock (fix/session-notes)', () => {
  it('fences what git said, and says the work waits uncommitted in the plot', () => {
    const block = refusedCommitBlock(`\n${HOOK_SAID}\n`, templates);
    expect(block).toContain(COMMIT_HEADING);
    expect(block).toContain(`\`\`\`text\n${HOOK_SAID}\n\`\`\``);
    expect(block).toContain('That work is still in your plot, staged and uncommitted.');
    // A heal session (ADR 0034) mends only what the hooks named.
    expect(block).toContain('do not redo the work, and never turn a lint rule off or skip a hook');
    expect(block).not.toContain('{{');
  });

  it('is empty when the work was committed', () => {
    expect(refusedCommitBlock(undefined, templates)).toBe('');
    expect(refusedCommitBlock('  ', templates)).toBe('');
  });
});

describe('refusedWorkBlock', () => {
  it('says the patch first, as the Steward tries it first, and nothing when all was taken', () => {
    const both = refusedWorkBlock(
      { refused_patch: 'it does not apply', refused_commit: HOOK_SAID },
      templates,
    );
    expect(both.indexOf(PATCH_HEADING)).toBeGreaterThan(-1);
    expect(both.indexOf(PATCH_HEADING)).toBeLessThan(both.indexOf(COMMIT_HEADING));
    expect(refusedWorkBlock({ refused_commit: HOOK_SAID }, templates)).not.toContain(PATCH_HEADING);
    expect(refusedWorkBlock({}, templates)).toBe('');
  });
});
