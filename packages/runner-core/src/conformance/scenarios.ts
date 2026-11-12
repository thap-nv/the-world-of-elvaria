// The scenarios a fake character plays (implementation-plan §10, question 5): FakeRunner plays them in process,
// and every adapter's fake CLI (`fixtures/fake-<cli>.mjs`) plays them from env FAKE_SCENARIO_ENV, so the
// conformance suite drives both the same way.
import { HANDOVER_SECTIONS } from '../runner/handover.ts';

export const FAKE_SCENARIOS = [
  'submit',
  'crash',
  'hang',
  'rate_limit',
  'forbidden_command',
  'ask',
  'scratch_commit',
  'spawn_child',
] as const;
export type FakeScenario = (typeof FAKE_SCENARIOS)[number];

/** The env variable a fake CLI (and FakeRunner, by default) reads its scenario from. */
export const FAKE_SCENARIO_ENV = 'ELVARIA_FAKE_SCENARIO';
/** What the fake character asks the owner in `ask`. */
export const FAKE_QUESTION = 'Should the release notes go on main or on the release branch?';
/** What the fake character tries in `forbidden_command`: stage 1 never pushes. */
export const FAKE_FORBIDDEN_COMMAND = 'git push origin HEAD';
/**
 * What a fake judge tries from its scratch plot in `scratch_commit` (ADR 0022, P1-20): keep what it broke on purpose
 * on a commit, then push it. Its class allows both; the fences of a scratch plot refuse both.
 */
export const FAKE_SCRATCH_COMMANDS = ['git commit -am "break the walls"', FAKE_FORBIDDEN_COMMAND] as const;

export const isFakeScenario = (value: unknown): value is FakeScenario =>
  typeof value === 'string' && (FAKE_SCENARIOS as readonly string[]).includes(value);

/**
 * The letter a fake character leaves. A fake CLI writes it to `<ELVARIA_KINGDOM>/quests/<ELVARIA_QUEST>/handover.md`,
 * FakeRunner to SpawnRequest.handover; the Question section holds `question` when there is one.
 */
export function fakeLetter(question?: string): string {
  const body = (section: string): string => {
    if (section === 'Question') return question ?? '';
    return section === 'Where I am' ? 'A fake session of the conformance suite.' : '-';
  };
  return `${HANDOVER_SECTIONS.map((section) => `## ${section}\n\n${body(section)}`.trimEnd()).join('\n\n')}\n`;
}
