// inbox/<ulid>.json: how the CLI, the herald and the phone ask for a change; only the Steward applies them
// (ADR 0005). A writer drops a whole file in one rename, so the Steward never reads half a command; the
// Steward reads the inbox in id order (ULIDs sort by time) and moves each handled file to inbox/done/.
import { err, ok } from '@elvaria/domain';
import type { InboxCommand, InboxCommandInput, Result } from '@elvaria/domain';

import { INBOX_SPEC } from './entities.ts';
import { fileStore, idsOnDisk } from './entity-store.ts';
import { moveFile, pathExists, writeFileAtomic } from './io/atomic.ts';
import { storeIssue } from './issues.ts';
import { INBOX_DIR, kingdomLayout } from './layout.ts';
import { inKingdom } from './paths.ts';
import { encode, validate } from './stored-file.ts';
import type { StoreIssue } from './issues.ts';

export interface InboxItem {
  /** File name without `.json`: the command id when the file is well formed. */
  readonly name: string;
  /** A file the Steward cannot use is still listed, so it can be rejected and moved out of the way. */
  readonly command: Result<InboxCommand, StoreIssue>;
}

export interface InboxStore {
  /** Validates `input` and drops it into the inbox as `<id>.json`. */
  write(input: InboxCommandInput): Promise<Result<InboxCommand, StoreIssue>>;
  /** Commands waiting, oldest first. */
  read(): Promise<InboxItem[]>;
  /** Moves `<name>.json` to inbox/done/. Acking twice is fine: a tick may stop between apply and ack. */
  ack(name: string): Promise<Result<void, StoreIssue>>;
}

/** A bare file name: no folder part, not hidden (temp files start with a dot). */
const isPlainName = (name: string): boolean => /^[^./\\][^/\\]*$/.test(name);

export function inboxStore(root: string): InboxStore {
  return {
    write: async (input) => {
      const valid = validate(input, INBOX_SPEC.parser, INBOX_DIR);
      if (!valid.ok) return valid;
      await writeFileAtomic(inKingdom(root, kingdomLayout.inboxCommand(valid.value.id)), encode(valid.value));
      return valid;
    },
    read: async () => {
      const names = await idsOnDisk(root, { dir: INBOX_DIR });
      return Promise.all(
        names.map(async (name) => {
          const file = kingdomLayout.inboxCommand(name);
          const command = await fileStore(root, INBOX_SPEC, file, (value) => value.id === name).read();
          return { name, command };
        }),
      );
    },
    ack: async (name) => {
      const done = kingdomLayout.inboxDone(name);
      if (!isPlainName(name))
        return err(storeIssue('invalid_id', done, `"${name}" is not an inbox file name`));
      const moved = await moveFile(inKingdom(root, kingdomLayout.inboxCommand(name)), inKingdom(root, done));
      if (moved || (await pathExists(inKingdom(root, done)))) return ok(undefined);
      return err(storeIssue('not_found', kingdomLayout.inboxCommand(name), 'no such command in the inbox'));
    },
  };
}
