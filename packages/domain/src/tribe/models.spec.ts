import { describe, expect, it } from 'vitest';

import { modelsOfTribes } from './capabilities.ts';
import { modelEntryOf, modelsProblems } from './models.ts';
import type { TribeId } from '../core/ids.ts';
import type { TribeModel } from './models.ts';

/** A CLI that runs several makers' models under its own names, and an automatic chooser (PS-23). */
const MODELS: readonly TribeModel[] = [
  { id: 'northwind', family: 'northwind' },
  { id: 'northwind-large', family: 'northwind', starting_level: 5 },
  { id: 'swift', family: 'southpeak', starting_level: 3 },
  { id: 'auto' },
];

describe('modelEntryOf', () => {
  it('serves a slug by the longest id it equals or starts with before a dash', () => {
    expect(modelEntryOf(MODELS, 'northwind-large-high')?.id).toBe('northwind-large');
    expect(modelEntryOf(MODELS, 'northwind-small')?.id).toBe('northwind');
    expect(modelEntryOf(MODELS, 'swift')?.family).toBe('southpeak');
    expect(modelEntryOf(MODELS, 'auto')).toEqual({ id: 'auto' });
  });

  it('serves nothing the list does not name, and no slug that only shares letters with an id', () => {
    expect(modelEntryOf(MODELS, 'swiftly')).toBeUndefined();
    expect(modelEntryOf(MODELS, 'gemini-4-argon')).toBeUndefined();
    expect(modelEntryOf([], 'auto')).toBeUndefined();
  });
});

describe('modelsProblems', () => {
  it('accepts no list at all, as in an adapter file older than the field, and a well-formed one', () => {
    expect(modelsProblems(undefined)).toEqual([]);
    expect(modelsProblems(MODELS)).toEqual([]);
  });

  it('names each problem of a malformed list', () => {
    expect(modelsProblems([])).toEqual(['capability models is not a non-empty list']);
    expect(modelsProblems('auto')).toEqual(['capability models is not a non-empty list']);
    expect(
      modelsProblems([
        'auto',
        { id: 'Auto', family: 'GPT', starting_level: 11 },
        { id: 'x', starting_level: 1.5 },
        { id: 'x', family: 7 },
      ]),
    ).toEqual([
      'capability models[0] is not an object',
      'capability models[1].id is not a model slug',
      'capability models[1].family is not a lower-case family id',
      'capability models[1].starting_level is not a level from 1 to 10',
      'capability models[2].starting_level is not a level from 1 to 10',
      'capability models[3].family is not a lower-case family id',
      'capability models names x twice',
    ]);
  });
});

describe('modelsOfTribes', () => {
  it('keeps the lists of the tribes whose runner declares one', () => {
    const flint = 'flint' as TribeId;
    expect(modelsOfTribes({ [flint]: { models: MODELS }, ['claude' as TribeId]: {} })).toEqual({
      flint: MODELS,
    });
  });
});
