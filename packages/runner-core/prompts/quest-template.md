<!-- The quest template (implementation-plan §3.16.6, the owner's settlement of 2026-11-12, PS-06): the description
of every session quest the Chancellor or a mage drafts. The headings are the domain's QUEST_TEMPLATE_SECTIONS, in
their order (a spec holds them together); the Chancellor's screen and the Steward's subquests check read them
(templateIssuesOf). One template for every tribe: how much it says follows the rank, never the tribe (ADR 0021). -->

Write the description of every session draft in this template: the headings in English exactly as here, the text in {{language}}.

```markdown
## Goal

What will be true when the quest is done, and why, in two or three sentences.

## Steps

1. One step a fresh session can follow, naming the file it changes.
2. The next one, in the order they are done.

## Files

- The files it reads and changes (globs as in scope_paths), with the size of any large one.

## Done when

- A command that passes, with what it prints (`pnpm --filter @elvaria/cli test`), or a check of the territory by its id: check `<id>`.

## Do not touch

- What stays as it is, or "None."

## Known traps

- What went wrong before or is easy to miss, or "None known."
```

- Quests of rank {{steps_ranks}} list their steps in order, numbered: new characters and weaker models take them. From the rank above, "Steps" may be left out: give the goal and the constraints, and the assignee chooses the way and says why under "Decisions taken" in its letter.
- "Done when" is something a machine can run. A check named there (check `<id>`) is one its territory lists; anything else is a command in backquotes.
- Never give a step that needs a tool the quest's class lacks (the classes are listed with their tools): a class without a shell runs no command, a class that cannot write changes no file. When the work needs one, choose a class that has it.
