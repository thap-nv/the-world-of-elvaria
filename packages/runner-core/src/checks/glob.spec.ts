import { describe, expect, it } from 'vitest';

import { coverOf, scopeCovers } from './glob.ts';

describe('coverOf and scopeCovers (PS-05, PS-21b)', () => {
  it('covers a path by its glob, or as a folder when the glob names one without a wildcard', () => {
    expect(coverOf('apps/web/**')('apps/web/src/x.ts')).toBe(true);
    expect(coverOf('./apps/web/')('apps/web/src/x.ts')).toBe(true);
    expect(coverOf('apps\\web')('Apps/Web/src/x.ts')).toBe(true);
    expect(coverOf('apps/**/*.tsx')('apps/web/src/page.tsx')).toBe(true);
    expect(coverOf('apps/web')('apps/website/x.ts')).toBe(false);
  });

  it('tests a path against several globs, each made once', () => {
    const covers = scopeCovers();
    const scope = ['packages/chancellor/**', 'docs/api.md'];
    expect(covers('docs/api.md', scope)).toBe(true);
    expect(covers('packages/chancellor/src/screen.ts', scope)).toBe(true);
    expect(covers('packages/domain/src/index.ts', scope)).toBe(false);
    expect(covers('docs/api.md', [])).toBe(false);
  });
});
