// The fourth tribe of the specs (PS-23): the owner adapter file fixtures/flint-adapter.mjs and its fake CLI
// fixtures/fake-flint.mjs, a CLI with hooks of its own that Elvaria's hook reads through the neutral dialect. Unlike
// lantern, flint's sessions run the real hook, the build `elvaria run` would start (`hookCommand` of @elvaria/hooks):
// vitest's global setup (global-setup.ts) builds it when it is missing or older than its source.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

/** The fake flint CLI: a Node script, which the adapter starts with Elvaria's own Node. */
export const FAKE_FLINT = path.join(FIXTURES, 'fake-flint.mjs');
/** How kingdom.json names the adapter file. */
export const FLINT_ADAPTER = 'adapters/flint.mjs';

/** Puts the adapter file where an owner would, `<kingdom>/adapters/flint.mjs`. */
export async function installFlint(kingdom: string): Promise<void> {
  await mkdir(path.join(kingdom, 'adapters'), { recursive: true });
  await copyFile(path.join(FIXTURES, 'flint-adapter.mjs'), path.join(kingdom, 'adapters', 'flint.mjs'));
}
