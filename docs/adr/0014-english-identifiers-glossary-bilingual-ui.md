# ADR 0014 · English identifiers, fixed VI↔EN glossary, bilingual UI via i18n

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §2.7, §4.1; [glossary.md](../glossary.md)

## Context

The user reads Vietnamese. Both CLIs, every library, lint rules, TypeScript errors and stack traces are English. Design v0.2 uses Vietnamese slugs as icon ids (`kien-tao`, `hiep-si`). Terms drift when code says `dispatcher` and the world says Quản sự.

## Decision

- English for identifiers, comments, commit messages, file names, ADRs, package READMEs and character prompts.
- Every data id is plain, common English: kinds, classes, statuses, rituals, scripts, icons, assets, JSON keys, theme names (`fix`, not `exorcise`). `snake_case` for JSON keys and enum values, `kebab-case` for icon, asset and file ids, `camelCase`/`PascalCase` in TypeScript.
- Fantasy lives only in display strings: `packages/i18n` (`vi`, `en`) and theme title keys.
- A fixed VI ↔ EN glossary: `docs/glossary.md`, generated from `packages/i18n/src/glossary.json`. Identifiers use the glossary's EN word (`steward`, `chancellor`, `seal`).
- Banned identifier words live in the glossary (`banned` and `fancy` tables of `glossary.json`): `dispatcher`, `intake`, `approve`/`approval`, `reviewer`, `worker`, `task`, `project`, `provider`, `team`, … and the fancy ids (`exorcise`). `pnpm docs:check` scans identifiers, JSON keys and id-shaped strings of shipped code and data for them; prose, tests, fixtures and tool config are not scanned. Words banned in one sense only (`budget` for mana, `agent` for a character) are left to review, because `quest.budget` and the `agent.*` events use them rightly.
- What the user reads (CLI output, UI, `handover.md`, verdict notes, `blocked.question`, chronicle, bell) follows `kingdom.owner.locale`, default `vi`. UI strings go through `t()`; `pnpm i18n:check` compares VI and EN keys.
- User documentation in `docs/*.md` stays Vietnamese.
- Design icon slugs are renamed to EN ids when icons are generated (`kien-tao` → `kind-build`); an unknown icon fails the generator.

## Consequences

- One word per concept across code, data and docs; agents can grep it.
- Vietnamese prose in handovers costs about 1.3× tokens; accepted.
