# scripts

## Does

- `gen-schemas.mjs` (`gen-schemas.spec.ts`): renders the 17 data contract schemas from `@elvaria/domain`
  (`CONTRACTS` and `contractOf` in `packages/domain/src/schema/`) together with each contract's `examples` into
  JSON Schema 2020-12 files at `docs/schemas/<name>.schema.json` (ADR 0003, implementation-plan §2.1). With
  `--check`, compares without writing and exits `1` when a file differs from its zod source or when
  `docs/schemas/` holds a `*.schema.json` file that has no source in `CONTRACTS`. Called by `pnpm schemas` in
  the root `package.json`, `pnpm check` (`pnpm schemas --check`), and the `checks` job of
  `.github/workflows/ci.yml` (`pnpm schemas --check && pnpm schemas && git diff --exit-code docs/schemas`).
  Reads `packages/domain/src/schema/*` (via `@elvaria/domain`), `packages/domain/examples/<name>.json`, and
  `docs/schemas/*.schema.json`; writes `docs/schemas/<name>.schema.json`.
- `docs-gen.mjs` (`docs-gen.spec.ts`): orchestrates the repository's generated Markdown documentation
  (`GENERATORS`) and, when `--kingdom <dir>` (or `--kingdom=<dir>`) is passed, the kingdom tier report
  (`kingdomGenerators`, implementation-plan §5.4, §3.12). Each generator writes either a whole file or a marked
  region between `<!-- docs:gen <region> -->` and `<!-- /docs:gen <region> -->` inside a hand-written file
  (`spliceRegion`): the `quest-transitions` region of `docs/implementation-plan/2-data-and-events.md` (§2.5,
  rendered by `renderQuestTransitionTable()` from `@elvaria/domain`) and the `plan-index` region of
  `docs/implementation-plan.md` (the contents table, `docs-plan-index.mjs`). With `--check`, compares without writing and exits `1`
  on drift. Called by `pnpm docs:gen` (and `pnpm docs:gen --kingdom <dir>`) in the root `package.json`,
  `pnpm check` (`pnpm docs:gen --check`), and the `checks` job of `.github/workflows/ci.yml`
  (`pnpm docs:gen --check && pnpm docs:gen && git diff --exit-code docs/`); `.claude/hooks/guard-edit.spec.ts`
  also imports `GENERATORS` and `kingdomGenerators` to keep `GENERATED_FILES` in `.claude/hooks/guard-edit.mjs`
  in step with the generators. Reads and writes repo files through `gitRepo()` (`docs-repo.mjs`): writes
  `docs/glossary.md`, `docs/events.md`, `docs/dependency-graph.md`, `docs/cli.md`, the two regions above, and
  (with `--kingdom`) `docs/tier-report.md` and `docs/metrics-report.md`.
- `docs-plan-index.mjs` (`docs-plan-index.spec.ts`): `renderPlanIndex(repo)` renders the contents table of
  `docs/implementation-plan.md` (P1-52): one row per file of `docs/implementation-plan/` in section order
  (`byNumber`), named by its `##`/`###` numbered headings outside code fences (`headingsOf`, `labelOf`; a
  `8-done-*` file by its §8 subsection), and one row linking every `11-<date>.md` day file. Called by
  `docs-gen.mjs` (region `plan-index`) and `plan-split.mjs`. Reads the repo file list and the files of
  `docs/implementation-plan/` through `gitRepo()`; writes no files.
- `docs-glossary.mjs` (`docs-glossary.spec.ts`): `renderGlossary()` validates `GLOSSARY` with `glossaryProblems`
  from `@elvaria/i18n` and renders `docs/glossary.md` (ADR 0014, implementation-plan §5.3). Called by
  `docs-gen.mjs`. Reads `packages/i18n/src/glossary.json` (via `@elvaria/i18n`); `docs-gen.mjs` writes the
  rendered Markdown to `docs/glossary.md`.
- `docs-events.mjs` (`docs-events.spec.ts`): `renderEvents()` reads `EVENT_TYPES` and
  `contractOf('event', CONTRACTS.event)` from `@elvaria/domain` and renders the v1 event envelope and per-group
  `data` schemas into `docs/events.md` (implementation-plan §5.4). Called by `docs-gen.mjs`. Reads
  `packages/domain/src/schema/event/*` and `packages/domain/src/constants.ts` (via `@elvaria/domain`);
  `docs-gen.mjs` writes `docs/events.md`.
