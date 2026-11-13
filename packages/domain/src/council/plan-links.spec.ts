import { describe, expect, it } from 'vitest';

import { subquest } from './__fixtures__/drafts.ts';
import { planIssuesOf } from './plan-issues.ts';
import { planLinksOf } from './plan-links.ts';
import type { FileLink } from '../graph/links.ts';
import type { PlanGraph } from './plan-links.ts';

/** A glob test good enough for the specs: `<folder>/**` or the path itself. */
const covers = (path: string, globs: readonly string[]): boolean =>
  globs.some((glob) => (glob.endsWith('/**') ? path.startsWith(glob.slice(0, -2)) : path === glob));

const graphOf = (links: readonly FileLink[], shared: readonly string[] = []): PlanGraph => ({
  territory: 'elvaria',
  links,
  shared,
  covers,
});

const CALL = { from: 'apps/cli/src/say/say.ts', to: 'packages/chancellor/src/commands.ts' };

describe('planLinksOf (the code graph in the plan review, PS-21b)', () => {
  it('warns of two parts that may run at once, scopes apart, whose code calls across; the plan stays ready', () => {
    const cli = subquest('d1', ['apps/cli/**']);
    const chancellor = subquest('d2', ['packages/chancellor/**']);
    const back = { from: 'packages/chancellor/src/session.ts', to: 'apps/cli/src/say/hearing.ts' };
    expect(planLinksOf([cli, chancellor], graphOf([CALL, back, CALL]))).toEqual([
      { ref: 'd1', other: 'd2', from: CALL.from, to: CALL.to, count: 3 },
    ]);
    // The machine half finds nothing wrong: the warning is for the judge alone.
    expect(planIssuesOf([cli, chancellor], { territories: [], context_budget_tokens: 120_000 })).toEqual([]);
  });

  it('says nothing of parts in a row, parts whose scopes meet, or code linked within one part', () => {
    const cli = subquest('d1', ['apps/cli/**']);
    const after = subquest('d2', ['packages/chancellor/**'], { depends_on_refs: ['d1'] });
    expect(planLinksOf([cli, after], graphOf([CALL]))).toEqual([]);
    const before = subquest('d1', ['apps/cli/**'], { depends_on_refs: ['d2'] });
    expect(planLinksOf([before, subquest('d2', ['packages/chancellor/**'])], graphOf([CALL]))).toEqual([]);
    const wide = subquest('d2', ['apps/**', 'packages/chancellor/**']);
    expect(planLinksOf([cli, wide], graphOf([CALL]))).toEqual([]);
    const inside = { from: 'apps/cli/src/say/say.ts', to: 'apps/cli/src/say/hearing.ts' };
    expect(planLinksOf([cli, subquest('d2', ['packages/chancellor/**'])], graphOf([inside]))).toEqual([]);
  });

  it('weighs only session parts with a scope on the graph’s territory, and no link through a shared path', () => {
    const chancellor = subquest('d2', ['packages/chancellor/**']);
    const elsewhere = subquest('d1', ['apps/cli/**'], { territory: 'dc1' });
    expect(planLinksOf([elsewhere, chancellor], graphOf([CALL]))).toEqual([]);
    const script = subquest('d1', ['apps/cli/**'], {
      tier: 'script',
      script: { id: 'count-files', params: {} },
    });
    expect(planLinksOf([script, chancellor], graphOf([CALL]))).toEqual([]);
    expect(planLinksOf([subquest('d1', []), chancellor], graphOf([CALL]))).toEqual([]);
    const index = { from: 'apps/cli/src/say/say.ts', to: 'packages/chancellor/src/index.ts' };
    const shared = graphOf([index], ['packages/chancellor/src/index.ts']);
    expect(planLinksOf([subquest('d1', ['apps/cli/**']), chancellor], shared)).toEqual([]);
    expect(planLinksOf([subquest('d1', ['apps/cli/**']), chancellor], graphOf([]))).toEqual([]);
  });

  it('names each linked pair once, in the order the graph first links them', () => {
    const drafts = [
      subquest('d1', ['apps/cli/**']),
      subquest('d2', ['packages/chancellor/**']),
      subquest('d3', ['packages/domain/**']),
    ];
    const domain = { from: 'packages/domain/src/a.ts', to: 'apps/cli/src/x.ts' };
    expect(planLinksOf(drafts, graphOf([domain, CALL, domain]))).toEqual([
      { ref: 'd3', other: 'd1', from: domain.from, to: domain.to, count: 2 },
      { ref: 'd1', other: 'd2', from: CALL.from, to: CALL.to, count: 1 },
    ]);
  });
});
