// The verifier's structured output goes to Claude Code with --json-schema (§3.2), and the top of that schema becomes a
// tool's input schema: no allOf, anyOf or oneOf there (Claude Code 2.1.322 refused the amendment's for its allOf, M2 of
// 2026-11-14), no 2020-12 $schema (2.1.319, P1-13). It is written by hand, not taken from docs/schemas/verdict, whose
// rules are an allOf at its top; this keeps an edit from bringing one in (fix/amendment-schema).
import { describe, expect, it } from 'vitest';

import { VERDICT_OUTPUT_SCHEMA } from './sessions/request.ts';

const TOP_REFUSED = ['allOf', 'anyOf', 'oneOf', '$schema'];

describe("the verifier's --json-schema", () => {
  it('is an object with no combinator nor $schema at its top', () => {
    expect(VERDICT_OUTPUT_SCHEMA.type).toBe('object');
    expect(Object.keys(VERDICT_OUTPUT_SCHEMA).filter((key) => TOP_REFUSED.includes(key))).toEqual([]);
  });
});
