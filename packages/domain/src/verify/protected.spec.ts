// Protected paths (PS-04, ADR 0026): the mark a submit sets, and the stronger judge it asks for whatever the rank.
import { describe, expect, it } from 'vitest';

import { CLASSES, Q1, character, inReview, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { protectedMarkOf, protectedPathsOf, touchesProtected } from './protected.ts';
import { selectVerifier, wantsStrongJudge } from './select-verifier.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';

describe('protectedPathsOf', () => {
  const laws: Territory['laws'] = {
    forbidden_paths: [],
    read_only_paths: [],
    patch_paths: [],
    forbidden_commands: [],
    read_before_write: [],
    rank_floor: [],
  };

  it("reads the territory's globs, none when it names none or is unknown", () => {
    expect(protectedPathsOf({ laws: { ...laws, protected_paths: ['.claude/**'] } })).toEqual(['.claude/**']);
    expect(protectedPathsOf({ laws })).toEqual([]);
    expect(protectedPathsOf(undefined)).toEqual([]);
  });
});

describe('protectedMarkOf', () => {
  it('sets nothing when the work changed no protected path', () => {
    expect(protectedMarkOf({}, [])).toBeUndefined();
    expect(protectedMarkOf({ protected_changes: ['CLAUDE.md'] }, [])).toBeUndefined();
  });

  it('asks for the seal and names the paths, after those of earlier submits, each once', () => {
    expect(protectedMarkOf({}, ['CLAUDE.md'])).toEqual({
      seal_required: true,
      protected_changes: ['CLAUDE.md'],
    });
    expect(protectedMarkOf({ protected_changes: ['CLAUDE.md'] }, ['.claude/x.json', 'CLAUDE.md'])).toEqual({
      seal_required: true,
      protected_changes: ['CLAUDE.md', '.claude/x.json'],
    });
  });
});

describe('a quest whose work changed a protected path', () => {
  const FLASH = character('ilse', {
    cls: 'judge',
    tribe: 'gemini',
    model: 'gemini-3.8-flash-high',
    level: 2,
    since: 0,
  });
  const PRO = character('wren', {
    cls: 'judge',
    tribe: 'gemini',
    model: 'gemini-3.5-pro',
    level: 4,
    since: 30,
  });
  const ofRank = (rank: string, more: Partial<Quest> = {}): Quest =>
    inReview({ ...quest(Q1, { rank }), ...more }, 'thorn');
  const chosen = (q: Quest, candidates: readonly Character[]) => {
    const selection = selectVerifier(q, candidates, {
      same_family: 'different_model',
      classes: CLASSES,
      doers: [character('thorn')],
      party: [],
      free: (candidate) => candidate.status === 'idle',
    });
    return selection !== null && selection.reason !== 'machine_only' ? selection.character.id : selection;
  };
  const touched = { protected_changes: ['packages/hooks/src/index.ts'] };

  it('wants the stronger judge whatever its rank', () => {
    expect(touchesProtected(touched)).toBe(true);
    expect(touchesProtected({})).toBe(false);
    expect(wantsStrongJudge({ rank: 'E', ...touched })).toBe(true);
    expect(wantsStrongJudge({ rank: 'E' })).toBe(false);
    expect(wantsStrongJudge({ rank: 'B' })).toBe(true);
  });

  it('gets the judge of the higher level below rank B, where another quest gets the one idle the longest', () => {
    expect(chosen(ofRank('E', touched), [FLASH, PRO])).toBe('wren');
    expect(chosen(ofRank('E'), [FLASH, PRO])).toBe('ilse');
  });
});
