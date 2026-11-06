// Readers check every line with the domain's EventSchema, but the domain is loaded on the first read, not when
// this package is imported. The hook (P1-08) may import only @elvaria/eventlog and must start in < 100 ms
// (implementation-plan §1.4, §3.6); loading @elvaria/domain and zod takes 200–350 ms (measured 2026-11-06,
// Node 24.20 on Windows). Writers never read, so a hook never pays for it. light-entry.spec.ts holds this.
import type { EventSchema } from '@elvaria/domain';

export type EventLineSchema = typeof EventSchema;

let loading: Promise<EventLineSchema> | undefined;

export function loadEventSchema(): Promise<EventLineSchema> {
  loading ??= import('@elvaria/domain').then((domain) => domain.EventSchema);
  return loading;
}
