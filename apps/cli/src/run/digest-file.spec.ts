import { translator } from '@elvaria/i18n';
import { inKingdom, readTextFile } from '@elvaria/store';
import { tempDir } from '@elvaria/testkit';
import { expect, it } from 'vitest';

import { fileDigest } from './digest-file.ts';

it('writes the daily heal summary passed by the Steward', async () => {
  const temp = await tempDir('digest heals');
  try {
    const port = fileDigest(translator('en'), temp.root, 'Elvaria');
    const file = await port.write({
      day: '2026-11-07',
      items: [],
      heals: { total: 1, healed: 1 },
      carried_red: 2,
    });
    expect(await readTextFile(inKingdom(temp.root, file))).toBe(
      '# Digest 2026-11-07 · Elvaria\n\nNothing waits for you.\nHeals: 1 total, 1 healed.\n' +
        'Carried then red: 2 checks carried on the same tree failed at patrol; review K3/K7 of plans/recheck.md.\n',
    );
  } finally {
    await temp.remove();
  }
});
