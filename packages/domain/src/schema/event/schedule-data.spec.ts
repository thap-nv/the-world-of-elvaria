import { describe, expect, it } from 'vitest';

import { EventSchema } from './event.ts';

const line = (data: Record<string, unknown>) => ({
  v: 2,
  id: '01JCF9P206CHRNC00000000001',
  ts: '2026-11-06T21:00:00+07:00',
  type: 'chronicle.written',
  actor: { kind: 'steward' },
  data,
});

const WRITTEN = { day: '2026-11-06', file: 'chronicle/2026-11-06.md', quests: 3, prose: false };

describe('chronicle.written data (P2-06)', () => {
  it('reads the day, the file, the quests and whether prose is in it', () => {
    expect(EventSchema.safeParse(line(WRITTEN)).success).toBe(true);
  });

  it.each([
    ['a file outside chronicle/', { ...WRITTEN, file: 'digest/2026-11-06.md' }],
    ['no prose flag', { day: WRITTEN.day, file: WRITTEN.file, quests: 3 }],
    ['a negative count', { ...WRITTEN, quests: -1 }],
  ])('refuses %s', (_, data) => {
    expect(EventSchema.safeParse(line(data)).success).toBe(false);
  });
});
