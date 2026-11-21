import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { WINDOW, shapeClones, tokensOf } from './shape-detect.mjs';

const K = ts.SyntaxKind;
const k = (...kinds: ts.SyntaxKind[]) => kinds.map(String);

/** A function of about 90 tokens and more than 10 distinct ones; `n` renames everything a rename can touch. */
const body = (n: string) => `export function ${n}Parts(${n}Input: string, ${n}Limit: number): string[] {
  const ${n}Out: string[] = [];
  for (const ${n}Part of ${n}Input.split('${n},')) {
    if (${n}Part.length > ${n}Limit + 1) continue;
    const ${n}Trimmed = ${n}Part.trim();
    if (${n}Trimmed === '') ${n}Out.push('${n}-empty');
    else ${n}Out.push(${n}Trimmed.toUpperCase());
  }
  return ${n}Out.length > 0 ? ${n}Out : ['${n}'];
}
`;
const file = (path: string, text: string) => ({ path, text });

describe('tokensOf', () => {
  it('makes identifiers, strings and numbers alike, and keeps every other token kind', () => {
    expect(tokensOf("const a = 'x' + 12n * 3;").kinds).toEqual([
      ...k(K.ConstKeyword),
      'I',
      ...k(K.EqualsToken),
      'S',
      ...k(K.PlusToken),
      'N',
      ...k(K.AsteriskToken),
      'N',
      ...k(K.SemicolonToken),
    ]);
  });

  it('leaves out import statements and interfaces, not import() or import.meta', () => {
    const text = [
      "import type { A } from './a.ts';",
      'interface B { c: { d: number }; e: string }',
      'const f = import.meta.url;',
      "await import('g');",
    ].join('\n');
    const dot = String(K.DotToken);
    const semi = String(K.SemicolonToken);
    const imp = String(K.ImportKeyword);
    expect(tokensOf(text).kinds).toEqual([
      ...[String(K.ConstKeyword), 'I', String(K.EqualsToken), imp, dot, 'I', dot, 'I', semi],
      ...[String(K.AwaitKeyword), imp, String(K.OpenParenToken), 'S', String(K.CloseParenToken), semi],
    ]);
    expect(tokensOf(text).lines).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4]);
  });

  it('reads the rest of a template as the template, not as code', () => {
    // a bare scanner reads ` c ${` as code and the next backtick as a new template, swallowing `; f(1);`
    expect(tokensOf('const s = `a ${b + `x${y}`} c ${d}`; f(1);').kinds).toEqual([
      ...k(K.ConstKeyword),
      'I',
      ...k(K.EqualsToken),
      'S',
      'I',
      ...k(K.PlusToken),
      ...['S', 'I', 'S', 'S', 'I', 'S'],
      ...k(K.SemicolonToken),
      'I',
      ...k(K.OpenParenToken),
      'N',
      ...k(K.CloseParenToken, K.SemicolonToken),
    ]);
  });

  it('reads a regular expression as a literal, and a slash after a value as division', () => {
    expect(tokensOf("const r = /'[}]/g; return a / b;").kinds).toEqual([
      ...k(K.ConstKeyword),
      'I',
      ...k(K.EqualsToken),
      'S',
      ...k(K.SemicolonToken, K.ReturnKeyword),
      'I',
      ...k(K.SlashToken),
      'I',
      ...k(K.SemicolonToken),
    ]);
    expect(tokensOf('if (x) return /a/.test(y);').kinds).toContain('S');
  });
});

describe('shapeClones', () => {
  /** The tokens of `body`, counted by hand: 17 + 10 + 13 + 12 + 9 + 13 + 12 + 1 + 13 + 1 per line. */
  const size = 101;

  it('pairs a copy whose names, strings and numbers were changed, over all its tokens and lines', () => {
    expect(size).toBeGreaterThan(WINDOW);
    const found = shapeClones([
      file('packages/b/src/b.ts', body('beta')),
      file('packages/a/src/a.ts', body('a')),
    ]);
    expect(found.pairs).toEqual([
      { a: 'packages/a/src/a.ts', b: 'packages/b/src/b.ts', tokens: size, linesA: '1-10', linesB: '1-10' },
    ]);
    expect(found).toMatchObject({ files: 2, tokens: 2 * size, cloned: 2 * size });
  });

  it('counts the smaller side and the shared lines only, whatever the order of the files', () => {
    const longer = `${body('a')}\nexport const extra = 1;\n`;
    const sources = [file('apps/x/src/z.ts', body('z')), file('apps/x/src/y.ts', longer)];
    const found = shapeClones(sources);
    expect(found.pairs).toEqual([
      { a: 'apps/x/src/y.ts', b: 'apps/x/src/z.ts', tokens: size, linesA: '1-10', linesB: '1-10' },
    ]);
    expect(shapeClones([...sources].reverse())).toEqual(found);
  });

  it('pairs nothing shorter than the window, which a smaller window does pair', () => {
    const short = (n: string) => `export const ${n} = (x: number) => (x > 1 ? [x, '${n}'] : []);\n`;
    const sources = [file('a.ts', short('a')), file('b.ts', short('b'))];
    expect(shapeClones(sources).pairs).toEqual([]);
    expect(shapeClones(sources, 10).pairs).toHaveLength(1);
  });

  it('skips a data table of few distinct tokens', () => {
    const table = (n: string) =>
      `export const ${n} = [${Array.from({ length: 60 }, (_, i) => `'${n}${i}'`).join(', ')}];\n`;
    expect(shapeClones([file('a.ts', table('a')), file('b.ts', table('b'))]).pairs).toEqual([]);
  });

  it('calls a shape shared by more than 12 files an idiom, not a copy', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => file(`f${i}.ts`, body(`n${i}`)));
    expect(shapeClones(many(12)).pairs).toHaveLength(66);
    expect(shapeClones(many(13))).toMatchObject({ pairs: [], cloned: 0 });
  });
});
