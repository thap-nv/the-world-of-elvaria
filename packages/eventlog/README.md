# @elvaria/eventlog

## Does

- Appends events as JSONL (implementation-plan §2.1, §9.2): one `write()` per line on a file opened for append,
  a line at most 64 KiB, so hooks of parallel sessions and the Steward never interleave. A line a crashed writer
  left unfinished is ended before the next one, so a crash costs that line only.
- Knows the event files of a kingdom (§2.2): the log `events/YYYY-MM-DD.jsonl` (the day is the date written in
  the event's own `ts`, which writers format in `kingdom.tz`), the sandbox log `events/sandbox/`, and
  `quests/<id>/journal.jsonl`. `openEventLog(dir)` is the `EventLog` the Steward gets (§3.1); `openJournal`.
- Reads from a cursor: per day file, the byte offset after the last line read (`EventCursor`, plain JSON for
  `.state/`). The newest two day files stay watched, so a line stamped before midnight and appended after it is
  not missed. A line without its newline yet is left for the next read.
- Upgrades each line by `v` with the chain in `src/migrations/` (ADR 0003; empty while every line is v1), then
  checks it with the domain's `EventSchema`. Unusable lines are `EventLogIssue`s with a code and an offset;
  reading goes on. Unknown event types are kept (forward compatible).
- Tails the log by polling (§6: no `fs.watch`): `EventLog.tail({ from, intervalMs, signal })`.
- Redacts (ADR 0013): `redact(text, known, patterns)`, `createRedactor`, `redactDeep` for a whole event.
  Known values are masked exactly, then the patterns of `src/redact-patterns.json` (data, one fixture each).

## Does not

- Redact on its own: callers redact before they append (the hook, the runner, the store, the herald).
- Rewrite or compact the log; nothing here ever changes a line already written.
- Load `@elvaria/domain` (or zod) when imported: the hook imports this package on every tool call and has
  < 100 ms (§3.6), so the reader loads the schema on its first read (`src/schema.ts`).
- Persist cursors (the consumer saves one with what it built from the events), or fsync appends (a hook cannot
  afford it; a torn last line is ended by the next append and reported).

## Depends on

- `@elvaria/domain` (`Event`, `EventSchema`), loaded only when reading. No third-party package.

## How to test

```bash
pnpm --filter @elvaria/eventlog test
```

Specs use temp folders with a space in the name. `concurrency.spec.ts`: four appending processes and a tail;
`crash.spec.ts`: a consumer process killed mid-run resumes from its cursor; `secrets.spec.ts`: 13 kinds of
secret, none on disk after redaction; `light-entry.spec.ts`: the entry loads neither the domain nor zod.
