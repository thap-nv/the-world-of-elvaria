import { describe, expect, it } from 'vitest';

import { scriptParamsIssues } from './params.ts';
import type { CatalogScript } from '../schema/registry-entries.ts';

/** The params_schema of link-check in the default catalog. */
const LINKS = {
  id: 'link-check',
  params_schema: {
    type: 'object',
    required: ['globs'],
    properties: { globs: { type: 'array', items: { type: 'string' }, minItems: 1 } },
    additionalProperties: false,
  },
} as unknown as Pick<CatalogScript, 'id' | 'params_schema'>;

describe('scriptParamsIssues', () => {
  it('lets params that fit through', () => {
    expect(scriptParamsIssues(LINKS, { globs: ['docs/**/*.md'] })).toEqual([]);
  });

  it.each([
    [{}, 'params.globs'],
    [{ globs: [] }, 'params.globs'],
    [{ globs: [3] }, 'params.globs.0'],
    [{ globs: ['a'], depth: 2 }, 'params'],
    ['docs', 'params:'],
  ])('names what does not fit in %j', (params, where) => {
    const issues = scriptParamsIssues(LINKS, params);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join('\n')).toContain(where);
  });

  it('refuses every params when the catalog entry has a schema zod cannot read', () => {
    const broken = { id: 'link-check', params_schema: { type: 'frob' } } as unknown as typeof LINKS;
    expect(scriptParamsIssues(broken, {})).toEqual([
      expect.stringContaining(
        'the params_schema of link-check cannot be read: Error: Unsupported type: frob',
      ),
    ]);
  });
});
