import { describe, expect, it } from 'vitest';

import { DECREE, classPromptOf } from '../__fixtures__/world.ts';
import { buildTemplePrompt } from './temple.ts';
import { loadPromptTemplates } from './templates.ts';
import type { TempleContext } from './temple.ts';

const templates = await loadPromptTemplates();

const context: TempleContext = {
  locale: 'vi',
  decree: null,
  class_prompt: classPromptOf('monk'),
  trigger: 'suspension',
  evidence: {
    groups: [
      {
        group: 'tests_fail',
        members: [
          {
            verdict: 'q_20261106_7k3m2a-1',
            quest: 'q_20261106_7k3m2a',
            n: 1,
            class: 'knight',
            tribe: 'claude',
            model: 'claude-sonnet-5-5',
            territory: 'dc1-se-team',
            tags: [],
            lessons: ['L_20261106_4k2pqz'],
            notes: 'pnpm test fails in packages/api: the new handler has no test.',
          },
        ],
      },
    ],
    lines: [
      {
        ref: 'L_20261106_4k2pqz',
        owner: 'temple',
        source: 'monk',
        scope: { role: ['assignee'] },
        fail_kind: 'tests_fail',
        text: 'Run the tests of the touched package before you hand in.',
        loads: 22,
        helped: 3,
        missed: 4,
      },
    ],
    reviews: ['L_20261106_4k2pqz'],
    checks: { 'dc1-se-team': ['test', 'lint'] },
    scripts: ['bump-version'],
    dropped: [],
    // Branded ids, written as the pack carries them.
  } as unknown as TempleContext['evidence'],
  vocabulary: { classes: ['knight', 'judge'], tribes: ['claude'], territories: ['dc1-se-team'], tags: [] },
};

describe('buildTemplePrompt (PS-12f)', () => {
  it('snapshot', async () => {
    const { system, user } = buildTemplePrompt(context, templates);
    await expect(`=== system ===\n${system}\n\n=== user ===\n${user}\n`).toMatchFileSnapshot(
      '__snapshots__/temple.txt',
    );
  });

  it('opens with the royal decree when there is one, and says why the Temple runs', () => {
    const plain = buildTemplePrompt(context, templates);
    const decreed = buildTemplePrompt({ ...context, decree: DECREE }, templates);
    expect(decreed.user).toBe(plain.user);
    expect(decreed.system.endsWith(plain.system)).toBe(true);
    expect(decreed.system.length).toBeGreaterThan(plain.system.length);
    expect(buildTemplePrompt({ ...context, trigger: 'owner' }, templates).user).toContain(
      '# Why the Temple runs\n\nThe owner asked for this run.',
    );
  });

  it('asks for the letters in the owner’s language and the lessons in English, under the caps', () => {
    const { system } = buildTemplePrompt(context, templates);
    expect(system).toContain('a sentence or two in Vietnamese');
    expect(system).toContain('one line of at most 300 characters');
    expect(system).toContain('At most 3 lessons and 6 letters in one reply.');
    expect(buildTemplePrompt({ ...context, locale: 'en' }, templates).system).toContain(
      'a sentence or two in English',
    );
  });

  it('carries the pack as JSON and names the ids a scope may use, or none', () => {
    const { user } = buildTemplePrompt(context, templates);
    expect(user).toContain('"notes":"pnpm test fails in packages/api: the new handler has no test."}]}]');
    expect(user).toContain('- Classes: `knight`, `judge`');
    expect(user).toContain('- Tags: none');
  });
});
