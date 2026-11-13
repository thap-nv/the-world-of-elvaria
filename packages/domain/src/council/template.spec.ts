import { describe, expect, it } from 'vitest';

import { described } from './__fixtures__/drafts.ts';
import { templateIssueLine, templateIssuesOf } from './template.ts';
import type { Rank } from '../schema/common.ts';

const CHECKS = ['typecheck', 'unit'];
const issuesOf = (description: string, rank: Rank = 'D') =>
  templateIssuesOf({ description, rank, tier: 'session' }, CHECKS).map(templateIssueLine);

describe('templateIssuesOf (the quest template, PS-06)', () => {
  it('passes a description with every section, its steps numbered and its checks known', () => {
    expect(issuesOf(described())).toEqual([]);
  });

  it('wants the steps in order up to rank D, and none from rank C (owner, 2026-11-12)', () => {
    const noSteps = described(['Steps']);
    expect(issuesOf(noSteps, 'D')).toEqual(['no "## Steps" section, or it is empty']);
    expect(issuesOf(noSteps, 'F')).toHaveLength(1);
    expect(issuesOf(noSteps, 'C')).toEqual([]);
    expect(issuesOf(described([], '- add the code\n- test it'), 'E')).toEqual([
      '"## Steps" has no numbered step: ranks F to D list their steps in order',
    ]);
    expect(issuesOf(described([], '- any order'), 'B')).toEqual([]);
    expect(issuesOf(described([], '1) First.'), 'D')).toEqual([]);
  });

  it('names every section missing or empty, in the template order', () => {
    expect(issuesOf('Just do it.', 'C')).toEqual([
      'no "## Goal" section, or it is empty',
      'no "## Files" section, or it is empty',
      'no "## Done when" section, or it is empty',
      'no "## Do not touch" section, or it is empty',
      'no "## Known traps" section, or it is empty',
    ]);
    expect(issuesOf(described().replace('None known.', '   '), 'C')).toEqual([
      'no "## Known traps" section, or it is empty',
    ]);
  });

  it('reads headings in any case, with a colon, and not inside a code fence or below level two', () => {
    const loose = described().replace('## Goal', '##   goal:').replace('## Files', '## FILES');
    expect(issuesOf(loose)).toEqual([]);
    const fenced = described(['Known traps']).concat('\n\n```md\n## Known traps\n\nNone.\n```');
    expect(issuesOf(fenced)).toEqual(['no "## Known traps" section, or it is empty']);
    const deeper = described(['Known traps']).concat('\n\n### Known traps\n\nNone.');
    expect(issuesOf(deeper)).toEqual(['no "## Known traps" section, or it is empty']);
    const titled = `# A title\n\nIntro.\n\n${described()}`;
    expect(issuesOf(titled)).toEqual([]);
  });

  it('ends a section at the next heading of level one, and keeps the first of two same headings', () => {
    const cut = described().replace('## Known traps\n\nNone known.', '## Known traps\n\n# Appendix\n\nNone.');
    expect(issuesOf(cut)).toEqual(['no "## Known traps" section, or it is empty']);
    const twice = `${described()}\n\n## Goal\n\n`;
    expect(issuesOf(twice)).toEqual([]);
  });

  it('holds the checks "Done when" names by id against the territory, never a command', () => {
    const named = described().replace('check `typecheck` passes', 'check `e2e` and Check `unit` pass');
    expect(issuesOf(named)).toEqual(['"Done when" names check `e2e`, which its territory does not have']);
    expect(issuesOf(described().replace('`typecheck`', '`pnpm test`'))).toEqual([]);
    expect(templateIssuesOf({ description: named, rank: 'D', tier: 'session' })).toEqual([]);
  });

  it('leaves a script-tier draft alone: a catalog script runs it', () => {
    expect(templateIssuesOf({ description: 'Count the files.', rank: 'F', tier: 'script' })).toEqual([]);
  });
});
