// A sub-quest's description in the quest template (PS-06), and a plan file in its own (PS-06b): the subquests check
// returns a plan whose drafts or plan file lack them.

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

/** Where a mage writes its plan file in the plot. */
export const PLAN_FILE_PATH = 'plans/the-work.md';

const PLAN_SECTIONS = ['Summary', 'Survey', 'Shared decisions', 'Sub-quests', 'Done when', 'Unknowns'];

/** A plan file with every section of its template (PS-06b). */
export const PLAN_FILE = `# The work\n\n${PLAN_SECTIONS.map((heading) => `## ${heading}\n\nSome text.`).join('\n\n')}\n`;
