// The scripture block (PS-12): runner-core prints the lessons the Steward chose and nothing else of their lines.
import { LessonRefSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { scriptureBlock } from './blocks.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();

describe('scriptureBlock (PS-12)', () => {
  it('prints each lesson as one item, its sentence alone, in the order given', () => {
    const block = scriptureBlock(
      [
        { ref: LessonRefSchema.parse('T_0123456789'), text: 'Write files with LF line endings.' },
        {
          ref: LessonRefSchema.parse('L_20261119_4k2pqz'),
          text: 'Compare commits with `git diff <base>...HEAD`.',
        },
      ],
      templates,
    );
    expect(block).toContain(
      'say otherwise.\n\n- Write files with LF line endings.\n- Compare commits with `git diff <base>...HEAD`.',
    );
    expect(block).not.toContain('T_0123456789');
    expect(block).not.toContain('L_20261119_4k2pqz');
  });

  it('is empty when the Steward chose none', () => {
    expect(scriptureBlock([], templates)).toBe('');
  });
});
