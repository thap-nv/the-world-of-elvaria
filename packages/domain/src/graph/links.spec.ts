import { describe, expect, it } from 'vitest';

import { impactOf } from './links.ts';

const inChancellor = (path: string): boolean => path.startsWith('packages/chancellor/');

describe('impactOf (PS-21b)', () => {
  it('counts each file outside the area that uses a file inside it once, sorted', () => {
    const links = [
      { from: 'apps/cli/src/say/say.ts', to: 'packages/chancellor/src/index.ts' },
      { from: 'apps/cli/src/say/say.ts', to: 'packages/chancellor/src/commands.ts' },
      { from: 'apps/cli/src/run/triage.ts', to: 'packages/chancellor/src/index.ts' },
      { from: 'apps/cli/src/say/hearing.ts', to: 'packages/chancellor/src/session.ts' },
    ];
    expect(impactOf(links, inChancellor)).toEqual([
      'apps/cli/src/run/triage.ts',
      'apps/cli/src/say/hearing.ts',
      'apps/cli/src/say/say.ts',
    ]);
  });

  it('leaves out the links inside the area and the ones from it to the outside', () => {
    const links = [
      { from: 'packages/chancellor/src/screen.ts', to: 'packages/chancellor/src/council.ts' },
      { from: 'packages/chancellor/src/screen.ts', to: 'packages/domain/src/index.ts' },
    ];
    expect(impactOf(links, inChancellor)).toEqual([]);
    expect(impactOf([], inChancellor)).toEqual([]);
  });
});
