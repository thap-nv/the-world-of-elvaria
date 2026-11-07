# @elvaria/store

## Does

- Knows the kingdom folder (implementation-plan §2.2): `kingdomLayout` gives every file's path relative to the
  kingdom with `/`; `toPortable`, `fromPortable`, `inKingdom` and `comparePath` turn and compare paths the way
  Windows and macOS do (§6).
- Reads and writes `kingdom.json`, territories, quests, characters, campaigns and verdicts through
  `openKingdom(dir)`, the `KingdomStore` the Steward gets injected (§3.1): `read`, `write`, `update` (read →
  change → write inside one lock) and `list` (good files plus one issue per bad file). Every read runs
  JSON → migrate to the current version → the domain's zod schema; every write is validated first.
- Writes atomically (temp file in the same folder, flushed, renamed over the target) under `proper-lockfile`
  locks (ADR 0004, 0015). Windows' transient `EPERM`/`EACCES`/`EBUSY` are retried within a time budget.
  `acquireLock` also serves the long-held `.state/steward.lock` (P1-03); `isLocked` only reads whether a live
  holder keeps a lock (`elvaria doctor`, P1-11).
- Holds the migration framework (ADR 0003): one chain per stored contract in `src/migrations/index.ts`, steps in
  `src/migrations/<contract>/v<n>-to-v<n+1>.ts`, fixtures `v<n>.json` beside them, and `migrateKingdom` for
  `elvaria migrate` (rewrite every old file once, old text in `.backup/<stamp>/`).
- Runs the inbox (ADR 0005): `inbox.write` drops `inbox/<ulid>.json`, `inbox.read` lists commands oldest first
  (unusable files too, so the Steward can reject them), `inbox.ack` moves one to `inbox/done/`.
- Loads `registry/` (`loadRegistry`: migrate each file, then the domain's `parseRegistry`) and names registry
  entries whose file is missing (`missingRegistryFiles`: `class.prompt_file`, `script.entry`).
- Lays out a new kingdom (`initKingdom`): folders, a copy of the registry it is given, `kingdom.json` last.
- Reads the owner's royal decree (`readDecree`, `kingdomLayout.decree` = `decree.md`, null when absent) and masks
  secrets in free text it keeps (ADR 0013): every verdict write masks the secret patterns in `notes` (checked
  by the schema again after), and `redactHandover` masks a session's values and the patterns in its letter.

## Does not

- Decide anything: who may write quests (only the Steward, ADR 0005), when a quest changes status, or what a
  command means is the domain's and the Steward's business. The store persists what it is handed.
- Import `@elvaria/registry-default`: the composition root passes `initKingdom` the registry's folder and file
  list (`REGISTRY_ROOT`, `registryFiles()`).
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
`migrations.spec.ts` reads every stored fixture with the current store.
