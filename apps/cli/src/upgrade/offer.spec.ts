// A newer build to offer in the digest (PS-08d): commits on the source repo's main that touch packages/ or apps/
// since the pinned commit; none for a change of docs alone, none without a pin, and none once `upgrade` pinned the tip.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writePin } from '../../test/builds.ts';
import { foundKingdom, git, gitRepo, tempDir, testIo } from '../../test/cli.ts';
import { upgradeOffer } from './offer.ts';
import type { TempDir } from '../../test/cli.ts';

describe('the newer build the digest offers', () => {
  let dir: TempDir;
  let kingdom: string;
  let source: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    source = await gitRepo(path.join(dir.root, 'elvaria source'));
  });
  afterEach(() => dir.remove());

  /** Writes `file` in the source repo and commits it; the commit id. */
  async function commit(file: string): Promise<string> {
    await mkdir(path.dirname(path.join(source, file)), { recursive: true });
    await writeFile(path.join(source, file), `${file}\n`);
    git(source, '-c', 'core.autocrlf=false', 'add', '--all');
    git(source, 'commit', '-q', '-m', `add ${file}`);
    return git(source, 'rev-parse', 'HEAD');
  }

  const offer = () => upgradeOffer(testIo(), kingdom, source);

  it('counts the commits that touch the code since the pin, and has none once the tip is pinned', async () => {
    const pinned = await commit('apps/cli/src/cli.ts');
    expect(await offer()).toBeUndefined();
    await writePin(kingdom, pinned);
    expect(await offer()).toBeUndefined();
    await commit('docs/guide.md');
    expect(await offer()).toBeUndefined();
    await commit('packages/domain/src/a.ts');
    const latest = await commit('apps/cli/src/b.ts');
    expect(await offer()).toEqual({ pinned, latest, commits: 2 });
    // After `elvaria upgrade`: the tip is the pin.
    await writePin(kingdom, latest, pinned);
    expect(await offer()).toBeUndefined();
  });

  it('offers nothing when git is not found or the source repo cannot say', async () => {
    const pinned = await commit('apps/cli/src/cli.ts');
    await writePin(kingdom, pinned);
    await commit('packages/domain/src/a.ts');
    expect(await upgradeOffer(testIo({ env: {} }), kingdom, source)).toBeUndefined();
    expect(await upgradeOffer(testIo(), kingdom, path.join(dir.root, 'not a repo'))).toBeUndefined();
  });
});
