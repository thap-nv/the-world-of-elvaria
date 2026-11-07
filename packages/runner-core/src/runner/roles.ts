// Who a session is for (implementation-plan §3.7): the hook reads it as ELVARIA_ROLE, ToolPolicy and the prompts
// follow it. Its own file because both the runner's types and the tool policy need it.

export const SPAWN_ROLES = ['assignee', 'verifier', 'chancellor', 'monk', 'bard'] as const;
export type SpawnRole = (typeof SPAWN_ROLES)[number];
