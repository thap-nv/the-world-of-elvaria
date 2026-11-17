// The screens a judge reads (PS-11b): the policy opens exactly those of its review, for a judge only, and the policy
// file hands them to the hook, which refuses every other read outside the plot (owner's (Q2), (Q3)).
import { describe, expect, it } from 'vitest';

import { REGISTRY, TERRITORY } from '../__fixtures__/world.ts';
import { policyFileOf } from '../runner/policy-file.ts';
import { toolPolicyOf } from './tool-policy.ts';
import type { RunContext } from '../runner/run-context.ts';
import type { CharacterClass } from '@elvaria/domain';

const classOf = (id: string): CharacterClass => REGISTRY.classes.find((entry) => entry.id === id)!;
const CTX: RunContext = { character: 'sable', role: 'verifier', model: 'claude-sonnet-5-5' };
const HOME = 'D:\\Dummy\\Tool - Personal\\my kingdom\\.runs\\q_20261117_v1s10n-1\\screens\\home.png';
const REF = 'D:\\Dummy\\Tool - Personal\\my kingdom\\.runs\\q_20261117_v1s10n-1\\screens\\home.ref.png';

describe('toolPolicyOf: the screens of a review (PS-11b)', () => {
  it('opens them for a judge, each once, and nothing else of the run folder', () => {
    const policy = toolPolicyOf({
      role: 'verifier',
      characterClass: classOf('judge'),
      territory: TERRITORY,
      images: [HOME, REF, HOME],
    });
    expect(policy.images).toEqual([HOME, REF]);
    expect(policy.allow.join(' ')).not.toContain('.runs');
  });

  it('opens none for an assignee, nor for a judge without screens', () => {
    const assignee = toolPolicyOf({
      role: 'assignee',
      characterClass: classOf('knight'),
      territory: TERRITORY,
      images: [HOME],
    });
    expect(assignee).not.toHaveProperty('images');
    const judge = toolPolicyOf({ role: 'verifier', characterClass: classOf('judge'), territory: TERRITORY });
    expect(judge).not.toHaveProperty('images');
  });

  it('hands them to the hook through the policy file only when there are some', () => {
    const judge = (images: string[]) =>
      toolPolicyOf({ role: 'verifier', characterClass: classOf('judge'), territory: TERRITORY, images });
    expect(policyFileOf(CTX, judge([HOME])).images).toEqual([HOME]);
    expect(policyFileOf(CTX, judge([]))).not.toHaveProperty('images');
  });
});
