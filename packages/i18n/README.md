# @elvaria/i18n

## Does

- Holds the display strings of the CLI and the UI in `src/locales/vi.json` and `en.json` (flat dotted keys,
  `{name}` placeholders), and gives `translator(locale)` → `t(key, params)`, typed against the Vietnamese keys.
- Holds `src/glossary.json`, the one machine-readable source of every term (ADR 0014): `pnpm docs:gen` renders
  `docs/glossary.md` from it, and `pnpm docs:check` reads its banned words (`bannedWords`).
- Reports what `pnpm i18n:check` prints: `localeProblems` (both locales have the same keys and placeholders, no
  empty strings) and `glossaryProblems` (the shape rules of `glossary.json`).

## Does not

- Do IO or know Node: it also runs in the browser (`NO_NODE_TYPES` in `boundaries.mjs`); JSON comes in through
  imports.
- Decide the owner's locale: callers pass `kingdom.owner.locale`, `vi` by default.
- Render Markdown: `scripts/docs-glossary.mjs` lays the glossary out.

## Depends on

- No other workspace and no npm package.

## How to test

```bash
pnpm --filter @elvaria/i18n test   # vitest: translator, placeholders, locale and glossary problems
pnpm i18n:check                     # the real locale files and glossary.json
```

A new string goes into both locale files under the same key; a new term goes into `glossary.json`, then
`pnpm docs:gen`.
