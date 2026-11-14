// Vitest's global setup for apps/cli: once, before any spec file runs. Specs start the tribes' runners as `elvaria run`
// does, with the real hook (`hookCommand` of @elvaria/hooks): flint's sessions run it, and Codex's doctor reports it
// missing with `auth_ok` false. `pnpm test` at the root builds it first (the hooks package's own test), a spec run
// alone did not: codex.spec.ts failed in 134 ms on a worktree whose hook was never built, and was read as a flake of a
// busy machine (fix/busy-machine). Building here, once, also keeps two spec files from writing dist/ at the same time.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { HOOK_SCRIPT } from '@elvaria/hooks';

const PACKAGES = path.join(import.meta.dirname, '..', '..', '..', 'packages');

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
export function setup(): void {
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
