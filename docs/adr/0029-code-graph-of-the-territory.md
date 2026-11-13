# ADR 0029 · A code graph of each territory, built by graphify outside every plot, asked by read-only commands

- Status: accepted · 2026-11-12 · amended 2026-11-13 (the graph in planning, PS-21b)
- Related: [plans/phase-1.5.md](../plans/phase-1.5.md) PS-21; [spike graphify](../spikes/graphify-2026-11-12.md); [ADR 0013](0013-treasury-and-redaction.md), [ADR 0015](0015-node-only-scripts.md), [ADR 0016](0016-registry-data-not-code.md), [ADR 0017](0017-one-quest-one-context-three-tiers.md), [ADR 0021](0021-tribe-contract.md)

## Context

A worker session spends most of its calls before its first edit finding its way (57 % of the calls of 67 sessions, 2026-11-08…11). graphify (the Python package `graphifyy`) builds a graph of a repo's functions, classes, imports, calls and inheritance with tree-sitter, with no model, and answers `query`, `path`, `explain` and `affected` from it. The spike (0 mana) found the graph cheap to build (12–26 s) and the navigation commands precise; it also found that graphify picks a model backend from any API key it sees and copies its skill into the home folder on every run unless told not to.

## Decision

- A territory's `code_graph` switch, off by default, turns it on. The Steward builds the graph at the commit a quest's branch forked from (its plot record), and at the default branch's tip each tick, from a detached worktree kept in the kingdom, into `.state/graphs/<territory>/<commit>/`: never in a plot, so no graph file reaches a diff or a check. A build is background work with its own table (one build per territory, the latest commit next), never holds a session (a quest opens without a graph not built yet), and writes `graph.built` or `graph.failed`.
- graphify is a program outside Node, pinned by `elvaria doctor --pin` in `kingdom.programs.graphify` like a tribe's CLI. Missing or unpinned is a warning: every quest runs as before, and `elvaria upgrade` is not stopped.
- Every graphify process, build or question, gets an explicit env: `GRAPHIFY_BACKEND=none`, no query log, no skill refresh, a pinned hash seed, no `.pyc`, the graph folder in `GRAPHIFY_OUT`; no API key. No strict mode, no skill or hook of graphify for characters.
- The graph commands are `graphify query`, `path`, `explain`, `affected` (the last for the judge, owner 2026-11-12). The core keeps the list; a class with Glob or Grep that does not deny a bare `Bash` gets them, alike in every tribe (ADR 0016). A class without a shell gets them alone, never its territory's checks: Claude Code gets the shell tool with these rules only, agy gets `command(…)` prefixes. The hook refuses every other graphify call and any option but those that shape the answer (`--graph` above all), for every class, and a shell-less class runs one plain call per line.
- The system part of the prompt gets a short graph block, only when the graph commands are granted; with the switch off the prompt does not change.
- (Amended 2026-11-13, PS-21b, awaiting settlement in implementation-plan §11.) The graph also serves planning, still with no model: the Chancellor, which has no tools, gets in its system part what `graphify query` answers to the code names and paths of the owner's words on the graph of the default branch's tip, and the impact of the files those words name (the files outside them that use their code); `elvaria say` builds no graph. The Steward and the CLI read the links between files from `graph.json` itself, with no graphify process. A plan quest's mage gets the impact of its scope, and its judge the sub-quests free to run at once whose code is linked: a warning, never a fail. With every switch off, only the file sizes the owner's words name reach the Chancellor (they come from the working tree, not the graph).

## Alternatives

- A Node map of the territory loaded into every prompt (the first PS-21): file level only, and it costs tokens on every turn.
- Building in the quest's plot: the character changes the plot while the build reads it, and the graph would reach the diff.
- The registry's allow lists for shell-less classes: they would get a shell and the territory's checks.

## Consequences

- A territory's graphs take about 10–20 MB each in the kingdom; three are kept.
- Whether the graph saves tokens is measured by an A/B before a territory's switch goes on (PS-21); the documents' graph, which needs a model, is PS-21c.
