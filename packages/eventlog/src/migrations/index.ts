// The chain of event line upgrades. Empty while every line is v1. When EventSchema moves to v2, add
// `v1-to-v2.ts` here and a fixture `v2.jsonl` beside `v1.jsonl`: migrations.spec.ts reads every fixture with
// the current reader and checks that this chain ends at the `v` the schema accepts.
import { currentEventVersion } from './run.ts';
import type { EventMigrationChain } from './run.ts';

export const EVENT_MIGRATIONS: EventMigrationChain = [];

export const CURRENT_EVENT_VERSION = currentEventVersion(EVENT_MIGRATIONS);
