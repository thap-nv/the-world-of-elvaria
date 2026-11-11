<!-- How a session searches when its tribe's CLI has no search tool (P1-53; `capabilities.search: false`, agy under
`-p`): a class with Glob or Grep gets `git grep` and `git ls-files` (ToolPolicy `search_commands`), listed among the
shell's commands above this text, even for a class without a shell. Added after P1-50, where a scout of the Gemini
tribe read a 1 MB file 25 times over for want of a search. The hook refuses the options named here and, for a class
without a shell, any line that is more than one plain search; single quotes are text in PowerShell and bash alike. -->

Your CLI has no tool to search files: search the files git tracks with `git grep` and list them with `git ls-files`.

- `git grep -n -e '<pattern>' -- '<path>'` prints each matching line with its number; `-i` ignores case, `-F` reads the pattern as plain text, `-l` lists only the files, `-C <n>` adds n lines around each match.
- `git ls-files '<glob>'` lists the tracked files that match, such as `'docs/*.md'`.

Put each pattern and path in single quotes, and leave quote characters out of a pattern: search for the words beside them. Options that run a program or reach past the tracked files (`-O`, `--open-files-in-pager`, `--no-index`, `--untracked`, `--textconv`) are refused.
