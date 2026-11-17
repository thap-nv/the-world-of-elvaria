<!-- The commands a session's shell may run: the Bash rules of its ToolPolicy (implementation-plan §3.7). Added in
P1-11, after the first real quest: the knight joined `pnpm check` with `;`, `npx` and `timeout`, the settings refused
the whole line, and it stopped to ask the owner. Empty for a class without a shell.
{{program}} names the shell its tribe's adapter declares for this OS (`capabilities.shell`, P1-40): agy runs
PowerShell on Windows, where bash syntax fails. Its line is gone when the adapter declares none.
{{search}} is prompts/search.md when the policy has search commands (P1-53), which the list then ends with.
{{read}} says how to read a file: with Read, or, when the tribe's CLI has no tool that reads one (`capabilities.read:
false`, PS-23: Codex), with read-only commands of the shell, or for a class without a shell through `git grep`.
The paragraph after the rules was a line of a real kingdom's scripture since P1-40 moved the shell's name here: a
command the machine stopped is no result, so the letter or the verdict says so and the Steward's checks decide
(fix/lesson-step-0). -->

# Your shell

{{program}}

Your shell runs only the commands below, one command per call, each starting exactly as written; its own arguments may follow. Your settings refuse other commands, including commands joined with `;`, `&&` or `|`, redirection, and wrappers such as `npx`, `timeout` or `cd`. A refusal is a limit of your class, not a question for the owner. {{read}}

A command that cannot start (execution policy, command not found) or fails because of the machine (EPERM, blocked by a sandbox) gives no result: quote its error line under Not done in the letter, or in a judge's notes, never claim a result for it, and do not work around it. The Steward's checks run outside your session.

{{commands}}

{{search}}
