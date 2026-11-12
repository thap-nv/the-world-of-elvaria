<!-- The code graph of the territory (PS-21, ADR 0029): built by graphify at the commit the quest branch forked from,
outside the plot, with no model. In the system part only when the territory has `code_graph` on, the graph is built
and the class searches code (ToolPolicy `graph_commands`); the session's GRAPHIFY_OUT names the graph, so no command
takes a path to it, and the hook refuses `--graph` and every other graphify command. The spike
(docs/spikes/graphify-2026-11-12.md §3) found that questions in prose match poorly and code names and paths well, and
that explain and affected answer in about 2 000 characters. {{ask}} is the judge's line, empty for the assignee. -->

## Code graph

A graph of this territory's code at commit `{{commit}}`, where your quest's branch began, is open to you: its functions, classes and constants, with the imports, calls and inheritance between them, built by graphify without a model. Ask it before you open file after file to find your way. Run each command alone on its line, with its words in single quotes:

- `graphify query '<names or paths>'` walks the graph from the nodes those words name. Ask with code names and paths (`'FOCUS_MAX AreaCard apps/web/src/lib'`), not with a sentence; the answer lists nodes with their file and line.
- `graphify explain '<name>'` shows one node, what it calls and what calls it.
- `graphify affected '<name>'` lists what depends on it, two steps back.
- `graphify path '<name>' '<other name>' --undirected` shows how two nodes are linked.

The graph holds the code of that commit, not your changes, and no file content: open the files it names to read them. {{ask}}
