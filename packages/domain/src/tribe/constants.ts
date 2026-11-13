// Numbers and ranks tribeLimitsOf decides with (implementation-plan §3.14), and the numbers tribeLookOf draws with
// (PS-24).
import type { Rank } from '../schema/common.ts';

/** Without a tool gate nothing stops a forbidden command before it runs, so the tribe keeps to small quests. */
export const NO_TOOL_GATE_MAX_RANK: Rank = 'D';
export const FULL_MAX_RANK: Rank = 'S';

/**
 * 32-bit FNV-1a, where a tribe id starts its walk through each list of the look pool: the same id gives the same
 * start on every machine and every run, and it is written here, not taken from a library, so it never changes.
 */
export const LOOK_HASH_OFFSET = 0x81_1c_9d_c5;
export const LOOK_HASH_PRIME = 0x01_00_01_93;

/**
 * How far down the walk a part goes: a part no tribe holds first; then one another tribe holds; for a crest, last,
 * one whose pair with the palette already drawn another tribe holds too ("hết kho thì ghép bảng màu với huy hiệu
 * khác", plans/phase-1.5.md PS-24).
 */
export const LOOK_TIERS = { free: 0, held: 1, pair_held: 2 } as const;
