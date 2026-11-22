// The scriptures as a temple report reads and writes them (PS-12c, ADR 0005, ADR 0027): the temple's and every
// character's, each with its ledger, read again before each operation, so the owner's edit since the report was written
// is the text the operation applies to. An edit is written ledgers first, then the Markdown: a Steward that stops in
// between leaves a trace the domain completes on the next pass (scriptureEditOf), never a line twice.
import process from 'node:process';

import { lessonVocabularyOf } from '@elvaria/domain';
import type { ScriptureEdit, ScriptureFile, TempleState } from '@elvaria/domain';

import { describeIssue } from '../tick/world.ts';
import type { Context } from '../context.ts';

/** `temple` first, then each character of the kingdom. */
const ownersOf = (ctx: Context): string[] => ['temple', ...ctx.world.characters.keys()];

/** Every scripture with its ledger; the first that cannot be read is the error (a broken ledger, say). */
export async function readScriptures(ctx: Context): Promise<ScriptureFile[] | string> {
  const files: ScriptureFile[] = [];
  for (const owner of ownersOf(ctx)) {
    const read = await ctx.deps.store.scriptures.read(owner);
    if (!read.ok) return describeIssue(read.error);
    files.push(read.value);
  }
  return files;
}

/**
 * What the domain checks an operation against: the files, the characters, the scope's words, the OS. The 40-line rule
 * weighs the characters that open quest sessions, of a class with kinds of quest (a judge's included): the Monk's and
 * the Chancellor's sessions load no scripture.
 */
export function templeStateOf(ctx: Context, files: readonly ScriptureFile[]): TempleState {
  const { registry, kingdom, territories } = ctx.world;
  const working = new Set(registry.classes.filter(({ kinds }) => kinds.length > 0).map(({ id }) => id));
  const characters = [...ctx.world.characters.values()].filter((character) => working.has(character.class));
  const weighed = characters.map((character) => ({
    id: character.id,
    class: character.class,
    tribe: character.tribe,
    suspended: character.status === 'suspended',
  }));
  return {
    files,
    characters: weighed,
    vocabulary: lessonVocabularyOf(registry, kingdom, [...territories.values()]),
    // The OS a session matches its scope against (lessonSessionOf).
    os: ctx.deps.platform ?? process.platform,
  };
}

/** The ledgers first, then each text that changed; an issue of the ledger's schema is the error, and stops the rest. */
export async function writeEdit(
  ctx: Context,
  before: readonly ScriptureFile[],
  edit: ScriptureEdit,
): Promise<string | undefined> {
  const oldOf = (owner: string) => before.find((file) => file.owner === owner);
  for (const file of edit.files) {
    if (JSON.stringify(oldOf(file.owner)?.ledger) === JSON.stringify(file.ledger)) continue;
    const written = await ctx.deps.store.scriptures.writeLedger(file.owner, file.ledger);
    if (!written.ok) return describeIssue(written.error);
  }
  for (const file of edit.files)
    if (oldOf(file.owner)?.text !== file.text)
      await ctx.deps.store.scriptures.writeText(file.owner, file.text);
  return undefined;
}
