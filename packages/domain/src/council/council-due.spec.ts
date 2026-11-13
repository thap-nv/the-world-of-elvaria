import { describe, expect, it } from 'vitest';

import { CouncilSchema } from '../schema/council.ts';
import { areasOf, councilDue } from './council-due.ts';
import type { CouncilDraft } from './council-due.ts';

const COUNCIL = CouncilSchema.parse({});

const draft = (tags: readonly string[], scope?: readonly string[], fields: Partial<CouncilDraft> = {}) => ({
  rank: 'D' as const,
  tags,
  tier: 'session' as const,
  territory: 'dc1',
  ...(scope === undefined ? {} : { scope_paths: scope }),
  ...fields,
});

describe('councilDue (ADR 0028, PS-06)', () => {
  it('defaults to rank B, or two tags over two areas', () => {
    expect(COUNCIL).toEqual({ from_rank: 'B', from_areas: 2 });
  });

  it('keeps small work out: one tag, below rank B', () => {
    expect(councilDue([draft(['backend'], ['apps/api/**'])], COUNCIL)).toBe(false);
    expect(
      councilDue([draft(['backend'], ['apps/api/**']), draft(['backend'], ['apps/web/**'])], COUNCIL),
    ).toBe(false);
  });

  it('takes work from rank B, a session one; a script costs no session to plan', () => {
    expect(councilDue([draft(['docs'], undefined, { rank: 'B' })], COUNCIL)).toBe(true);
    expect(councilDue([draft(['docs'], undefined, { rank: 'C' })], { ...COUNCIL, from_rank: 'C' })).toBe(
      true,
    );
    expect(councilDue([draft(['docs'], undefined, { rank: 'S', tier: 'script' })], COUNCIL)).toBe(false);
  });

  it('takes two tags over two areas, and not two tags in one area', () => {
    const apart = [draft(['backend'], ['apps/api/**']), draft(['frontend'], ['apps/web/**'])];
    expect(councilDue(apart, COUNCIL)).toBe(true);
    expect(councilDue([draft(['backend', 'frontend'], ['apps/api/**', 'apps/web/**'])], COUNCIL)).toBe(true);
    expect(
      councilDue([draft(['backend', 'i18n'], ['apps/api/src/**', 'apps/api/src/i18n/**'])], COUNCIL),
    ).toBe(false);
    expect(councilDue(apart, { ...COUNCIL, from_areas: 3 })).toBe(false);
  });

  it('counts a draft without a scope as its whole territory, and each territory as an area', () => {
    expect(councilDue([draft(['backend']), draft(['frontend'], ['apps/web/**'])], COUNCIL)).toBe(false);
    const twoLands = [draft(['backend']), draft(['docs'], undefined, { territory: 'handbook' })];
    expect(councilDue(twoLands, COUNCIL)).toBe(true);
  });

  it('counts no area for the shared paths: hot files belong to every quest', () => {
    const glossary = 'packages/i18n/src/glossary.json';
    const withHot = [draft(['backend'], ['apps/cli/**']), draft(['i18n'], [glossary])];
    expect(areasOf(withHot, () => [])).toBe(2);
    expect(areasOf(withHot, () => [glossary])).toBe(1);
    expect(councilDue(withHot, COUNCIL, () => [glossary])).toBe(false);
    expect(areasOf([draft(['i18n'], [glossary])], () => [glossary])).toBe(1);
  });

  it('joins the globs that meet into one area, through a third that meets both', () => {
    const chained = [draft(['a'], ['apps/a/**']), draft(['b'], ['apps/b/**']), draft(['c'], ['apps/**'])];
    expect(areasOf(chained, () => [])).toBe(1);
  });
});
