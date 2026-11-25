// The roles of the default classes: who judges, who keeps the scriptures, who heals, and what each may not do.
import { describe, expect, it } from 'vitest';

import { loadDefaultRegistry } from './index.ts';
import type { CharacterClass } from '@elvaria/domain';

function classes(): readonly CharacterClass[] {
  const result = loadDefaultRegistry();
  if (!result.ok) throw new Error(result.error.map((issue) => issue.code).join('\n'));
  return result.value.classes;
}

const classOf = (id: string): CharacterClass | undefined => classes().find((entry) => entry.id === id);
const shellOf = (entry: CharacterClass | undefined): string[] =>
  (entry?.tools.allow ?? []).filter((tool) => tool.startsWith('Bash('));

describe('the default classes', () => {
  it('has one judge for every kind, and keeps the judge and the monk from producing (ADR 0008, 0011)', () => {
    const result = loadDefaultRegistry();
    const kinds = result.ok ? result.value.kinds.map(({ id }) => id) : [];
    const verifiers = classes().filter((entry) => entry.is_verifier);
    expect(verifiers.map(({ id }) => id)).toEqual(['judge']);
    expect(verifiers[0]?.kinds).toEqual(kinds);
    for (const id of ['judge', 'monk']) {
      expect(classOf(id)?.tools.deny).toEqual(expect.arrayContaining(['Edit', 'Write']));
    }
  });

  it('has one healer, which takes no quest of its own and judges none (ADR 0034)', () => {
    const healers = classes().filter((entry) => entry.is_healer === true);
    expect(healers.map(({ id }) => id)).toEqual(['healer']);
    expect(healers[0]).toMatchObject({ kinds: [], is_verifier: false, is_monk: false });
  });

  it('lets the healer edit the staged work, never stage, commit, push, open the web or call an apprentice', () => {
    const healer = classOf('healer');
    expect(healer?.tools.allow).toEqual(expect.arrayContaining(['Read', 'Edit', 'Write', 'Glob', 'Grep']));
    expect(healer?.tools.deny).toEqual([
      'Bash(git add:*)',
      'Bash(git commit:*)',
      'Bash(git push:*)',
      'WebFetch',
      'Agent',
    ]);
    // The Steward commits through the hooks after the heal (ADR 0017): no tool of the healer writes to git.
    expect(healer?.tools.allow.filter((tool) => /git (?:add|commit|push)|Agent|WebFetch/.test(tool))).toEqual(
      [],
    );
  });

  it("runs only lint, typecheck, one package's commands and the frozen install, as the knight may", () => {
    const shell = shellOf(classOf('healer'));
    expect(shell).toEqual([
      'Bash(pnpm lint:*)',
      'Bash(pnpm typecheck:*)',
      'Bash(pnpm --filter:*)',
      'Bash(pnpm install --frozen-lockfile --prefer-offline)',
      'Bash(git status:*)',
      'Bash(git diff:*)',
    ]);
    expect(shellOf(classOf('knight'))).toEqual(expect.arrayContaining(shell));
  });
});
