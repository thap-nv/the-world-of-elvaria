import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { RM_TEMP } from '@elvaria/testkit';
import { describe, expect, it } from 'vitest';

import { tempKingdom } from '../__fixtures__/kingdom.ts';
import { RM_RETRY } from './remove.ts';

describe('RM_RETRY (P1-39)', () => {
  it('removes a whole tree, and a tree already gone, without an error', async () => {
    const kingdom = await tempKingdom();
    const build = path.join(kingdom.root, '.builds', 'abc');
    await mkdir(path.join(build, 'node_modules', 'x'), { recursive: true });
    await writeFile(path.join(build, 'node_modules', 'x', 'index.js'), '');
    await rm(build, RM_RETRY);
    expect(existsSync(build)).toBe(false);
    await expect(rm(build, RM_RETRY)).resolves.toBeUndefined();
    await kingdom.remove();
  });

  // testkit may import no workspace (K6), so its copy for specs is a second copy: this keeps the two equal (R7).
  it("matches testkit's RM_TEMP, its copy for specs", () => {
    expect(RM_RETRY).toEqual(RM_TEMP);
  });
});
