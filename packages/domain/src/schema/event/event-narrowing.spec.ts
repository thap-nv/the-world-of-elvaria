// How a reader narrows a parsed line to the data of its type (event.ts). Out of event.spec.ts, whose file reached
// its limit (PS-02).
import { describe, expect, expectTypeOf, it } from 'vitest';

import examples from '../../../examples/event.json' with { type: 'json' };
import { EventSchema, isEventOf, isTypedEvent } from './event.ts';
import type { ToolKind } from './event-data.ts';

const line = (type: string) => ({
  v: 1,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-06T09:12:03+07:00',
  type,
  actor: { kind: 'steward' },
  data: {},
});

describe('event narrowing', () => {
  const [toolLine, manaLine] = examples.map((example) => EventSchema.parse(example));

  it('narrows data by type through isTypedEvent', () => {
    expect(isTypedEvent(toolLine!)).toBe(true);
    expect(isTypedEvent(EventSchema.parse(line('delivery.sent')))).toBe(false);
    const event = toolLine!;
    if (!isTypedEvent(event)) throw new Error('expected a typed event');
    switch (event.type) {
      case 'agent.tool':
        expectTypeOf(event.data.tool).toEqualTypeOf<ToolKind>();
        expect(event.data.path).toBe('src/auth/login.ts');
        break;
      default:
        throw new Error(`unexpected ${event.type}`);
    }
  });

  it('narrows to one type through isEventOf', () => {
    expect(isEventOf(toolLine!, 'mana.level')).toBe(false);
    const event = manaLine!;
    if (!isEventOf(event, 'mana.level')) throw new Error('expected mana.level');
    expectTypeOf(event.data.used_pct).toEqualTypeOf<number>();
    expect(event.data.used_pct).toBe(42);
  });
});
