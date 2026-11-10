# @elvaria/registry-default

## Does

- Ships the default registry that `elvaria init` copies into `<kingdom>/registry/` (implementation-plan §2.2):
  11 kinds, 11 classes, 12 rituals, 6 catalog scripts, 8 tags, and one prompt per class. The package root is laid
  out like that folder.
- Holds the catalog scripts of the script tier (ADR 0017): `link-check`, `run-check`, `count-files`,
  `diff-stat`, `compare-numbers`, `todo-scan`, plus `scripts/common.mjs`. Each runs as
  `node scripts/<id>.mjs --params <json> [--context <json>]` in the plot and prints one JSON line. A failed run of
  `link-check` hands its dead links to a `document` quest for a scribe, one of `run-check` to a `fix` quest for a
  knight (`follow_up` in `scripts.json`, P1-17).
- Judges tests as the product by Thả quái thử thành (`mutation_check`, ADR 0022, P1-20): `build` and
  `refactor` choose it for tags `e2e` or `integration` (`ritual_overrides`); it runs in a scratch plot
  (`scratch_plot`) and a flake opens a `fix` quest for a knight (`flaky_follow_up`).
- Holds the class prompts `prompts/<class>.md` (P1-15): the craft of each class, which the Steward reads from the
  kingdom and runner-core adds to the system part of the character's session after the laws of its role. A leading
  `<!-- … -->` note is for the maintainer and never reaches a model. `mage.md` explains every field of
  `subquests.json`, and sends a party's part only to the check commands of its shell (P1-45).
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
