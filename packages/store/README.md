# @elvaria/store

## Does

- Knows the kingdom folder (implementation-plan §2.2): `kingdomLayout` gives every file's path relative to the
  kingdom with `/`; `toPortable`, `fromPortable`, `inKingdom` and `comparePath` turn and compare paths the way
  Windows and macOS do (§6).
- Reads and writes `kingdom.json`, territories, quests, characters, campaigns, verdicts and memos (PS-02) through
  `openKingdom(dir)`, the `KingdomStore` the Steward gets injected (§3.1): `read`, `write`, `update` (read →
  change → write inside one lock) and `list` (good files plus one issue per bad file). Every read runs
  JSON → migrate to the current version → the domain's zod schema; every write is validated first.
- Writes atomically (temp file in the same folder, flushed, renamed over the target) under `proper-lockfile`
  locks (ADR 0004, 0015). Windows' transient `EPERM`/`EACCES`/`EBUSY` are retried within a time budget. A
  file standing where an entity's folder must be is an issue (`not_a_folder`), not a throw (P1-15).
  `acquireLock` also serves the long-held `.state/steward.lock` (P1-03); `isLocked` only reads whether a live
  holder keeps a lock (`elvaria doctor`, P1-11).
- Holds the migration framework (ADR 0003): one chain per stored contract in `src/migrations/index.ts`, steps in
  `src/migrations/<contract>/v<n>-to-v<n+1>.ts`, fixtures `v<n>.json` beside them (no step yet: all 14 stored
  contracts are at v1, each with its `v1.json`), and `migrateKingdom` for
  `elvaria migrate` (rewrite every old file once, old text in `.backup/<stamp>/`).
- Runs the inbox (ADR 0005): `inbox.write` drops `inbox/<ulid>.json`, `inbox.read` lists commands oldest first
  (unusable files too, so the Steward can reject them), `inbox.ack` moves one to `inbox/done/`.
- Loads `registry/` (`loadRegistry`: migrate each file, then the domain's `parseRegistry`, then every
  `class.prompt_file` must exist, P1-15) and names the catalog scripts whose `entry` is missing
  (`missingRegistryFiles`). `readClassPrompt` reads a class's prompt for a session (null when it is gone).
- Lays out a new kingdom (`initKingdom`): folders, a copy of the registry it is given, `kingdom.json` last.
  `addMissingRegistryFiles` copies into an older kingdom the registry files it lacks, never one it has
  (`elvaria migrate`, P1-15). `registryGaps` compares the kingdom's registry with a default one by entry id: the
  entries it lacks, and the top-level keys a default entry has that the kingdom's entry lacks (`elvaria doctor`,
  P1-41). `addMissingRegistryEntries` appends the missing entries whole, under each file's lock with the old text in
  `.backup/<stamp>/` (kept if a migration of the same run saved it first), only when the registry with all of them
  still passes `parseRegistry`; an entry the kingdom has is never changed (`elvaria migrate`, P1-41).
  `refreshRegistryDefaults` (`elvaria upgrade`, fix/kingdom-upkeep) compares the kingdom with the default registry of
  the build it ran before and of the one it runs now: a prompt or script (text, line ends aside) or a data entry (by
  id, key order aside) the new build changed and the kingdom still holds as the old default takes the new one, under
  its file's lock with the old text in `.backup/<stamp>/`; one the owner edited is only named; data entries are
  written only when the registry with all of them passes `parseRegistry`, and only into a file that, like the new
  default, is at this Elvaria's version.
- Reads the owner's royal decree (`readDecree`, `kingdomLayout.decree` = `decree.md`, null when absent) and masks
  secrets in free text it keeps (ADR 0013): every verdict write masks the secret patterns in `notes` (checked
  by the schema again after), every memo write masks them in its text (PS-02), and `redactHandover` masks a session's values and the patterns in its letter.
- Lays out a territory's code graphs (PS-21): `kingdomLayout.graphs`, `graph(<territory>, <commit>)`, `graphSource`
  and `graphLock`, under `.state/graphs/<territory>/`.

## Does not

- Decide anything: who may write quests (only the Steward, ADR 0005), when a quest changes status, or what a
  command means is the domain's and the Steward's business. The store persists what it is handed.
- Import `@elvaria/registry-default`: the composition root passes `initKingdom` the registry's folder and file
  list (`REGISTRY_ROOT`, `registryFiles()`), and `registryGaps` / `addMissingRegistryEntries` the folder.
- Change a registry file or entry the owner edited, even to add a key the default entry gained (P1-41): only one
  still equal to the previous build's default takes the new default (`refreshRegistryDefaults`).
- Write the event log or journals (`@elvaria/eventlog` does; the journal's name is its `journalOf`), know a
  session's secret values (the Steward passes them to `redactHandover`), or create or change `decree.md` (the
  owner's).
- Throw for states a caller can act on: a missing, unreadable, invalid, newer or locked file is a `StoreIssue`
  with a `code` the CLI translates. An IO failure nobody can act on (disk full, no permission on the kingdom)
  is thrown.

## Depends on

- `@elvaria/domain` (schemas, ids, `Result`, `parseRegistry`).
- `@elvaria/eventlog` (`journalOf`, `createRedactor`): one source for the journal's name and the patterns.
- `proper-lockfile` (file locks that survive a crashed holder, on Windows and macOS).

## How to test

```bash
pnpm --filter @elvaria/store test
```

Tests build throwaway kingdoms in the OS temp folder (`test/kingdom.ts`, folder names with a space).
`concurrency.spec.ts` races writers in one process and in four Node processes (`test/update-worker.ts`, run by
Node's type stripping) while a reader reads in a loop: no update may be lost and no read may fail.
`migrations.spec.ts` reads every stored fixture with the current store. `registry-gaps.spec.ts` plays a newer
default registry (the fixtures plus a ritual, a tag and a kind's `ritual_overrides`) against a kingdom made of the
fixtures.
