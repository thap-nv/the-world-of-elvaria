# ADR 0016 · Kinds, classes, rituals and scripts are registry data with schemas, not code

- Status: accepted · 2026-11-06
- Related: [implementation-plan.md](../implementation-plan.md) §1.3, §2.3, §9.1 item 14; [kind](../schemas/kind.schema.json), [class](../schemas/class.schema.json), [ritual](../schemas/ritual.schema.json), [script](../schemas/script.schema.json) schemas

## Context

Principle 7: mappings are data. The product plan (§5) has 11 quest kinds plus Campaign as a container, each with its own ritual, machine checks and delivery convention, and more kinds will come. Principle 13 adds a script tier that runs without a model.

## Decision

- `registry/kinds.json`, `classes.json`, `rituals.json` and `scripts.json` live in the kingdom, each with a `version` and a schema. Defaults ship in `@elvaria/registry-default` and are copied at `elvaria init`; the user may edit them. (`tags.json` joined them with ADR 0020; `parseRegistry` checks the five files against each other.)
- Domain treats `KindId`, `ClassId`, `RitualId` and `ScriptId` as strings validated against the loaded registry. There is no `switch` on kind in the core.
- Ids are English; display names (`name_vi`, `name_en`) are fields, never ids.
- Adding a kind = rows in `kinds.json` and `rituals.json` + theme mapping. Adding a theme = a `themes/<name>/` directory.
- Tier `script` only runs entries from the catalog `registry/scripts.json` (`entry` `.mjs`, `params_schema`, `kinds[]`, `produces: report | units | check`, `timeout_minutes`). Defaults: `link-check`, `run-check`, `count-files`, `diff-stat`, `compare-numbers`, each with tests. (P0-02: a script runs as `node <entry> --params <json> [--context <json>]` in the plot, with Node built-ins only, and prints one JSON line; `run-check` gets the check's argv from the Steward in `--context`, never from params.)
- A script a model writes and then runs is a session, not the script tier.

## Consequences

- The Chancellor can only pick scripts from the catalog it is shown in its prompt.
- Adding a script = one `.mjs` file with tests + one catalog row.
- Registry schema changes follow the migration rules of ADR 0003.
