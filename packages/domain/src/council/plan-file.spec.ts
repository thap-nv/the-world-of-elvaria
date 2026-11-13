import { describe, expect, it } from 'vitest';

import {
  planFileGapsOf,
  planFileIssueLine,
  planFileIssuesOf,
  planFilesOf,
  planSummaryOf,
  splitBrief,
} from './plan-file.ts';

const PLAN = [
  '# The orders export works end to end',
  '',
  '## Summary',
  '',
  'Two parts: the endpoint (knight, D), then its page (knight, D). About 400k tokens.',
  '',
  '```markdown',
  '## Not a heading inside a fence',
  '```',
  '',
  '## Survey',
  '',
  'apps/api/src/reports/ (10 files).',
  '',
  '## Shared decisions',
  '',
  'The CSV columns follow docs/api.md.',
  '',
  '## Sub-quests',
  '',
  '- d1: the endpoint.',
  '',
  '## Done when',
  '',
  '- check `test` passes.',
  '',
  '## Unknowns',
  '',
  'None.',
].join('\n');

describe('the plan file (PS-06b)', () => {
  it('finds the plan files among the paths a quest changed', () => {
    expect(
      planFilesOf(['subquests.json', 'plans/z.md', 'plans/orders/a.MD', 'docs/plans/b.md', 'plans/c.txt']),
    ).toEqual(['plans/orders/a.MD', 'plans/z.md']);
  });

  it('has every section of the template, and gives its summary with a fence kept as text', () => {
    expect(planFileGapsOf(PLAN)).toEqual([]);
    expect(planSummaryOf(PLAN)).toBe(
      [
        'Two parts: the endpoint (knight, D), then its page (knight, D). About 400k tokens.',
        '',
        '```markdown',
        '## Not a heading inside a fence',
        '```',
      ].join('\n'),
    );
  });

  it('names the sections a plan file lacks or leaves empty, in order, and has no summary without one', () => {
    const thin = PLAN.replace(/## Summary[\s\S]*?## Survey/, '## Survey').replace('None.', '');
    expect(planFileGapsOf(thin)).toEqual(['summary', 'unknowns']);
    expect(planSummaryOf(thin)).toBeUndefined();
    expect(planSummaryOf('## Summary\n\n## Survey\n\nx')).toBeUndefined();
  });

  it('holds a plan to one file that follows the template, else names every gap', () => {
    const good = { file: 'plans/orders.md', text: PLAN };
    const bad = { file: 'plans/old.md', text: '# Old\n\nNotes.' };
    expect(planFileIssuesOf([bad, good])).toEqual([]);
    expect(planFileIssuesOf([])).toEqual([{ code: 'no_plan_file' }]);
    const issues = planFileIssuesOf([bad]);
    expect(issues).toEqual([
      {
        code: 'plan_file_gaps',
        file: 'plans/old.md',
        sections: ['summary', 'survey', 'shared_decisions', 'sub_quests', 'done_when', 'unknowns'],
      },
    ]);
    expect(issues.map(planFileIssueLine)).toEqual([
      'plans/old.md lacks "## Summary", "## Survey", "## Shared decisions", "## Sub-quests", "## Done when", "## Unknowns", or they are empty: a plan file has "## Summary", "## Survey", "## Shared decisions", "## Sub-quests", "## Done when", "## Unknowns"',
    ]);
    expect(planFileIssueLine({ code: 'no_plan_file' })).toBe(
      'no plan file: the plan is written to plans/<short-topic>.md in the plot and committed with the list',
    );
  });
});

const BRIEF = [
  '## Brief',
  '',
  '### Goal',
  '',
  'Export the orders.',
  '',
  '### Questions, with the answers the owner accepted by confirming this quest',
  '',
  '- CSV or JSON? Recommended: CSV',
].join('\n');

describe('splitBrief (PS-06b)', () => {
  it('cuts the brief off the rest of the description at its next section', () => {
    expect(splitBrief(`\n${BRIEF}\n\n## Goal\n\nPlan the export.`)).toEqual({
      brief: BRIEF,
      rest: '## Goal\n\nPlan the export.',
    });
  });

  it("ends at a party's rule, keeps a heading inside a fence, and runs to the end without either", () => {
    const fenced = `${BRIEF}\n\n\`\`\`\n## Inside\n\`\`\``;
    expect(splitBrief(`${fenced}\n---\nFor the mage.`)).toEqual({
      brief: fenced,
      rest: '---\nFor the mage.',
    });
    expect(splitBrief(BRIEF)).toEqual({ brief: BRIEF, rest: '' });
  });

  it('finds no brief in a description that does not open with one', () => {
    expect(splitBrief('## Goal\n\n## Brief')).toBeUndefined();
    expect(splitBrief('')).toBeUndefined();
  });
});
