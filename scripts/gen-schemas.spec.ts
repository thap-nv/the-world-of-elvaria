import { readdirSync, readFileSync } from 'node:fs';

import { CONTRACTS } from '@elvaria/domain';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { render, repoFiles, run } from './gen-schemas.mjs';

const NAMES = Object.keys(CONTRACTS);
const SCHEMAS = new URL('../docs/schemas/', import.meta.url);

/** An in-memory docs/schemas/ holding `files`, recording what the generator writes. */
function memory(files: Record<string, string>) {
  const written: Record<string, string> = {};
  return {
    written,
    read: (file: string) => files[file],
    write: (file: string, text: string) => {
      written[file] = text;
    },
    list: () => Object.keys(files),
  };
}

const allRendered = () => Object.fromEntries(NAMES.map((name) => [`${name}.schema.json`, render(name)]));

describe('gen-schemas', () => {
  it('finds nothing to do when every contract matches its zod source', () => {
    expect(run(['--check'], memory(allRendered()))).toEqual({
      code: 0,
      text: `docs/schemas: ${NAMES.length} contracts, up to date`,
    });
  });

  it('reports drift under --check without writing, and rewrites it otherwise', () => {
    const files = { ...allRendered(), 'kingdom.schema.json': '{}\n' };
    const checked = memory(files);
    expect(run(['--check'], checked)).toEqual({
      code: 1,
      text: 'docs/schemas/kingdom.schema.json differs from its zod source: run pnpm schemas',
    });
    expect(checked.written).toEqual({});
    const fixed = memory(files);
    expect(run([], fixed)).toEqual({ code: 0, text: `docs/schemas: ${NAMES.length} contracts, 1 written` });
    expect(fixed.written['kingdom.schema.json']).toBe(render('kingdom'));
  });

  it('refuses a contract file that no zod source generates', () => {
    const result = run(['--check'], memory({ ...allRendered(), 'ghost.schema.json': '{}', 'notes.md': '' }));
    expect(result).toEqual({
      code: 1,
      text: 'docs/schemas/ghost.schema.json has no zod source in CONTRACTS',
    });
  });

  it('writes LF, two-space JSON with the examples last', () => {
    const text = render('tag');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('\r');
    expect(Object.keys(JSON.parse(text) as object).at(-1)).toBe('examples');
  });

  it('matches what is committed in docs/schemas (pnpm schemas --check)', () => {
    expect(run(['--check'], repoFiles())).toMatchObject({ code: 0 });
  });
});

describe('docs/schemas with a second validator (ajv, JSON Schema 2020-12)', () => {
  // ajv-formats is CommonJS: under NodeNext its plugin is the default export's `default`.
  const addFormats = addFormatsModule.default;
  // Strict, except two of ajv's opt-in style checks: the contracts use the standard if/then idiom where `then`
  // only lists `required` names that the parent schema defines, which strictRequired/strictTypes flag.
  const ajv = new Ajv2020({ strict: true, strictRequired: false, strictTypes: false, allErrors: true });
  addFormats(ajv);
  const files = readdirSync(SCHEMAS).filter((file) => file.endsWith('.schema.json'));

  it.each(files)('%s compiles and accepts its own examples', (file) => {
    const schema = JSON.parse(readFileSync(new URL(file, SCHEMAS), 'utf8')) as { examples?: unknown[] };
    const validate = ajv.compile(schema);
    for (const example of schema.examples ?? []) {
      expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    }
    expect(schema.examples?.length).toBeGreaterThan(0);
  });
});
