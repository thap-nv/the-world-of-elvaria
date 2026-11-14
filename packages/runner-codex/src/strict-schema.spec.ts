// The schema Codex gets and the answer the core gets back (fix/codex-output-schema): unit cases, then the fake CLI's
// API side (fixtures/fake-codex-schema.mjs), which refuses what OpenAI's strict structured output refuses, against the
// verdict's shape and the Chancellor's three contracts as `pnpm schemas` writes them.
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FAKE_SCENARIO_ENV, FAKE_STRUCTURED_SCHEMA } from '@elvaria/runner-core';
import type { JsonSchema } from '@elvaria/runner-core';

import { FAKE_CODEX, minimalEnv } from './__fixtures__/codex.ts';
import { strictSchemaOf, withoutNulls } from './strict-schema.ts';

const CONTRACTS = path.resolve(import.meta.dirname, '..', '..', '..', 'docs', 'schemas');
const NULL = { type: 'null' };

describe('strictSchemaOf', () => {
  it("requires every key, a left-out one null, as the judge's verdict needs", () => {
    const { properties } = FAKE_STRUCTURED_SCHEMA;
    expect(strictSchemaOf(FAKE_STRUCTURED_SCHEMA)).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['result', 'fail_kind', 'notes', 'hint', 'progress', 'breaks'],
      properties: {
        result: properties.result,
        // An enum without a type, an object, an array: a union, else the enum or the object would refuse null.
        fail_kind: { anyOf: [properties.fail_kind, NULL] },
        notes: properties.notes,
        // A scalar type says null itself, as OpenAI's guide does.
        hint: { type: ['string', 'null'] },
        progress: { anyOf: [properties.progress, NULL] },
        breaks: { anyOf: [properties.breaks, NULL] },
      },
    });
  });

  it('drops what the API refuses at any depth, closes a free object, and follows $defs and anyOf', () => {
    const schema: JsonSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['drafts'],
      allOf: [{ if: { required: ['x'] }, then: { required: ['y'] } }],
      properties: {
        drafts: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'params'],
            allOf: [{ if: { properties: { id: { const: 'a' } } }, then: { required: ['rank'] } }],
            properties: {
              id: { type: 'string', not: { enum: ['global'] } },
              params: { type: 'object' },
              rank: { $ref: '#/$defs/rank' },
              tags: { type: 'array', uniqueItems: true, items: { type: 'string' } },
            },
          },
        },
        either: { anyOf: [{ type: 'object', properties: { a: { type: 'integer' } } }, NULL] },
      },
      $defs: { rank: { enum: ['F', 'S'] }, box: { type: 'object', properties: { b: { type: 'boolean' } } } },
    };
    expect(strictSchemaOf(schema)).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['drafts', 'either'],
      properties: {
        drafts: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'params', 'rank', 'tags'],
            properties: {
              id: { type: 'string' },
              params: { type: 'object', properties: {}, required: [], additionalProperties: false },
              rank: { anyOf: [{ $ref: '#/$defs/rank' }, NULL] },
              tags: { anyOf: [{ type: 'array', items: { type: 'string' } }, NULL] },
            },
          },
        },
        either: {
          anyOf: [
            {
              anyOf: [
                {
                  type: 'object',
                  properties: { a: { type: ['integer', 'null'] } },
                  required: ['a'],
                  additionalProperties: false,
                },
                NULL,
              ],
            },
            NULL,
          ],
        },
      },
      $defs: {
        rank: { enum: ['F', 'S'] },
        box: {
          type: 'object',
          properties: { b: { type: ['boolean', 'null'] } },
          required: ['b'],
          additionalProperties: false,
        },
      },
    });
  });

  it('leaves the schema it was given as it was', () => {
    const before = JSON.stringify(FAKE_STRUCTURED_SCHEMA);
    strictSchemaOf(FAKE_STRUCTURED_SCHEMA);
    expect(JSON.stringify(FAKE_STRUCTURED_SCHEMA)).toBe(before);
  });
});

describe('withoutNulls', () => {
  it('takes out every key the model wrote null, at any depth, and keeps every other value', () => {
    const answer = {
      result: 'fail',
      fail_kind: null,
      notes: 'x',
      progress: { checked_until: 'a', extra: null },
      breaks: [{ change: 'c', red: 'r', hint: null }],
      count: 0,
      flag: false,
      empty: '',
    };
    expect(withoutNulls(answer)).toEqual({
      result: 'fail',
      notes: 'x',
      progress: { checked_until: 'a' },
      breaks: [{ change: 'c', red: 'r' }],
      count: 0,
      flag: false,
      empty: '',
    });
  });
});

describe("the fake CLI's API side", () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'elvaria strict schema '));
  });
  afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  /** One `codex exec` of the fake with `schema` as its `--output-schema`, playing `structured`: what it printed. */
  async function exec(schema: unknown) {
    const file = path.join(dir, 'schema.json');
    await writeFile(file, JSON.stringify(schema), 'utf8');
    const ran = spawnSync(
      process.execPath,
      [FAKE_CODEX, 'exec', '--json', '-m', 'gpt-6.1-sol', '--output-schema', file, '-'],
      {
        env: { ...minimalEnv(), [FAKE_SCENARIO_ENV]: 'structured' },
        input: 'Give the verdict.',
        encoding: 'utf8',
      },
    );
    const lines = ran.stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as { type: string; message?: string; item?: { text?: string } });
    const error = lines.find((line) => line.type === 'error')?.message;
    // The API's error object, as Codex prints it in the message of its `error` line (live run, 2026-11-14).
    const refusal =
      error === undefined ? undefined : (JSON.parse(error) as { error: { message: string } }).error.message;
    return {
      status: ran.status,
      lines,
      refusal,
      text: lines.findLast((line) => line.item?.text)?.item?.text,
    };
  }

  it("refuses the verdict's schema as the core writes it, as the API did, and takes the strict one", async () => {
    const refused = await exec(FAKE_STRUCTURED_SCHEMA);
    expect(refused.status).toBe(1);
    expect(refused.refusal).toBe(
      "Invalid schema for response_format 'codex_output_schema': 'schema.required' is required to include every key in properties. Missing 'fail_kind'.",
    );
    const taken = await exec(strictSchemaOf(FAKE_STRUCTURED_SCHEMA));
    expect(taken.status).toBe(0);
    // A strict model writes every key; the adapter takes the nulls out again.
    expect(JSON.parse(taken.text ?? '')).toEqual({
      result: 'pass',
      fail_kind: null,
      notes: 'probe',
      hint: null,
      progress: null,
      breaks: null,
    });
  });

  it('refuses uniqueItems, which the guide does not name, in the words of the API', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['ask'],
      properties: { ask: { type: 'array', uniqueItems: true, items: { type: 'string' } } },
    };
    expect((await exec(schema)).refusal).toBe(
      "Invalid schema for response_format 'codex_output_schema': 'schema.properties.ask.uniqueItems' is not permitted when strict is true.",
    );
    expect((await exec(strictSchemaOf(schema))).status).toBe(0);
  });

  for (const contract of ['quest-draft', 'memo-triage', 'amendment-decision']) {
    it(`takes the ${contract} contract once strict, and refuses it as it is`, async () => {
      const text = await readFile(path.join(CONTRACTS, `${contract}.schema.json`), 'utf8');
      const schema = JSON.parse(text) as JsonSchema;
      expect((await exec(schema)).status).toBe(1);
      const taken = await exec(strictSchemaOf(schema));
      expect(taken.lines.filter((line) => line.type === 'error')).toEqual([]);
      expect(taken.status).toBe(0);
    });
  }
});
