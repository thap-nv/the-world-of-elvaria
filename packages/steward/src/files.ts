// The kingdom's text files a session is built from (implementation-plan §2.2, §3.7): the royal decree, the
// gazetteer, the scriptures, the handover letter and the quest's journal. The Steward reads them, never writes them.
import { inKingdom, kingdomLayout, readTextFile } from '@elvaria/store';
import type { CharacterId, QuestId, TerritoryId } from '@elvaria/domain';

/** The text of a kingdom file, or null when it does not exist. */
export const readOptional = async (root: string, relative: string): Promise<string | null> =>
  (await readTextFile(inKingdom(root, relative))) ?? null;

/** The owner's royal decree, as the store reads it (`kingdomLayout.decree`). */
export { readDecree } from '@elvaria/store';

export const readGazetteer = (root: string, territory: TerritoryId) =>
  readOptional(root, kingdomLayout.gazetteer(territory));

/**
 * A scripture file: where it is in the kingdom (with `/`, as the load trace names it, PS-01b), whose it is (the
 * character's slug, or `temple`, PS-12), and its text.
 */
export interface Scripture {
  readonly file: string;
  readonly owner: string;
  readonly text: string;
}

/** The character's scripture, then the temple's (§3.7), those that exist. */
export async function readScriptures(root: string, character: CharacterId): Promise<Scripture[]> {
  const files = [
    { file: kingdomLayout.scripture(character), owner: character },
    { file: kingdomLayout.templeScripture(), owner: 'temple' },
  ];
  const texts = await Promise.all(files.map(({ file }) => readOptional(root, file)));
  return files.flatMap((entry, index) => {
    const text = texts[index];
    return text === null || text === undefined ? [] : [{ ...entry, text }];
  });
}

export const handoverPath = (root: string, quest: QuestId): string =>
  inKingdom(root, kingdomLayout.handover(quest));

export const readHandover = (root: string, quest: QuestId) =>
  readOptional(root, kingdomLayout.handover(quest));

/** The journal's lines, oldest first; the prompt keeps the tail (JOURNAL_TAIL_LINES). */
export async function readJournal(root: string, quest: QuestId): Promise<string[]> {
  const text = await readOptional(root, kingdomLayout.journal(quest));
  return (text ?? '').split(/\r?\n/).filter((line) => line.trim() !== '');
}
