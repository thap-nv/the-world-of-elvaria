import { describe, expect, it } from 'vitest';

import { judgedInScratch, ritualOf } from './ritual-of.ts';
import type { Registry } from '../schema/registry.ts';
import type { Kind, Ritual } from '../schema/registry-entries.ts';
import type { Quest } from '../schema/quest/quest.ts';

const ritual = (id: string) => ({ id }) as unknown as Ritual;
const kind = (id: string, own: string, overrides?: Kind['ritual_overrides']) =>
  ({
    id,
    ritual: own,
    ...(overrides === undefined ? {} : { ritual_overrides: overrides }),
  }) as unknown as Kind;
const tags = (...ids: string[]) => ids as unknown as Quest['tags'];
const overrides = [
  { tags_any: tags('e2e', 'integration'), ritual: 'mutation_check' },
  { tags_any: tags('db'), ritual: 'stress_test' },
] as unknown as Kind['ritual_overrides'];

const REGISTRY: Pick<Registry, 'kinds' | 'rituals'> = {
  kinds: [kind('build', 'build_review', overrides), kind('research', 'source_check')],
  rituals: ['build_review', 'source_check', 'mutation_check', 'stress_test'].map(ritual),
};

const quest = (kindId: string, ...ids: string[]): Pick<Quest, 'kind' | 'tags' | 'party_role'> => ({
  kind: kindId as Quest['kind'],
  tags: tags(...ids),
});

describe('ritualOf', () => {
  it("takes the kind's ritual when no override meets the quest's tags", () => {
    expect(ritualOf(quest('build', 'frontend'), REGISTRY)?.id).toBe('build_review');
    expect(ritualOf(quest('research', 'e2e'), REGISTRY)?.id).toBe('source_check');
  });

  it('takes the first override whose tags meet one of the quest tags', () => {
    expect(ritualOf(quest('build', 'integration'), REGISTRY)?.id).toBe('mutation_check');
    expect(ritualOf(quest('build', 'db', 'e2e'), REGISTRY)?.id).toBe('mutation_check');
    expect(ritualOf(quest('build', 'db'), REGISTRY)?.id).toBe('stress_test');
  });

  it("keeps the blind trial's acceptance part on its kind's ritual, the merge quest taking the overrides (P1-21)", () => {
    expect(ritualOf({ ...quest('build', 'e2e'), party_role: 'acceptance' }, REGISTRY)?.id).toBe(
      'build_review',
    );
    expect(ritualOf({ ...quest('build', 'e2e'), party_role: 'merge' }, REGISTRY)?.id).toBe('mutation_check');
  });

  it('judges in a scratch plot only under a ritual that asks for one, on a git worktree', () => {
    const scratch = {
      ...REGISTRY,
      rituals: [{ id: 'mutation_check', scratch_plot: true } as unknown as Ritual],
    };
    const worktree = { type: 'worktree', path: 'D:/r/.elvaria/worktrees/q', branch: 'quest/q' } as const;
    const folder = { type: 'folder', path: 'quests/q/work' } as const;
    expect(judgedInScratch({ ...quest('build', 'e2e'), plot: worktree }, scratch)).toBe(true);
    expect(judgedInScratch({ ...quest('build', 'e2e'), plot: folder }, scratch)).toBe(false);
    expect(judgedInScratch({ ...quest('build', 'e2e'), plot: worktree }, REGISTRY)).toBe(false);
    expect(judgedInScratch({ ...quest('build'), plot: worktree }, scratch)).toBe(false);
  });

  it('finds nothing for a kind or a ritual the registry lacks', () => {
    expect(ritualOf(quest('dance'), REGISTRY)).toBeUndefined();
    expect(ritualOf(quest('build', 'e2e'), { ...REGISTRY, rituals: [] })).toBeUndefined();
  });
});
