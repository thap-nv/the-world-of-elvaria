// The owner adapter file of the specs (fixtures/lantern-adapter.mjs) and its fake CLI (fixtures/fake-lantern.mjs):
// a tribe with no tool gate, added after the kingdom was founded (implementation-plan §3.14, P1-19).
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

/** The fake lantern CLI: a Node script, which the adapter starts with Elvaria's own Node. */
export const FAKE_LANTERN = path.join(FIXTURES, 'fake-lantern.mjs');
/** How kingdom.json names the adapter file. */
export const LANTERN_ADAPTER = 'adapters/lantern.mjs';

/** Puts the adapter file where an owner would, `<kingdom>/adapters/lantern.mjs`. */
export async function installLantern(kingdom: string): Promise<void> {
  await mkdir(path.join(kingdom, 'adapters'), { recursive: true });
  await copyFile(path.join(FIXTURES, 'lantern-adapter.mjs'), path.join(kingdom, 'adapters', 'lantern.mjs'));
}

/** An adapter file of the owner's that breaks the contract in its own way. */
export async function writeAdapter(kingdom: string, name: string, source: string): Promise<string> {
  await mkdir(path.join(kingdom, 'adapters'), { recursive: true });
  await writeFile(path.join(kingdom, 'adapters', `${name}.mjs`), source);
  return `adapters/${name}.mjs`;
}

/** kingdom.json as it is on disk now. */
export const kingdomJson = async (kingdom: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path.join(kingdom, 'kingdom.json'), 'utf8')) as Record<string, unknown>;

/** Rewrites part of kingdom.json, as an owner editing it by hand. */
export async function editKingdom(
  kingdom: string,
  change: (value: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const file = path.join(kingdom, 'kingdom.json');
  await writeFile(file, JSON.stringify(change(await kingdomJson(kingdom)), null, 2));
}
