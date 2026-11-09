// The event contract as JSON Schema (ADR 0003, implementation-plan §2.3): one data rule per data schema, the type
// catalogue carried without restricting `type`, every data schema inlined.
import { describe, expect, it } from 'vitest';

import { contractOf } from '../json-schema.ts';
import { EVENT_DATA_SCHEMAS } from './event-data.ts';
import { EVENT_TYPES, isKnownEventType } from './event-types.ts';
import { EventSchema } from './event.ts';

describe('event contract', () => {
  const contract = contractOf('event', EventSchema);

  it('states one data rule per data schema, shared types in one enum', () => {
    const rules = contract.allOf as { if: { properties: { type: unknown } } }[];
    expect(rules.map((rule) => rule.if.properties.type)).toContainEqual({
      enum: ['command.applied', 'command.rejected'],
    });
    expect(rules).toHaveLength(new Set(Object.values(EVENT_DATA_SCHEMAS)).size);
  });

  it('carries the type catalogue without restricting type', () => {
    const defs = contract.$defs as Record<string, { enum?: unknown }>;
    expect(Object.keys(defs)).toEqual(['known_types']);
    expect(defs.known_types?.enum).toEqual([...EVENT_TYPES]);
    expect(isKnownEventType('character.level_up')).toBe(true);
  });

  it('inlines every data schema, so no rule points at a $defs entry that is not there', () => {
    expect(JSON.stringify(contract)).not.toContain('$ref');
  });
});
