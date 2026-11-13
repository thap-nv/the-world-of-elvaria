// The fourth tribe of the specs (PS-23): the owner adapter file fixtures/flint-adapter.mjs and its fake CLI
// fixtures/fake-flint.mjs, a CLI with hooks of its own that Elvaria's hook reads through the neutral dialect. Unlike
// lantern, flint's sessions run the real hook, the build `elvaria run` would start (`hookCommand` of @elvaria/hooks):
// `pnpm test` at the root builds it first (the hooks package's own test), and a spec run alone builds it here when it
// is missing or older than its source.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { HOOK_SCRIPT } from '@elvaria/hooks';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');
const PACKAGES = path.join(import.meta.dirname, '..', '..', '..', 'packages');

/** The fake flint CLI: a Node script, which the adapter starts with Elvaria's own Node. */
export const FAKE_FLINT = path.join(FIXTURES, 'fake-flint.mjs');
/** How kingdom.json names the adapter file. */
export const FLINT_ADAPTER = 'adapters/flint.mjs';

/** Puts the adapter file where an owner would, `<kingdom>/adapters/flint.mjs`. */
export async function installFlint(kingdom: string): Promise<void> {
  await mkdir(path.join(kingdom, 'adapters'), { recursive: true });
  await copyFile(path.join(FIXTURES, 'flint-adapter.mjs'), path.join(kingdom, 'adapters', 'flint.mjs'));
}

const newest = (folder: string): number =>
  Math.max(
    ...readdirSync(folder, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => statSync(path.join(folder, file)).mtimeMs),
  );

const builtAt = (file: string): number => {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/** Builds the event log and the hook, as `pnpm --filter @elvaria/hooks build` does, unless the build is current. */
export function ensureHookBuilt(): void {
  const sources = Math.max(
    newest(path.join(PACKAGES, 'hooks', 'src')),
    newest(path.join(PACKAGES, 'eventlog', 'src')),
  );
  if (builtAt(HOOK_SCRIPT) > sources) return;
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  for (const pkg of ['eventlog', 'hooks']) {
    const config = path.join(PACKAGES, pkg, 'tsconfig.build.json');
    const built = spawnSync(process.execPath, [tsc, '-p', config], { encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`build of ${pkg} failed: ${built.stdout}${built.stderr}`);
  }
}
