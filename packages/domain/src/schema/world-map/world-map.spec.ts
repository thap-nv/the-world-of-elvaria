import { describe, expect, it } from 'vitest';

import examples from '../../../examples/world-map.json' with { type: 'json' };
import { WorldMapSchema } from './world-map.ts';

const [example] = examples;

const triangle = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
  { x: 0, z: 10 },
];
const region = (id: string, roads_to: string[] = [], territory = id) => ({
  id,
  territory,
  anchor: { x: 0, z: 0 },
  bounds: triangle,
  roads_to,
});
const minimal = { version: 1, generated_at: '2026-11-20T10:00:00+07:00', regions: [] };

const issuesOf = (value: unknown) => {
  const result = WorldMapSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('WorldMapSchema', () => {
  it('accepts the example of the v1 contract unchanged', () => {
    expect(WorldMapSchema.parse(example)).toEqual(example);
  });

  it.each([
    ['an empty map', minimal],
    ['two regions joined by a road', { ...minimal, regions: [region('a', ['b']), region('b', ['a'])] }],
    ['a one-way road', { ...minimal, regions: [region('a', ['b']), region('b')] }],
    [
      'negative and fractional coordinates',
      { ...minimal, regions: [{ ...region('a'), anchor: { x: -1.5, z: 2.25 } }] },
    ],
  ])('accepts %s', (_, value) => {
    expect(issuesOf(value)).toEqual([]);
  });

  it.each([
    ['an unknown field', { ...minimal, heightmap: [] }, ': Unrecognized key'],
    ['version 2', { ...minimal, version: 2 }, 'version: '],
    [
      'a generation time without offset',
      { ...minimal, generated_at: '2026-11-20T10:00:00' },
      'generated_at: ',
    ],
    [
      'a stored level of detail',
      { ...minimal, regions: [{ ...region('a'), lod: 2 }] },
      'regions.0: Unrecognized key',
    ],
    ['a region id that is not a slug', { ...minimal, regions: [region('A', [], 'a')] }, 'regions.0.id: '],
    [
      'a territory that is not a slug',
      { ...minimal, regions: [region('a', [], 'A')] },
      'regions.0.territory: ',
    ],
    [
      'a point with y',
      { ...minimal, regions: [{ ...region('a'), anchor: { x: 0, y: 0, z: 0 } }] },
      'regions.0.anchor: ',
    ],
    [
      'a point without z',
      { ...minimal, regions: [{ ...region('a'), anchor: { x: 0 } }] },
      'regions.0.anchor.z: ',
    ],
    [
      'a coordinate that is a string',
      { ...minimal, regions: [{ ...region('a'), anchor: { x: '0', z: 0 } }] },
      'regions.0.anchor.x: ',
    ],
    [
      'an infinite coordinate',
      { ...minimal, regions: [{ ...region('a'), anchor: { x: Infinity, z: 0 } }] },
      'regions.0.anchor.x: ',
    ],
    [
      'bounds of two points',
      { ...minimal, regions: [{ ...region('a'), bounds: triangle.slice(0, 2) }] },
      'regions.0.bounds: ',
    ],
    [
      'a road to a region twice',
      { ...minimal, regions: [region('a', ['b', 'b']), region('b')] },
      'regions.0.roads_to: items must be unique',
    ],
    ['a road that is not a slug', { ...minimal, regions: [region('a', ['B'])] }, 'regions.0.roads_to.0: '],
    [
      'two regions with one id',
      { ...minimal, regions: [region('a', [], 'x'), region('a', [], 'y')] },
      'regions.1.id: duplicate id "a"',
    ],
    [
      'a territory with two regions',
      { ...minimal, regions: [region('a', [], 'x'), region('b', [], 'x')] },
      'regions.1.territory: territory "x" has more than one region',
    ],
    [
      'a road to a region that does not exist',
      { ...minimal, regions: [region('a', ['b', 'c']), region('b')] },
      'regions.0.roads_to.1: road to unknown region "c"',
    ],
  ])('rejects %s', (_, value, expected) => {
    const lines = issuesOf(value);
    expect(lines.map((line) => line.slice(0, expected.length))).toContain(expected);
  });
});
