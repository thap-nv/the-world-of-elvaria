// The judge of tests as the product (ADR 0022, P1-20): its tags choose mutation_check, it works in a scratch plot on
// a git territory and reads the four trial steps; on a folder it judges as any judge.
import { QuestSchema } from '@elvaria/domain';
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
import { buildPrompt } from './build-prompt.ts';
import { loadPromptTemplates } from './templates.ts';
import type { VerifierPromptInput } from './build-prompt.ts';
import type { BuiltPrompt } from '../runner/types.ts';
import type { Registry } from '@elvaria/domain';

const templates = await loadPromptTemplates();
const show = ({ system, user }: BuiltPrompt) => `=== system ===\n${system}\n\n=== user ===\n${user}\n`;

const verifier: VerifierPromptInput = {
  role: 'verifier',
  locale: 'vi',
  decree: null,
  quest: QUEST,
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
};

/** A build quest tagged e2e, judged by mutation_check in a scratch plot. */
const trial: VerifierPromptInput = {
  ...verifier,
  quest: QuestSchema.parse({ ...QUEST, kind: 'build', class_required: 'knight', tags: ['e2e'] }),
};

describe('the verifier prompt of tests as the product', () => {
  it('verifier-scratch breaks what the tests guard in its scratch plot', async () => {
    await expect(show(buildPrompt(trial, templates))).toMatchFileSnapshot(
      '__snapshots__/verifier-scratch.txt',
    );
  });

  it('gives the judge its scratch plot, the trial steps and git to undo its breaks', () => {
    const { system, user } = buildPrompt(trial, templates);
    expect(system).toContain('you work in a scratch plot');
    expect(system).not.toContain('you have no Edit or Write');
    expect(system).toContain('- `git restore`');
    expect(user).toContain('Loose a monster on the walls (`mutation_check`)');
    for (const step of ['rerun_clean', 'flake_check', 'coverage_not_lower', 'break_and_expect_red'])
      expect(user).toContain(`. ${step}\n`);
  });

  it('asks the judge to name its breaks, and for notes on every pass (P1-40)', () => {
    const { system, user } = buildPrompt(trial, templates);
    expect(user).toContain("Name every break in the verdict's `breaks`: `change`");
    expect(user).toContain('The Steward takes a `pass` with fewer than two breaks as `partial`');
    expect(user).toContain('or a command does not start, quote its error in your notes and give `partial`');
    expect(system).toContain('the Steward refuses a pass without notes');
  });

  it('judges on a folder as any judge, without a scratch plot', () => {
    const quest = { ...trial.quest, plot: { type: 'folder' as const, path: 'quests/q/work' } };
    const { system, user } = buildPrompt({ ...trial, quest }, templates);
    expect(system).toContain('you have no Edit or Write');
    expect(user).toContain('(`mutation_check`)');
  });

  it('fails loudly on a kind the registry does not have', () => {
    const registry: Registry = { ...REGISTRY, kinds: [] };
    expect(() => buildPrompt({ ...verifier, registry }, templates)).toThrow('no ritual for kind "build"');
    const empty: Registry = { ...REGISTRY, rituals: [] };
    expect(() => buildPrompt({ ...verifier, registry: empty }, templates)).toThrow('no ritual for kind');
  });
});
