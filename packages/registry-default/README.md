# @elvaria/registry-default

## Does

- Ships the default registry that `elvaria init` copies into `<kingdom>/registry/` (implementation-plan §2.2):
  11 kinds, 11 classes, 11 rituals, 5 catalog scripts, 7 tags, and one prompt per class. The package root is laid
  out like that folder.
- Holds the catalog scripts of the script tier (ADR 0017): `link-check`, `run-check`, `count-files`,
  `diff-stat`, `compare-numbers`, plus `scripts/common.mjs`. Each runs as
  `node scripts/<id>.mjs --params <json> [--context <json>]` in the plot and prints one JSON line.
- Holds the class prompts `prompts/<class>.md` (P1-15): the craft of each class, which the Steward reads from the
  kingdom and runner-core adds to the system part of the character's session after the laws of its role. A leading
  `<!-- … -->` note is for the maintainer and never reaches a model. `mage.md` explains every field of
  `subquests.json`.
- Exports `loadDefaultRegistry()` (read + validate through `@elvaria/domain`), `registryFiles()` (what init
  copies) and `REGISTRY_ROOT`.

## Does not

- Use anything but Node built-ins in `scripts/`: a kingdom has no `node_modules`.
- Take commands from params: `run-check` gets the check's resolved argv from the Steward in `--context`.
- Hold the laws of each role (assignee, verifier, Chancellor): those are runner-core's templates.

## Depends on

- `@elvaria/domain` (schemas and the registry check).

## How to test

```bash
pnpm --filter @elvaria/registry-default test
```

Script tests build throwaway plots in a temp folder (`scripts/test-plot.ts`); `diff-stat` gets a real git repo
isolated from the machine's git config. Each script is also run once as a separate process.