- `docs-graph.mjs` (`docs-graph.spec.ts`): `renderDependencyGraph()` runs `dependency-cruiser` (`cruise`) with
  `depcruiseConfig()` from `@elvaria/config/depcruise` over the shipped code of `packages/` and `apps/`
  (excluding `*.spec.ts`, `/__fixtures__/`, and `*.config.(ts|mjs)`), compares actual workspace imports
  (`cruiseEdges`, `edgesOf`) with `WORKSPACES` and `DEV_ONLY` from `@elvaria/config/boundaries` and
  `workspacesOnDisk()`, and renders the Mermaid flowchart and workspace table for `docs/dependency-graph.md`
  (implementation-plan §1.3, §5.4). Called by `docs-gen.mjs`. Reads `packages/config/boundaries.mjs`,
  `packages/config/depcruise.mjs`, `packages/*/package.json`, `apps/*/package.json`, and shipped source files
  under `packages/` and `apps/`; `docs-gen.mjs` writes `docs/dependency-graph.md`.
- `docs-cli.mjs` (`docs-cli.spec.ts`): `renderCli()` renders every `elvaria` command, its arguments, and its
  options in Vietnamese through `translator('vi')` from `@elvaria/i18n` so `docs/cli.md` stays in step with the
  command table that drives parsing and `--help` (implementation-plan §5.4). Called by `docs-gen.mjs`. Reads
  `apps/cli/src/commands.ts` (`COMMANDS`), `apps/cli/src/args.ts` (`GLOBAL_OPTIONS`), `apps/cli/src/command.ts`
  (`EXIT`), `apps/cli/src/help.ts` (`optionLabel`), and `packages/i18n/src/locales/vi.json` (via
  `@elvaria/i18n`); `docs-gen.mjs` writes `docs/cli.md`.
- `docs-tier-report.mjs` (`docs-tier-report.spec.ts`): `readKingdomEvents(kingdom)` reads every valid event line
  of `<kingdom>/events/YYYY-MM-DD.jsonl` (ignoring `events/sandbox/` and lines `EventSchema` of
  `@elvaria/domain` refuses) and `renderTierReport(events)` renders per-tier (`script`, `apprentice`, `session`)
  and per-quest numbers for `docs/tier-report.md` (`TIER_REPORT_FILE`, implementation-plan §3.12, ADR 0017).
  Called by `docs-gen.mjs` only when `--kingdom <dir>` (or `--kingdom=<dir>`) is passed (`pnpm docs:gen --check`
  without `--kingdom` leaves it alone). Reads `<kingdom>/events/YYYY-MM-DD.jsonl`; `docs-gen.mjs` writes
  `docs/tier-report.md`.
- `docs-metrics-report.mjs` (`docs-metrics-report.spec.ts`): `metricsReportOf(kingdom)` reads the kingdom with
  `readMetricsSource` of `apps/cli/src/metrics/read.ts` (the reader of `elvaria metrics`) and
  `renderMetricsReport(input, skipped)` renders the metrics ledger (`metricsOf` of `@elvaria/domain`) over the whole
  kingdom, a table by day (`daysOf`), and the sections of `apps/cli/src/metrics/view.ts` in Vietnamese through
  `translator('vi')`, for `docs/metrics-report.md` (`METRICS_REPORT_FILE`, implementation-plan §3.16.1, ADR 0027).
  Called by `docs-gen.mjs` only with `--kingdom <dir>`, like the tier report. Reads `<kingdom>/quests/`,
  `<kingdom>/verdicts/`, `<kingdom>/events/YYYY-MM-DD.jsonl` and `<kingdom>/inbox/done/`, writes nothing there;
  `docs-gen.mjs` writes `docs/metrics-report.md`.
- `docs-markdown.mjs` (tested in `docs-gen.spec.ts`): shared Markdown formatting helpers (`code`, `escapeCell`,
  `table`, `generatedNote`, `markdownDocument`) imported by `docs-glossary.mjs`, `docs-events.mjs`,
  `docs-graph.mjs`, `docs-cli.mjs`, `docs-tier-report.mjs`, and `docs-metrics-report.mjs`. Reads and writes no
  files.
