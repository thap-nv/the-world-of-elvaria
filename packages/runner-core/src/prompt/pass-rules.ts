// What each pass rule of a ritual means for the verifier (implementation-plan §3.8), moved out of build-prompt.ts with
// P2-01d, which needed the room.
import type { Ritual } from '@elvaria/domain';

/**
 * What each pass rule means for the verifier; the rule is part of the ritual schema, not registry data. A red check
 * decides, so a judge that hunts its cause spends a session on the assignee's next attempt (a real kingdom's
 * scripture, fix/lesson-step-0).
 */
export const PASS_RULES: Readonly<Record<Ritual['pass_rule'], string>> = {
  all_checks_and_agent:
    "A failing check fails the quest whatever you find, even when you would pass the work: quote its failing lines in your notes and stop there, since finding the cause is the assignee's next attempt. When every check passes, your judgement decides.",
  checks_only: 'The checks alone decide this ritual; record what you see.',
  agent_only: 'No machine check applies to this kind of work; your judgement decides.',
};
