// Permanent read-time upgrades. Every version keeps its fixture and migration (ADR 0003).
import { currentEventVersion } from './run.ts';
import { v1ToV2 } from './v1-to-v2.ts';
import type { EventMigrationChain } from './run.ts';

export const EVENT_MIGRATIONS: EventMigrationChain = [v1ToV2];

export const CURRENT_EVENT_VERSION = currentEventVersion(EVENT_MIGRATIONS);
