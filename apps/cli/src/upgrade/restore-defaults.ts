import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { inKingdom, kingdomLayout, writeFileAtomic } from '@elvaria/store';

import { backupStamp } from '../migrate/migrate.ts';
import type { KingdomContext } from '../kingdom-context.ts';

async function savedFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return savedFiles(path.join(dir, entry.name), `${relative}/`);
      return entry.isFile() ? [relative] : [];
    }),
  );
  return files.flat().sort();
}

/** Only this switch's backup is eligible; an unrelated newer backup must never win. */
export async function restoreDefaults(ctx: KingdomContext, switchedAt: string): Promise<void> {
  const backup = kingdomLayout.backup(`${backupStamp(switchedAt)}-registry`);
  const dir = inKingdom(ctx.store.root, `${backup}/registry`);
  const files = await savedFiles(dir).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  });
  if (files.length === 0) {
    ctx.io.out(ctx.t('cli.upgrade.rollback_no_defaults', { backup }));
    return;
  }
  ctx.io.out(ctx.t('cli.upgrade.rollback_defaults', { backup }));
  for (const file of files) {
    const relative = kingdomLayout.registryEntry(file);
    await writeFileAtomic(inKingdom(ctx.store.root, relative), await readFile(path.join(dir, file), 'utf8'));
    ctx.io.out(`  ${relative}`);
  }
}
