import { EVENT_VERSION, EventSchema } from '@elvaria/domain';

export const carriedRedHistory = (day: string) =>
  [true, false].map((carried, n) =>
    EventSchema.parse({
      v: EVENT_VERSION,
      id: `01JC00000000000000000003${String(n).padStart(2, '0')}`,
      ts: `${day}T08:0${n}:00+07:00`,
      actor: { kind: 'steward' },
      type: 'patrol.ran',
      data: {
        territory: 'dc1-se-team',
        head: 'a'.repeat(40),
        tree: 'b'.repeat(40),
        trigger: 'schedule',
        setup: null,
        scans: [],
        checks: [
          {
            id: 'test',
            pass: carried,
            duration_ms: 0,
            timed_out: false,
            environment: false,
            ...(carried ? { carried_from: '01KAAAAAAAAAAAAAAAAAAAAAAA' } : { log_path: '.runs/test.log' }),
          },
        ],
      },
    }),
  );
