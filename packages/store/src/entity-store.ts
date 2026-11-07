// Read, write, update and list the files of one row of the entity table. Every write is validated first,
// then made atomic under the file's lock; `update` reads, changes and writes inside one lock, so two writers
// never lose each other's change (implementation-plan §6, ADR 0004). Only the Steward writes quests and
// characters (ADR 0005); the store does not know who calls it.
import { readdir } from 'node:fs/promises';

import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import { entityFile } from './entities.ts';
import { errorCode, readTextFile, writeFileAtomic } from './io/atomic.ts';
import { withLock } from './io/lock.ts';
import { lockedIssue, storeIssue } from './issues.ts';
import { inKingdom } from './paths.ts';
import { decode, encode, validate } from './stored-file.ts';
import type { EntitySpec } from './entities.ts';
import type { StoreIssue } from './issues.ts';
import type { FileSpec } from './stored-file.ts';

/** One file: `kingdom.json`, or one entity. */
export interface FileStore<T> {
  read(): Promise<Result<T, StoreIssue>>;
  /** Creates or replaces the file with `value`, once the schema accepts it. */
  write(value: T): Promise<Result<T, StoreIssue>>;
  /** Read → `change` → validate → write, all under the file's lock. An error from `change` writes nothing. */
  update<E>(change: (current: T) => Result<T, E>): Promise<Result<T, StoreIssue | E>>;
}

export interface Listing<T> {
  /** Sorted by id. */
  readonly items: readonly T[];
  /** One per file that could not be used; a bad file never hides the others. */
  readonly issues: readonly StoreIssue[];
}

export interface EntityStore<T, Id extends string> {
  read(id: Id): Promise<Result<T, StoreIssue>>;
  write(value: T): Promise<Result<T, StoreIssue>>;
  update<E>(id: Id, change: (current: T) => Result<T, E>): Promise<Result<T, StoreIssue | E>>;
  list(): Promise<Listing<T>>;
}

/** `file` holds a value of `spec`; `owns` says whether a valid value belongs at this path (its id). */
export function fileStore<T>(
  root: string,
  spec: FileSpec<T>,
  file: string,
  owns: (value: T) => boolean = () => true,
): FileStore<T> {
  const target = inKingdom(root, file);
  const mismatch = (): StoreIssue =>
    storeIssue('id_mismatch', file, 'the id inside differs from the file name');

  const read = async (): Promise<Result<T, StoreIssue>> => {
    const text = await readTextFile(target);
    if (text === undefined) return err(storeIssue('not_found', file, 'no such file'));
    const decoded = decode(text, file, spec);
    if (!decoded.ok) return decoded;
    return owns(decoded.value.value) ? ok(decoded.value.value) : err(mismatch());
  };

  const save = async (value: unknown): Promise<Result<T, StoreIssue>> => {
    const checked = validate(value, spec.parser, file);
    if (!checked.ok) return checked;
    // Scrubbed text is checked again: masking may shorten a field the schema wants long enough.
    const valid = spec.scrub === undefined ? checked : validate(spec.scrub(checked.value), spec.parser, file);
    if (!valid.ok) return valid;
    if (!owns(valid.value)) return err(mismatch());
    await writeFileAtomic(target, encode(valid.value));
    return valid;
  };

  const locked = async <R>(action: () => Promise<R>): Promise<R | Result<never, StoreIssue>> => {
    const outcome = await withLock(target, action);
    return outcome.ok ? outcome.value : err(lockedIssue(file));
  };

  return {
    read,
    write: (value) => locked(() => save(value)),
    update: <E>(change: (current: T) => Result<T, E>) =>
      locked(async (): Promise<Result<T, StoreIssue | E>> => {
        const current = await read();
        if (!current.ok) return current;
        const changed = change(current.value);
        return changed.ok ? save(changed.value) : changed;
      }),
  };
}

/** Ids present on disk, from file or folder names, sorted. Dot-names (temp files, locks) are skipped. */
export async function idsOnDisk(root: string, spec: { dir: string; nested?: string }): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(inKingdom(root, spec.dir), { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }
  const visible = entries.filter((entry) => !entry.name.startsWith('.'));
  const ids =
    spec.nested === undefined
      ? visible
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name.slice(0, -'.json'.length))
      : visible.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  return ids.sort();
}

export function entityStore<T, Id extends string>(root: string, spec: EntitySpec<T, Id>): EntityStore<T, Id> {
  const one = (id: string): Result<FileStore<T>, StoreIssue> => {
    const file = entityFile(spec, id);
    // An id from the command line or a folder name must not address a file outside its folder.
    if (!spec.idParser.safeParse(id).success)
      return err(storeIssue('invalid_id', file, `"${id}" is not a ${spec.contract} id`));
    return ok(fileStore(root, spec, file, (value) => spec.idOf(value) === id));
  };

  return {
    read: async (id) => {
      const store = one(id);
      return store.ok ? store.value.read() : store;
    },
    write: async (value) => {
      const valid = validate(value, spec.parser, spec.dir);
      if (!valid.ok) return valid;
      const store = one(spec.idOf(valid.value));
      return store.ok ? store.value.write(valid.value) : store;
    },
    update: async (id, change) => {
      const store = one(id);
      return store.ok ? store.value.update(change) : store;
    },
    list: async () => {
      const reads = await Promise.all(
        (await idsOnDisk(root, spec)).map(async (id) => {
          const store = one(id);
          return store.ok ? store.value.read() : store;
        }),
      );
      return {
        items: reads.flatMap((read) => (read.ok ? [read.value] : [])),
        issues: reads.flatMap((read) => (read.ok ? [] : [read.error])),
      };
    },
  };
}
