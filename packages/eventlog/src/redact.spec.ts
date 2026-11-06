import { describe, expect, it } from 'vitest';

import { KNOWN_SECRET, SECRET_SAMPLES } from './__fixtures__/secrets.ts';
import { EventLogError } from './errors.ts';
import patternFile from './redact-patterns.json' with { type: 'json' };
import {
  REDACTED,
  REDACT_PATTERNS,
  compileRedactPatterns,
  createRedactor,
  redact,
  redactDeep,
} from './redact.ts';

const PATTERN_SAMPLES = SECRET_SAMPLES.filter((sample) => sample.kind !== 'known');

// Text Elvaria writes all day: none of it may be masked, or the journal stops being readable.
const ORDINARY = [
  'pnpm test --filter @elvaria/store',
  'q_20261106_7k3m2a',
  '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  'claude-opus-5-5-low',
  'src/auth/login.ts',
  'max_tokens: 120000, context_budget_tokens=120000',
  'secrets_required: ["gemini_api_key"]',
  'token: short',
  'git push origin quest/q_20261106_7k3m2a',
  'https://github.com/thap-nv/elvaria/pull/10',
  'The bearer of this letter is Thorn.',
  'Sa lầy trong nhiệm vụ q_20261106_7k3m2a',
  'sk-learn is a library',
  '-----BEGIN PUBLIC KEY-----',
];

describe('redact-patterns.json', () => {
  it('is versioned data with unique snake_case ids and allowed flags only', () => {
    expect(patternFile.version).toBe(1);
    const ids = patternFile.patterns.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of patternFile.patterns) {
      expect(entry.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(entry.flags).toMatch(/^[imsu]*$/);
      expect(entry.description).not.toBe('');
    }
    expect(REDACT_PATTERNS.every((pattern) => pattern.global)).toBe(true);
  });

  it('has a fixture sample for every pattern, so a new pattern comes with proof that it works', () => {
    expect(new Set(PATTERN_SAMPLES.map((sample) => sample.kind))).toEqual(
      new Set(patternFile.patterns.map((entry) => entry.id)),
    );
  });

  it('refuses a pattern whose flags would change what replace() does', () => {
    const entry = { id: 'sticky', description: 'x', regex: 'a', flags: 'y' };
    expect(() => compileRedactPatterns([entry])).toThrow(EventLogError);
    expect(() => compileRedactPatterns([{ ...entry, flags: 'g' }])).toThrow(/allowed are i, m, s, u/);
  });
});

describe('redact', () => {
  it.each(PATTERN_SAMPLES)('masks $kind', ({ secret, line, kept }) => {
    const out = redact(line, []);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTED);
    if (kept !== undefined) expect(out).toContain(kept);
  });

  it('masks a known treasury value exactly, which no pattern would catch', () => {
    const line = `echo ${KNOWN_SECRET} && echo ${KNOWN_SECRET}`;
    expect(redact(line, [])).toBe(line);
    expect(redact(line, [KNOWN_SECRET])).toBe(`echo ${REDACTED} && echo ${REDACTED}`);
  });

  it('masks the longest known value whole, takes regex characters literally and ignores empty ones', () => {
    const short = 'p4ss';
    const long = 'p4ss(word)+[42]';
    expect(redact(`a ${long} b ${short} c`, [short, '', long])).toBe(`a ${REDACTED} b ${REDACTED} c`);
    expect(redact('p4ssssss', ['p4s+'])).toBe('p4ssssss');
  });

  it('masks known values before patterns, so no part of a known value stays readable', () => {
    const known = `prefix-${SECRET_SAMPLES.find((sample) => sample.kind === 'anthropic_api_key')?.secret ?? ''}`;
    expect(redact(`key=${known}`, [known])).toBe(`key=${REDACTED}`);
  });

  it('leaves ordinary Elvaria text alone', () => {
    for (const text of ORDINARY) expect(redact(text, [])).toBe(text);
  });

  it('gives the same text when run twice', () => {
    for (const { line } of SECRET_SAMPLES) {
      const once = redact(line, [KNOWN_SECRET]);
      expect(redact(once, [KNOWN_SECRET])).toBe(once);
    }
  });

  it('masks every match of a caller pattern, even one without the g flag', () => {
    expect(redact('abc-1 abc-2', [], [/abc-\d/])).toBe(`${REDACTED} ${REDACTED}`);
  });
});

describe('redactDeep', () => {
  it('redacts every string of a value and keeps keys, numbers and shape; the input is untouched', () => {
    const redactor = createRedactor([KNOWN_SECRET]);
    const value = {
      data: { command: `seed ${KNOWN_SECRET}`, exit: 0, args: [KNOWN_SECRET, 1, null, true] },
      [KNOWN_SECRET]: 'key names stay',
    };
    const copy = structuredClone(value);
    expect(redactDeep(value, redactor)).toEqual({
      data: { command: `seed ${REDACTED}`, exit: 0, args: [REDACTED, 1, null, true] },
      [KNOWN_SECRET]: 'key names stay',
    });
    expect(value).toEqual(copy);
  });
});