- `docs-repo.mjs` (tested in `docs-gen.spec.ts` and `docs-check.spec.ts`): `gitRepo()` lists tracked files and
  non-ignored untracked files via `git ls-files -z --cached --others --exclude-standard` (with a minimal env)
  and reads and writes files by repo-relative `/` path. Called by `docs-gen.mjs` and `docs-check.mjs`.
- `docs-check.mjs` (`docs-check.spec.ts`): checks repository documentation, naming, and script rules across the
  files returned by `gitRepo()` (implementation-plan §4.1, §4.2, §5.2, §5.3, §5.4, ADR 0014, 0015):
  `readmeProblems` (every `packages/*/README.md` and `apps/*/README.md` has the four `##` sections `Does`,
  `Does not`, `Depends on`, `How to test` in order), `adrProblems` (every `docs/adr/NNNN-*.md` has a valid
  `- Status:` line), `shellScriptProblems` (no `.sh`, `.ps1`, `.cmd`, or `.bat` files in the repo),
  `sizeProblems` (no `docs/**/*.md`, generated or not, over `DOC_MAX_KB` = 150 KB of UTF-8, P1-52; the root
  `CLAUDE.md`, which every session loads whole, not over `CLAUDE_MD_MAX_KB` = 29 KB),
  `linkProblems` (`docs-links.mjs`), `termProblems` (glossary tables `quest_statuses` and `character_statuses`
  match `QUEST_STATUSES` and `CHARACTER_STATUSES` of `@elvaria/domain` exactly, and `ritual_steps` and `events`
  include every `RITUAL_STEPS` and `EVENT_TYPES` value), `bannedIdentifierProblems` (`docs-identifiers.mjs`),
  and `dataIdProblems` (`docs-identifiers.mjs`). Called by `pnpm docs:check` in the root `package.json`,
  `pnpm check`, and the `checks` job of `.github/workflows/ci.yml`. Reads the repo file list and file contents
  through `gitRepo()` (`docs-repo.mjs`), `QUEST_STATUSES`, `CHARACTER_STATUSES`, `RITUAL_STEPS`, and
  `EVENT_TYPES` from `@elvaria/domain`, and `GLOSSARY`, `bannedWords`, `glossaryTable`, and `idsOf` from
  `@elvaria/i18n`; writes no files.
- `docs-identifiers.mjs` (`docs-identifiers.spec.ts`): `bannedIdentifierProblems` parses TS/JS sources with the
  TypeScript AST (`ts.createSourceFile`, `codeTokens`) and JSON files (`jsonTokens`) to check identifiers, JSON
  keys, and id-shaped string literals (`wordsOf`, singular and plural) against `bannedWords(glossary)` (the
  `scan: true` entries of the `banned` and `fancy` tables in `packages/i18n/src/glossary.json`, ADR 0014),
  skipping `node_modules/`, `dist/`, `coverage/`, `__fixtures__/`, `docs/`, `design/`, `*.spec.ts`,
  `*.config.*`, `packages/i18n/src/glossary.json`, display string values in `packages/i18n/src/locales/*.json`
  (where only keys are scanned), and third-party fixed names in `ALLOWED`. `dataIdProblems` checks JSON data
  files in `packages/registry-default/`, `packages/ui-kit/`, and `themes/` (excluding `package.json` and
  `tsconfig*.json`) so every `id` or `*_id` string value matches `^[a-z0-9_-]+$`. Called by `docs-check.mjs`;
  reads file paths and texts passed by `docs-check.mjs` and writes no files.
- `docs-links.mjs` (`docs-links.spec.ts`): `linkProblems` (`linksOf`, `resolveLink`) checks that every relative
  link and image target in `*.md` files outside `design/` and `node_modules/` (skipping code fences and inline
  code spans, and ignoring external URLs, `mailto:`, and `#` anchors) resolves to an existing file or folder in
  the repo (implementation-plan §5.4, ADR 0019). Called by `docs-check.mjs`; reads the file list and Markdown
  texts passed by `docs-check.mjs` and writes no files. Exports `FENCE`, `CODE_SPAN`, `INLINE_LINK` and
  `NOT_RELATIVE` so `plan-lines.mjs` and `docs-plan-index.mjs` read links and fences the same way.
