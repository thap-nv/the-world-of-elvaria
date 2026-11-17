import { fileURLToPath } from 'node:url';

import { cruise } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

import { depcruiseConfig } from './depcruise.mjs';
import { WORKSPACES } from './boundaries.mjs';

// A fake repo with one planted violation per rule, next to imports that must stay allowed.
const FIXTURE = fileURLToPath(new URL('__fixtures__/repo', import.meta.url));

/** `rule: from -> to`, with npm paths shortened to the package name so the list is stable. */
async function violations(): Promise<string[]> {
  const { forbidden, options } = depcruiseConfig();
  const result = await cruise(['packages'], {
    ...options,
    baseDir: FIXTURE,
    validate: true,
    ruleSet: { forbidden: forbidden ?? [] },
  });
  if (typeof result.output === 'string') throw new Error('expected a cruise result, got reporter text');
  const npmName = /^.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\/.*$/;
  return result.output.summary.violations
    .map(({ rule, from, to }) => `${rule.name}: ${from} -> ${to.replace(npmName, '$1')}`)
    .sort();
}

describe('depcruiseConfig', () => {
  it('reports exactly the planted violations', async () => {
    expect(await violations()).toEqual(
      [
        'boundary-domain: packages/domain/src/peek.ts -> packages/store/src/index.ts',
        'boundary-herald: packages/herald/src/index.ts -> packages/steward/src/index.ts',
        'dev-only-workspace-at-runtime: packages/eventlog/src/index.ts -> packages/config/boundaries.mjs',
        'domain-no-io: packages/domain/src/quest.ts -> fs',
        'hooks-fast-start: packages/hooks/elvaria-hook.mjs -> child_process',
        'no-circular: packages/domain/src/cycle-a.ts -> packages/domain/src/cycle-b.ts',
        'no-dev-dependency-at-runtime: packages/store/src/index.ts -> vitest',
        'no-relative-import-across-workspaces: packages/domain/src/peek.ts -> packages/store/src/index.ts',
        'no-relative-import-across-workspaces: packages/eventlog/src/index.ts -> packages/config/boundaries.mjs',
        'no-relative-import-across-workspaces: packages/herald/src/index.ts -> packages/steward/src/index.ts',
        'no-relative-import-across-workspaces: packages/store/src/index.ts -> packages/domain/src/quest.ts',
        'not-in-package-json: packages/eventlog/src/index.ts -> vitest',
        'not-to-unresolvable: packages/store/src/missing.ts -> ./gone.ts',
      ].sort(),
    );
  });

  it('excludes a workspace dist/ or coverage/ folder by its own name, and no npm package (151)', () => {
    const { exclude } = depcruiseConfig().options ?? {};
    const path = typeof exclude === 'object' && 'path' in exclude ? exclude.path : undefined;
    const pattern = new RegExp([path ?? []].flat().join('|'));
    const excluded = (file: string): boolean => pattern.test(file);
    expect(
      ['packages/domain/coverage', 'packages/domain/coverage/.tmp', 'apps/cli/dist'].map(excluded),
    ).toEqual([true, true, true]);
    expect(
      [
        'packages/domain/src/coverage.ts',
        'packages/domain/coverage-notes.md',
        'node_modules/.pnpm/zod@4.1.0/node_modules/zod/dist/index.js',
      ].map(excluded),
    ).toEqual([false, false, false]);
  });

  it('has one boundary rule per workspace', () => {
    const names = (depcruiseConfig().forbidden ?? []).map((rule) => rule.name);
    const expected = Object.keys(WORKSPACES).map((key) => `boundary-${key}`);
    expect(names.filter((name) => name?.startsWith('boundary-'))).toEqual(expected);
  });
});
