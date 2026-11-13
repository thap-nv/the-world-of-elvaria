<!-- System part of the Chancellor, after the named files, when a territory with `code_graph` on has its graph built at
the default branch's tip and the owner's words hold code names or paths (PS-21b, ADR 0029). `elvaria say` asks
`graphify query` with those words (the spike found prose matches poorly, docs/spikes/graphify-2026-11-12.md §3) and
counts the impact from the graph's links (impactOf), 0 mana. Empty otherwise. The owner settled the impact as an
input to the rank on 2026-11-13 (§11): from rank B a quest gets a strong judge. {{graphs}}: one section per
territory. -->

# What the code graph answers

A graph of the territory's code (functions, classes, imports and calls, built by graphify without a model) was asked with the code names and paths of the owner's words. Use it to see where the work lies: size the drafts from the files it names, and take their `scope_paths` from them.

The impact is the number of files outside the named paths that use code in them: what a change there may break. Weigh it in the rank: a change that many files rely on is not small or local work, whatever its size.

{{graphs}}