- `plan-split.mjs` (`plan-split.spec.ts`): `pnpm plan:split` (P1-52) splits `docs/implementation-plan.md` into
  the index and the files of `docs/implementation-plan/`, by the layout of `plan-layout.mjs`, rendering the index's
  `plan-index` region (`docs-plan-index.mjs`, `spliceRegion` of `docs-gen.mjs`). Lines move unchanged except
  relative link targets (`plan-lines.mjs`); it compares the non-blank lines before and after (`compareLines`) and
  exits `1` when one is lost or a file passes 150 KB (`MAX_BYTES`). On a plan already split (no `## 1.` heading),
  it moves the §8 rows whose Status starts with `xong` to the end of their `8-done-*` file. `--check` writes
  nothing and exits `1` when it would write; `--verbose` lists the added lines. Reads and writes
  `docs/implementation-plan.md` and `docs/implementation-plan/*.md` through `gitRepo()`.
- `plan-layout.mjs` (`plan-layout.spec.ts`): where each part of the plan goes: `SECTION_FILES` (one file per
  section, §3 one per subsection), `KEPT` (preamble, §8, §10, §11 head), `DONE_FILES` (the done file of each §8
  subsection); `blocksOf`, `moveDone`, `dayRows` cut the lines, and `partText`, `doneText`, `dayText`,
  `indexHead` write the heads of the files. Called by `plan-split.mjs`; reads and writes no files.
- `plan-lines.mjs` (`plan-lines.spec.ts`): `rebaseLines(lines, from, to)` rewrites relative link targets of moved
  lines so they reach the same file (outside code fences, link text and code spans untouched), and
  `compareLines(before, after, dropped)` counts the non-blank lines of two sets of files with their links resolved
  to repo paths and returns the `lost` and `added` ones. Called by `plan-split.mjs`; reads and writes no files.
- `i18n-check.mjs` (`i18n-check.spec.ts`): runs `localeProblems` (every locale in `LOCALE_FILES` has the same
  keys and `{name}` placeholders as `DEFAULT_LOCALE` `vi`, with no empty messages) and `glossaryProblems` (the
  shape rules of `packages/i18n/src/glossary.json`) from `@elvaria/i18n` (implementation-plan §4.1). Called by
  `pnpm i18n:check` in the root `package.json`, `pnpm check`, the `checks` job of `.github/workflows/ci.yml`,
  and `.claude/hooks/stop-checks.mjs` (the repo's Claude Code `Stop` hook in `.claude/settings.json`, which runs
  `node scripts/i18n-check.mjs` when uncommitted changes touch `packages/i18n/src/locales/*.json` or
  `packages/i18n/src/glossary.json`). Reads `packages/i18n/src/locales/vi.json`,
  `packages/i18n/src/locales/en.json`, and `packages/i18n/src/glossary.json` (via `@elvaria/i18n`); writes no
  files.
- `docs-note.mjs` (`docs-note.spec.ts`): exports `docsNote(commit, staged)` and `stagedFiles()` for the
  `docs-touched` commitlint rule (warning level): a behaviour-changing commit (`feat`, `fix`, or `perf`) must
  stage a file under `docs/` or include `docs: none` in its body (implementation-plan §5.4). Called by the root
  `commitlint.config.mjs`, which `.husky/commit-msg` runs via `pnpm exec commitlint --edit "$1"`. Reads the
  commit parsed by commitlint and the staged file paths from `git diff --cached --name-only` (with a minimal
  env); writes no files.
- `not-yet.mjs` (`not-yet.spec.ts`): stand-in script from P0-01 (`node scripts/not-yet.mjs <plan-item-id>`,
  implementation-plan §8) for root `package.json` scripts whose tool a later implementation-plan item builds;
  today every root script in `package.json` calls its real tool, and `scripts/not-yet.spec.ts` exercises this
  script in `pnpm test`. Reads the §8 rows of `docs/implementation-plan.md` and of its done files
  `docs/implementation-plan/8-done-*.md` (`readPlanRows`, `findPlanItemTitle`) and
  `process.env.npm_lifecycle_event`, prints which §8 item builds the tool (`notYetMessage`), and exits `0` (or
  `1` when the item id is missing or absent from §8); writes no files.
