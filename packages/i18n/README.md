# @elvaria/i18n

## Does

- Holds the display strings of the CLI and the UI in one file per namespace and locale,
  `src/locales/<locale>/<namespace>.json` (flat dotted keys, `{name}` placeholders; AH-04). A namespace is a key
  prefix: the first segment (`quest`, `store`, `tribe_look`), and for `cli` the command group (`cli.quest` →
  `cli-quest.json`; `cli.json` keeps the two-segment `cli.yes`, `cli.no`). A key lives in the file of the longest
  namespace that prefixes it. `src/locales/vi.ts` and `en.ts` import the files; `en.ts` is typed against
  `vi.ts`, so a namespace or key missing in English fails typecheck.
- Gives `translator(locale)` → `t(key, params)` over the merged namespaces, typed against the Vietnamese keys;
  `LOCALE_FILES` (each locale merged into one file) and `LOCALE_NAMESPACES` (as on disk) for the checks;
  `isMessageKey` tells whether a key built from data (a theme part, `tribe_look.<part>.<id>`, PS-24) is in the catalog.
- Holds `src/glossary.json`, the one machine-readable source of every term (ADR 0014): `pnpm docs:gen` renders
  `docs/glossary.md` from it, and `pnpm docs:check` reads its banned words (`bannedWords`).
- Reports what `pnpm i18n:check` prints: `localeProblems` (both locales have the same keys and placeholders, no
  empty strings), `namespaceProblems` (each key in its namespace's file, the same namespaces in both locales, file
  version) and `glossaryProblems` (the shape rules of `glossary.json`).

## Does not

- Do IO or know Node: it also runs in the browser (`NO_NODE_TYPES` in `boundaries.mjs`); JSON comes in through
  imports.
- Decide the owner's locale: callers pass `kingdom.owner.locale`, `vi` by default.
- Render Markdown: `scripts/docs-glossary.mjs` lays the glossary out.
- Read its own folder: `scripts/i18n-check.mjs` fails a namespace file that `vi.ts` or `en.ts` does not import,
  and one over 40 KB.

## Depends on

- No other workspace and no npm package at run time.
- `@elvaria/config` (dev only: `tsconfig.json` extends its `tsconfig/base.json`).

## How to test

```bash
pnpm --filter @elvaria/i18n test   # vitest: translator, placeholders, namespaces, locale and glossary problems
pnpm i18n:check                     # the real locale files, their folder and glossary.json
```

A new string goes into the namespace file of its key in both `locales/vi/` and `locales/en/`. A new namespace
(a new command group, a new package's strings) is a file in both folders and one line in `vi.ts` and `en.ts`; a
file nearing 40 KB is split by a longer prefix (`cli.quest.list`) the same way. A new term goes into
`glossary.json`, then `pnpm docs:gen`.
