import { describe, expect, it } from 'vitest';

import { CHECKS, LETTER, QUEST, RETURNED, TERRITORY } from '../__fixtures__/world.ts';
import { continuationBlock } from './blocks.ts';
import { failedChecksBlock } from './checks.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();
const memory = { handover: LETTER, journal: [], git_log: null };
/** The verdict that returned the work, its unit check red: what the Steward reads the tails for. */
const FAILED = { ...RETURNED, checks: CHECKS.map(({ log_tail: _tail, ...check }) => check) };

describe('the checks of a run that came back (P1-10b)', () => {
  it('follow the verdict with the failing ones and the end of their logs, as the judge saw them', () => {
    const text = continuationBlock(
      QUEST,
      TERRITORY,
      { reason: 'returned', verdict: FAILED, checks: CHECKS, ...memory },
      templates,
    );
    const section = text.slice(
      text.indexOf('## Machine checks that failed'),
      text.indexOf('## Handover letter'),
    );
    expect(section).toContain('- unit (41000 ms)');
    expect(section).toContain('### The end of the log of unit');
    expect(section).toContain('AssertionError: expected 120 to be 108');
    // A check that passed is not the assignee's to fix.
    expect(section).not.toContain('lint');
    expect(text.indexOf('## Verdict')).toBeLessThan(text.indexOf('## Machine checks that failed'));
  });

  it("name the verdict's failing checks when no tail came, and say nothing when every check passed", () => {
    const bare = continuationBlock(
      QUEST,
      TERRITORY,
      { reason: 'returned', verdict: FAILED, ...memory },
      templates,
    );
    expect(bare).toContain('## Machine checks that failed');
    expect(bare).toContain('- unit (41000 ms)');
    expect(bare).not.toContain('The end of the log of');
    const passed = continuationBlock(
      QUEST,
      TERRITORY,
      { reason: 'returned', verdict: RETURNED, ...memory },
      templates,
    );
    expect(passed).not.toContain('## Machine checks that failed');
    expect(failedChecksBlock([], templates)).toBe('');
  });
});
