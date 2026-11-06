// Numbers of the world state (implementation-plan §8 P0-09).

/**
 * The shape of WorldState, written into every snapshot. Raise it whenever a snapshot written before the change
 * would not parse, or would parse into a wrong state; old snapshots are then rebuilt, not migrated (§2.1).
 */
export const WORLD_STATE_VERSION = 1;
