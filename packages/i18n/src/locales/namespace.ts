// Display strings are split by namespace, one file per namespace and locale (`locales/<locale>/<file>.json`,
// architecture-health V4, AH-04), so a session that edits one string reads a few kilobytes, not the whole catalog,
// and two branches that add strings to different commands touch different files. The files are joined here.

/** The format version of every locale file: `version` like every JSON file of the repo, then flat dotted keys. */
export const LOCALE_FILE_VERSION = 1;

/** One locale file: a namespace's strings, or a whole locale once its namespaces are merged. */
export interface LocaleFile {
  readonly version: number;
  readonly messages: Readonly<Record<string, string>>;
}

/** One locale's files, by namespace: a key prefix (`cli.quest`, `store`) without the trailing dot. */
export type Namespaces = Readonly<Record<string, LocaleFile>>;

/** The keys of every namespace of `T`. */
export type KeysOf<T extends Namespaces> = { [N in keyof T]: keyof T[N]['messages'] & string }[keyof T];

/** What a translation of `T` holds: the same namespaces, each with at least the same keys. */
export type Translation<T extends Namespaces> = {
  readonly [N in keyof T]: {
    readonly version: number;
    readonly messages: Readonly<Record<keyof T[N]['messages'], string>>;
  };
};

/** The file of a namespace inside its locale's folder: kebab-case, like every file id (`cli.seal_raise`). */
export const namespaceFile = (namespace: string): string => `${namespace.replaceAll(/[._]/g, '-')}.json`;

/** The namespace a key belongs in: the longest of `namespaces` that prefixes it, or undefined when none does. */
export function namespaceOf(key: string, namespaces: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const namespace of namespaces) {
    if (key.startsWith(`${namespace}.`) && namespace.length > (best?.length ?? -1)) best = namespace;
  }
  return best;
}

/** One locale as a single file: every namespace's keys, in namespace order. */
export function merged<T extends Namespaces>(
  namespaces: T,
): { readonly version: number; readonly messages: Readonly<Record<KeysOf<T>, string>> } {
  const messages: Record<string, string> = {};
  for (const file of Object.values(namespaces)) Object.assign(messages, file.messages);
  // The keys are KeysOf<T> by construction; Object.assign cannot say so.
  return { version: LOCALE_FILE_VERSION, messages: messages as Record<KeysOf<T>, string> };
}
