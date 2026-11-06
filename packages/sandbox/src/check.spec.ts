import { describe, expect, it } from 'vitest';

import { KINGDOM, REGISTRY, kingdomOf } from './__fixtures__/kingdom.ts';
import { scenarioProblems } from './check.ts';
import { SCENARIOS } from './scenarios.ts';
import type { QuestTemplate, Scenario } from './scenario.ts';

const BUSY = SCENARIOS.busy;
const without = <T extends { readonly id: string }>(entries: readonly T[], id: string): T[] =>
  entries.filter((entry) => entry.id !== id);

describe('scenarioProblems', () => {
  it('finds nothing missing in the kingdom `elvaria init` writes', () => {
    for (const scenario of Object.values(SCENARIOS))
      expect(scenarioProblems(scenario, KINGDOM, REGISTRY)).toEqual([]);
  });

  it('names a tribe of the cast the kingdom lacks, once', () => {
    const kingdom = kingdomOf({ tribes: without(KINGDOM.tribes, 'gemini') });
    expect(scenarioProblems(BUSY, kingdom, REGISTRY)).toEqual([{ code: 'missing_tribe', id: 'gemini' }]);
  });

  it('names registry entries the scenario needs: class, kind, script and tag', () => {
    const registry = {
      ...REGISTRY,
      classes: without(REGISTRY.classes, 'scribe'),
      kinds: without(REGISTRY.kinds, 'integrate'),
      scripts: without(REGISTRY.scripts, 'count-files'),
      tags: without(REGISTRY.tags, 'e2e'),
    };
    expect(scenarioProblems(BUSY, KINGDOM, registry)).toEqual([
      { code: 'missing_entry', what: 'class', id: 'scribe' },
      { code: 'missing_entry', what: 'kind', id: 'integrate' },
      { code: 'missing_entry', what: 'tag', id: 'e2e' },
      { code: 'missing_entry', what: 'script', id: 'count-files' },
    ]);
  });

  it('names a class the kind does not allow, a script that does not serve the kind, and an unknown past tag', () => {
    const { cls: _cls, ...build } = BUSY.templates[0]!;
    const scripted: QuestTemplate = { ...build, script: 'link-check' };
    const scenario: Scenario = {
      ...BUSY,
      cast: [{ ...BUSY.cast[0]!, history: { verdicts: 1, pass: 1, tags: ['mobile'] } }],
      templates: [{ ...BUSY.templates[0]!, cls: 'scribe' }, scripted],
    };
    expect(scenarioProblems(scenario, KINGDOM, REGISTRY)).toEqual([
      { code: 'missing_entry', what: 'tag', id: 'mobile' },
      { code: 'not_allowed', kind: 'build', id: 'scribe' },
      { code: 'not_allowed', kind: 'build', id: 'link-check' },
    ]);
  });
});
