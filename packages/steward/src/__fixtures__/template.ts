// A sub-quest's description in the quest template (PS-06): the subquests check returns a plan whose drafts lack it.

/** `goal` in a description with every section of the template, its steps numbered. */
export const templated = (goal: string): string =>
  [
    `## Goal\n\n${goal}`,
    '## Steps\n\n1. Change the code.\n2. Add its test.',
    '## Files\n\n- The files of its scope.',
    '## Done when\n\n- `pnpm test` passes.',
    '## Do not touch\n\nNone.',
    '## Known traps\n\nNone known.',
  ].join('\n\n');
