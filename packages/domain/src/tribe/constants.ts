// Numbers and ranks tribeLimitsOf decides with (implementation-plan §3.14).
import type { Rank } from '../schema/common.ts';

/** Without a tool gate nothing stops a forbidden command before it runs, so the tribe keeps to small quests. */
export const NO_TOOL_GATE_MAX_RANK: Rank = 'D';
export const FULL_MAX_RANK: Rank = 'S';
