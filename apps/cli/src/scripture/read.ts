// What `elvaria scripture lint`, `scripture list` and the doctor read (PS-12): the temple's scripture and every
// character's, with what a scope may name in this kingdom. The lines are parsed and named by the Steward's own
// `lessonsIn`, so what these commands show is what a session loads.
import { SCRIPTURE_LINES_MAX, lessonVocabularyOf, worstLoadOf } from '@elvaria/domain';
import type { Character, LessonVocabulary, WorstLoad } from '@elvaria/domain';
import { lessonsIn } from '@elvaria/steward';
import type { Scripture, ScriptureLesson } from '@elvaria/steward';
import { inKingdom, kingdomLayout, readTextFile } from '@elvaria/store';
import type { RegistryLoadIssue, StoreIssue } from '@elvaria/store';

import type { KingdomContext } from '../kingdom-context.ts';

export interface KingdomScriptures {
  /** The temple's file first, then each character's that exists. */
  readonly files: readonly Scripture[];
  readonly characters: readonly Character[];
  readonly vocabulary: LessonVocabulary;
  /** Every tag of the registry: a character's heaviest load counts a quest that carries them all. */
  readonly tags: readonly string[];
  /** The OS the Steward runs on here (CliIo.platform), what a scope `os` is matched against. */
  readonly os: string;
  readonly issues: readonly StoreIssue[];
}

async function scriptureOf(root: string, file: string, owner: string): Promise<Scripture[]> {
  const text = await readTextFile(inKingdom(root, file));
  return text === undefined ? [] : [{ file, owner, text }];
}

/** The kingdom's scriptures, or the registry's problems when it cannot be read. */
export async function readKingdomScriptures(
  ctx: KingdomContext,
): Promise<KingdomScriptures | { readonly problems: readonly RegistryLoadIssue[] }> {
  const registry = await ctx.store.loadRegistry();
  if (!registry.ok) return { problems: registry.error };
  const characters = await ctx.store.characters.list();
  const territories = await ctx.store.territories.list();
  const root = ctx.store.root;
  const files = [
    ...(await scriptureOf(root, kingdomLayout.templeScripture(), 'temple')),
    ...(
      await Promise.all(characters.items.map(({ id }) => scriptureOf(root, kingdomLayout.scripture(id), id)))
    ).flat(),
  ];
  return {
    files,
    characters: characters.items,
    vocabulary: lessonVocabularyOf(registry.value, ctx.kingdom, territories.items),
    tags: registry.value.tags.map(({ id }) => id),
    os: ctx.io.platform,
    issues: [...characters.issues, ...territories.issues],
  };
}

/** A character's lessons in load order: its own scripture, then the temple's. */
export const lessonsOfCharacter = (
  scriptures: KingdomScriptures,
  character: Character,
): ScriptureLesson[] => [
  ...lessonsIn(scriptures.files.filter(({ owner }) => owner === character.id)),
  ...lessonsIn(scriptures.files.filter(({ owner }) => owner === 'temple')),
];

/** The character's heaviest session (worstLoadOf) on this machine, null when no territory exists. */
export const heaviestLoadOf = (scriptures: KingdomScriptures, character: Character): WorstLoad | null =>
  worstLoadOf(
    lessonsOfCharacter(scriptures, character),
    {
      class: character.class,
      tribe: character.tribe,
      os: scriptures.os,
      territories: scriptures.vocabulary.territories,
      tags: scriptures.tags,
    },
    scriptures.vocabulary,
  );

/** The characters whose heaviest session would load more than SCRIPTURE_LINES_MAX lessons (DB4). */
export const overCapOf = (scriptures: KingdomScriptures): { character: Character; load: WorstLoad }[] =>
  scriptures.characters.flatMap((character) => {
    const load = heaviestLoadOf(scriptures, character);
    return load !== null && load.lines > SCRIPTURE_LINES_MAX ? [{ character, load }] : [];
  });
