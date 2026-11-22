export { CONFORMANCE_CHECKS, conformanceChecks } from './checks.ts';
export { runConformance } from './run.ts';
export type { ConformanceReport } from './run.ts';
export {
  FAKE_FORBIDDEN_COMMAND,
  FAKE_SCRATCH_COMMANDS,
  FAKE_SECRET_COMMANDS,
  FAKE_QUESTION,
  FAKE_SCENARIOS,
  FAKE_SCENARIO_ENV,
  FAKE_STRUCTURED_ANSWER,
  FAKE_STRUCTURED_SCHEMA,
  fakeLetter,
  isFakeScenario,
} from './scenarios.ts';
export type { FakeScenario } from './scenarios.ts';
export {
  FAKE_IMAGE_FILE,
  FAKE_IMAGE_SCHEMA,
  fakeImageAnswer,
  fakeImageAsk,
  fakeImageOf,
  fakeImagePath,
  writeFakeImage,
} from './image-probe.ts';
export type { FakeImageAnswer } from './image-probe.ts';
export { COLORS as STRIPE_COLORS, randomColors, stripesOf, stripesPng } from './stripes.ts';
export type { StripeColor } from './stripes.ts';
export {
  SPAWN_PROBE_COMMAND,
  SPAWN_PROBE_FAILED,
  SPAWN_PROBE_FILE,
  SPAWN_PROBE_OK,
  SPAWN_PROBE_OUT,
  SPAWN_PROBE_SCRIPT,
  readSpawnProbe,
  runFakeShellLine,
  writeSpawnProbe,
} from './spawn-probe.ts';
export type {
  CheckOutcome,
  ConformanceCheck,
  ConformanceTarget,
  FailedWorkspace,
  LeftWorkspace,
} from './target.ts';
export {
  CONFORMANCE_CHARACTER,
  CONFORMANCE_QUEST,
  conformanceRequest,
  openWorkspace,
  prepareWorkspace,
} from './workspace.ts';
export type { Prepared, Workspace } from './workspace.ts';
