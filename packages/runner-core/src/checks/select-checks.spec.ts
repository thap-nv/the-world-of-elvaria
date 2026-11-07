import { describe, expect, it } from 'vitest';

import { TERRITORY } from '../__fixtures__/world.ts';
import { globToRegExp } from './glob.ts';
import { selectChecks } from './select-checks.ts';

describe('globToRegExp', () => {
  it.each([
    ['**/*.ts', 'src/a.ts', true],
    ['**/*.ts', 'a.ts', true],
    ['**/*.ts', 'src/a.tsx', false],
    ['src/**', 'src/deep/er/a.md', true],
    ['src/**', 'srcx/a.md', false],
    ['src/*.ts', 'src/deep/a.ts', false],
    ['**/*.yml', '.github/workflows/ci.yml', true],
    ['**', '.env.example', true],
    ['apps/web/src/routes/**', 'apps/web/src/routes/+page.svelte', true],
    ['{package.json,pnpm-lock.yaml}', 'pnpm-lock.yaml', true],
    ['**/{package.json,pnpm-lock.yaml}', 'packages/x/package.json', true],
    ['docs/?.md', 'docs/a.md', true],
    ['docs/?.md', 'docs/ab.md', false],
    ['[ab].md', 'b.md', true],
    ['[!ab].md', 'b.md', false],
    ['[ab.md', '[ab.md', true],
    ['./src/*.ts', 'src/a.ts', true],
    ['src\\*.ts', 'src/a.ts', true],
    ['SRC/*.TS', 'src/a.ts', true],
    ['{a,b', 'a', true],
    ['a+b(c).md', 'a+b(c).md', true],
  ])('%s matches %s: %s', (glob, touched, expected) => {
    expect(globToRegExp(glob).test(touched)).toBe(expected);
  });
});

describe('selectChecks', () => {
  const ids = (touched: string[]) => selectChecks(TERRITORY.checks, touched).map((check) => check.id);

  it("picks the checks whose globs match what the quest touched, in the territory's order", () => {
    expect(ids(['apps/web/src/routes/login.ts'])).toEqual(['lint', 'unit', 'e2e']);
    expect(ids(['apps/api/src/user.ts'])).toEqual(['lint', 'unit']);
    expect(ids(['packages/db/schema.ts'])).toEqual(['lint']);
  });

  it('runs nothing when nothing watched was touched', () => {
    expect(ids(['README.md', 'docs/testing.md'])).toEqual([]);
    expect(ids([])).toEqual([]);
  });

  it('reads touched paths written with backslashes or a leading ./', () => {
    expect(ids(['apps\\web\\src\\routes\\+page.svelte'])).toEqual(['e2e']);
    expect(ids(['./apps/api/x.ts'])).toEqual(['lint', 'unit']);
  });
});
