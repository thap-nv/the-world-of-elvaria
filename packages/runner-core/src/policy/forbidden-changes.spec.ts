// Which of a plot's changes break laws.forbidden_paths (P1-49, (b) of P1-46): matched as the hook matches a path, at
// any depth, in any case, so the Steward's check before a commit and the fence agree on what is forbidden.
import { describe, expect, it } from 'vitest';

import { TERRITORY } from '../__fixtures__/world.ts';
import { forbiddenChangesOf, forbiddenPathsOf } from './forbidden-changes.ts';

const DC1 = ['.env', '.env.*', 'infra/secrets/**'];

describe('forbiddenPathsOf', () => {
  it("is the dotenv files every territory forbids, then the territory's own, once each", () => {
    expect(forbiddenPathsOf()).toEqual(['.env', '.env.*']);
    // The fixture territory forbids `.env` and `infra/secrets/**` itself.
    expect(forbiddenPathsOf(TERRITORY)).toEqual(['.env', '.env.*', 'infra/secrets/**']);
  });
});

describe('forbiddenChangesOf', () => {
  it('keeps the changed paths a glob matches, in their order, and nothing else', () => {
    const changed = ['src/app.ts', 'infra/secrets/key.txt', 'docs/generated.md', '.env.local'];
    expect(forbiddenChangesOf(changed, DC1)).toEqual(['infra/secrets/key.txt', '.env.local']);
    expect(forbiddenChangesOf(['src/app.ts', '.gitignore', '.envrc'], DC1)).toEqual([]);
    expect(forbiddenChangesOf([], DC1)).toEqual([]);
  });

  it('matches at any depth and in any case, as the hook does, with either slash', () => {
    expect(forbiddenChangesOf(['apps/api/.env', 'apps\\web\\.ENV.production'], DC1)).toEqual([
      'apps/api/.env',
      'apps\\web\\.ENV.production',
    ]);
    expect(forbiddenChangesOf(['vendor/infra/secrets/a/b.pem', 'infra/secrets'], DC1)).toEqual([
      'vendor/infra/secrets/a/b.pem',
      'infra/secrets',
    ]);
    expect(forbiddenChangesOf(['infra/secretsx/a.txt', 'secrets/a.txt'], DC1)).toEqual([]);
  });
});
