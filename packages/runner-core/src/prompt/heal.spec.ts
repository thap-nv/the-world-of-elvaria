// A healer's session and its judge (ADR 0034, plans/healer.md 4.4, HL-05): the healer reads the doer's refused work,
// staged, with its part and its limits, in place of revive.md, the hooks' log after it; the judge of a healed run
// reads heal.patch, at most 60 lines, after the protected paths and before the diff.
import { describe, expect, it } from 'vitest';

import {
  CHECKS,
  DIFF,
  LETTER,
  QUEST,
  REGISTRY,
  SABLE,
  TERRITORY,
  classPromptOf,
} from '../__fixtures__/world.ts';
import { toolPolicyOf } from '../policy/tool-policy.ts';
import { continuationBlock } from './blocks.ts';
import { buildPrompt } from './build-prompt.ts';
import { HEAL_PATCH_MAX_LINES, healPatchBlock } from './heal.ts';
import { loadPromptTemplates } from './templates.ts';
import type { VerifierPromptInput } from './build-prompt.ts';
import type { HealPatch } from './heal.ts';

const templates = await loadPromptTemplates();
const memory = { handover: LETTER, journal: [], git_log: null };
const HOOK_SAID = 'src/app.ts\n  3:5  error  `unused` is never used  no-unused-vars';
const HEAL = {
  assignee: 'thorn',
  reason: 'breaker:commit_errors',
  staged: ['src/app.ts', 'src/new.ts'],
  max_files: 8,
  max_lines: 60,
} as const;
const PATCH: HealPatch = {
  healer: 'mira',
  patch:
    'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -3 +2,0 @@\n-let unused;\n',
};

describe("a healer's continuation", () => {
  const text = continuationBlock(
    QUEST,
    TERRITORY,
    { reason: 'heal', heal: HEAL, refused_commit: HOOK_SAID, ...memory },
    templates,
  );

  it("names the doer's work, its staged files and the limits, then the hooks' log and the letter", () => {
    expect(text).toContain('# The work you mend');
    expect(text).toContain('thorn finished this quest');
    expect(text).toContain('(`breaker:commit_errors`)');
    expect(text).toContain('- `src/app.ts`\n- `src/new.ts`');
    expect(text).toContain('at most 8 files and 60 lines');
    expect(text).toContain('Do not stage, commit or push');
    expect(text).toContain('add a section `## Heal` at the end of the handover letter');
    expect(text.indexOf('# The work you mend')).toBeLessThan(text.indexOf('## The commit that was refused'));
    expect(text).toContain(HOOK_SAID);
    expect(text).not.toContain('# Picking up the quest');
    expect(text).not.toContain('{{');
  });

  it('says so when the work staged no file', () => {
    const none = continuationBlock(
      QUEST,
      TERRITORY,
      { reason: 'heal', heal: { ...HEAL, staged: [] }, ...memory },
      templates,
    );
    expect(none).toContain('- (none)');
  });
});

const judge = (heal?: HealPatch | null): VerifierPromptInput => ({
  role: 'verifier',
  locale: 'en',
  decree: null,
  quest: { ...QUEST, protected_changes: ['CLAUDE.md'] },
  character: SABLE,
  territory: TERRITORY,
  registry: REGISTRY,
  scriptures: [],
  gazetteer: null,
  class_prompt: classPromptOf('judge'),
  handover: LETTER,
  diff: DIFF,
  partial: null,
  checks: CHECKS,
  ...(heal === undefined ? {} : { heal_patch: heal }),
});

describe("the healer's change in the judge's prompt", () => {
  it('comes after the protected paths and before the diff, fenced as a diff', () => {
    const { user } = buildPrompt(judge(PATCH), templates);
    const section = user.indexOf("# The healer's change");
    expect(section).toBeGreaterThan(user.indexOf('# Protected paths changed'));
    expect(section).toBeLessThan(user.indexOf('# Diff'));
    expect(user).toContain('mira, a healer, mended it');
    expect(user).toContain('```diff\ndiff --git a/src/app.ts b/src/app.ts');
    expect(user).toContain('fails the quest as `unsafe`');
  });

  it('copies at most 60 lines and says the diff has the rest', () => {
    const long = Array.from({ length: 75 }, (_, index) => `+line ${String(index)}`).join('\n');
    const block = healPatchBlock({ healer: 'mira', patch: long }, 'thorn', templates);
    expect(block).toContain(
      `+line ${String(HEAL_PATCH_MAX_LINES - 1)}\n… 15 more lines: the diff below has them`,
    );
    expect(block).not.toContain(`+line ${String(HEAL_PATCH_MAX_LINES)}\n`);
  });

  it('says nothing for a run no healer mended, nor for an empty patch', () => {
    const plain = buildPrompt(judge(), templates).user;
    expect(plain).not.toContain("healer's change");
    expect(buildPrompt(judge(null), templates).user).toBe(plain);
    expect(healPatchBlock({ healer: 'mira', patch: '\n' }, 'thorn', templates)).toBe('');
  });
});

// The healer's tools are its class's data (plans/healer.md 4.4, HL-03); its shell reruns the territory's own checks,
// as a knight's does, and never stages or commits (mục 5 of the HL-05 brief).
describe("a healer's tool policy", () => {
  const healer = REGISTRY.classes.find((entry) => entry.id === 'healer')!;
  const policy = toolPolicyOf({ role: 'assignee', characterClass: healer, territory: TERRITORY });

  it("allows the territory's checks and its lint and typecheck, and denies git add, commit and push", () => {
    expect(policy.allow).toEqual(
      expect.arrayContaining([
        'Bash(pnpm lint:*)',
        'Bash(pnpm -r test:*)',
        'Bash(pnpm typecheck:*)',
        'Bash(git diff:*)',
      ]),
    );
    expect(policy.allow).not.toContain('Bash(pnpm e2e:*)');
    expect(policy.deny).toEqual(
      expect.arrayContaining([
        'Bash(git add:*)',
        'Bash(git commit:*)',
        'Bash(git push:*)',
        'WebFetch',
        'Agent',
      ]),
    );
    expect(policy.apprentice).toBeNull();
  });
});