- `ritual-steps.mjs` (`ritual-steps.spec.ts`): `node scripts/ritual-steps.mjs --kingdom <dir> [--ritual <id>]
[--dry-run] [--force]` (PS-06) sets the steps of one ritual (default `council_review`) of a kingdom's
  `registry/rituals.json` to those of `packages/registry-default/rituals.json`, which `elvaria migrate` never does
  for an entry the kingdom has (`stepsChange`). It changes them only when the kingdom's steps are the default's with
  steps missing, in order; otherwise it refuses unless `--force`. Reads both files; copies the kingdom's to
  `<kingdom>/.backup/<stamp>-ritual-steps/registry/rituals.json`, then writes it whole through a file beside it.
  Exits `0` (done, nothing to do, or `--dry-run`), `1` (refused, no such ritual) or `2` (no `--kingdom`). Run by
  hand after `elvaria upgrade` (`docs/guides/operating-a-kingdom.md` §13).

## Does not

- Ship as a workspace package or run at runtime in the kingdom: these are repository maintenance tools included
  in the root `tsconfig.json` and `vitest.config.mjs`. `ritual-steps.mjs` writes a kingdom's registry only when
  the owner, or a session acting for the owner, runs it by hand.
- Edit source schemas (`packages/domain/src/schema/`), `packages/i18n/src/glossary.json`, locale files, or
  `packages/config/boundaries.mjs`: the generators only write derived files under `docs/`, `plan-split.mjs` only
  moves lines of the implementation plan, and the check scripts never write to disk.
- Change a line of the implementation plan when `plan-split.mjs` moves it, beyond its relative link targets.
- Run shell scripts or pass `process.env` wholesale to child `git` processes (ADR 0013, 0015).
- Follow web URLs, `mailto:` links, in-page `#` anchors, or links under `design/` in `docs-links.mjs` (ADR
  0019), or scan comments, prose strings, Markdown, tests, fixtures, or tool configs for banned identifiers in
  `docs-identifiers.mjs`.

## Depends on

- Root `devDependencies` (`package.json`): `@elvaria/config` (`boundaries.mjs`, `depcruise.mjs`),
  `@elvaria/domain` (schemas, `CONTRACTS`, `contractOf`, `EventSchema`, `EVENT_TYPES`, `QUEST_STATUSES`,
  `CHARACTER_STATUSES`, `RITUAL_STEPS`, `renderQuestTransitionTable`), `packages/registry-default/rituals.json`
  (`ritual-steps.mjs`, read as a file), `@elvaria/i18n` (`GLOSSARY`,
  `LOCALE_FILES`, `DEFAULT_LOCALE`, `translator`, `bannedWords`, `glossaryTable`, `idsOf`, `isGlossaryTable`,
  `isIdList`, `glossaryProblems`, `localeProblems`), `dependency-cruiser` (`docs-graph.mjs`), `typescript`
  (`docs-identifiers.mjs`), and `ajv` + `ajv-formats` (`gen-schemas.spec.ts`).
- `apps/cli` (`src/commands.ts`, `src/args.ts`, `src/command.ts`, `src/help.ts`), imported by `docs-cli.mjs` to
  render `docs/cli.md`; `src/metrics/read.ts` and `src/metrics/view.ts`, imported by `docs-metrics-report.mjs`.
- Node built-ins (`node:child_process`, `node:fs`, `node:path`, `node:process`, `node:url`) and `git`
  (`docs-repo.mjs`, `docs-note.mjs`).

## How to test

```bash
pnpm test              # root vitest (scripts/**/*.spec.ts and .claude/hooks/**/*.spec.ts), then workspaces
pnpm typecheck         # root tsc -p tsconfig.json checks scripts/*.mjs (checkJs) and scripts/*.spec.ts
pnpm schemas --check   # verifies docs/schemas/*.schema.json match the zod contracts
pnpm docs:gen --check  # verifies generated docs, the §2.5 region and the plan's contents match their sources
pnpm plan:split --check  # loses no line of the plan and finds no done §8 row left in the index
pnpm docs:check        # runs all repository documentation, link, and identifier checks
pnpm i18n:check        # verifies locale keys, placeholders, and glossary.json shape
```

Each script takes an injected file or repository abstraction (`Files`, `Repo`, or pure arguments) so its
`*.spec.ts` tests run in memory without touching the checkout, alongside one integration check against the real
repository (`gen-schemas.spec.ts` also compiles every `docs/schemas/*.schema.json` with `Ajv2020` and validates
its `examples`; `docs-tier-report.spec.ts` and `docs-metrics-report.spec.ts` use a temp kingdom folder with a space
in its name). Editing a file
under `scripts/` triggers `.claude/hooks/typecheck-touched.mjs`, which runs `tsc -p tsconfig.json` on the root
program.
