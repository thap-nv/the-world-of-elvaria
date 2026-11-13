<!-- The commands a session's shell may run: the Bash rules of its ToolPolicy (implementation-plan §3.7). Added in
P1-11, after the first real quest: the knight joined `pnpm check` with `;`, `npx` and `timeout`, the settings refused
the whole line, and it stopped to ask the owner. Empty for a class without a shell.
{{program}} names the shell its tribe's adapter declares for this OS (`capabilities.shell`, P1-40): agy runs
PowerShell on Windows, where bash syntax fails. Its line is gone when the adapter declares none.
{{search}} is prompts/search.md when the policy has search commands (P1-53), which the list then ends with.
{{read}} says how to read a file: with Read, or, when the tribe's CLI has no tool that reads one (`capabilities.read:
false`, PS-23: Codex), with read-only commands of the shell, or for a class without a shell through `git grep`. -->

# Your shell

{{program}}

Your shell runs only the commands below, one command per call, each starting exactly as written; its own arguments may follow. Your settings refuse other commands, including commands joined with `;`, `&&` or `|`, redirection, and wrappers such as `npx`, `timeout` or `cd`. A refusal is a limit of your class, not a question for the owner. {{read}}

{{commands}}

{{search}}
