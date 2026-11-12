// Trying a new build before the pointer moves (implementation-plan §3.16.4, ADR 0026; PS-04b), all 0 mana: its
// `doctor` on this kingdom; its conformance suite for each enabled tribe, against the fake CLI the build carries
// for that adapter (`tribe check --scenarios --tool`, which writes nothing); one script-tier quest on a throwaway
// kingdom. Each runs as the new build's own command; the first that fails stops the trial.
import path from 'node:path';

import type { Tribe, UpgradeStep } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { buildCli } from './build-cli.ts';
import { outputOf, reasonOf } from './build.ts';
import { scriptTrial } from './script-trial.ts';
import type { CliIo } from '../io.ts';
import type { StepFailure, Tools } from './build.ts';

const DOCTOR_MINUTES = 5;
const SUITE_MINUTES = 10;

/**
 * The fake CLI each built-in adapter's specs play the suite with, inside the build. An adapter not named here (an
 * owner adapter file) has none to try, so its tribe is left to `elvaria tribe check` with its own CLI.
 */
const FAKE_CLIS: Readonly<Record<string, readonly string[]>> = {
  claude_code: ['packages', 'runner-claude', 'fixtures', 'fake-claude.mjs'],
  antigravity: ['packages', 'runner-antigravity', 'fixtures', 'fake-agy.mjs'],
};

export interface TrialPlace {
  readonly build: string;
  readonly kingdom: string;
  readonly tribes: readonly Tribe[];
}

export interface TrialFailure extends StepFailure {
  readonly step: UpgradeStep;
}

/** What the trial says as it goes: one line per step, and the reason a step failed. */
export interface TrialReport {
  readonly t: Translate;
  readonly out: (line: string) => void;
}

export type Trial = (place: TrialPlace, report: TrialReport) => Promise<TrialFailure | undefined>;

async function step(
  report: TrialReport,
  label: string,
  run: () => Promise<StepFailure | undefined>,
): Promise<StepFailure | undefined> {
  const failure = await run();
  report.out(
    failure === undefined
      ? report.t('cli.upgrade.step_passed', { step: label })
      : report.t('cli.upgrade.step_failed', { step: label, reason: failure.reason }),
  );
  return failure;
}

const asFailure = (outcome: Awaited<ReturnType<ReturnType<typeof buildCli>>>): StepFailure | undefined =>
  outcome.code === 0 ? undefined : { reason: reasonOf(outcome), output: outputOf(outcome) };

async function conformance(
  place: TrialPlace,
  io: CliIo,
  report: TrialReport,
): Promise<StepFailure | undefined> {
  const cli = buildCli(place.build, io);
  const here = ['--kingdom', place.kingdom, '--here'];
  for (const tribe of place.tribes.filter(({ enabled }) => enabled)) {
    const fake = FAKE_CLIS[tribe.adapter];
    if (fake === undefined) {
      report.out(report.t('cli.upgrade.no_fake', { tribe: tribe.id, adapter: tribe.adapter }));
      continue;
    }
    const label = report.t('cli.upgrade.step.conformance', { tribe: tribe.id });
    const tool = ['--tool', path.join(place.build, ...fake)];
    const args = ['tribe', 'check', tribe.id, '--scenarios', ...tool, ...here];
    const failure = await step(report, label, async () => asFailure(await cli(args, SUITE_MINUTES)));
    if (failure !== undefined) return failure;
  }
  return undefined;
}

/** The trial of `elvaria upgrade`; tests give the upgrade a trial of their own. */
export function buildTrial(tools: Tools, io: CliIo): Trial {
  return async (place, report) => {
    const cli = buildCli(place.build, io);
    const doctor = await step(report, report.t('cli.upgrade.step.doctor'), async () =>
      asFailure(await cli(['doctor', '--kingdom', place.kingdom, '--here'], DOCTOR_MINUTES)),
    );
    if (doctor !== undefined) return { step: 'doctor', ...doctor };
    const suite = await conformance(place, io, report);
    if (suite !== undefined) return { step: 'conformance', ...suite };
    const quest = await step(report, report.t('cli.upgrade.step.trial'), () =>
      scriptTrial(tools, io, place.build),
    );
    return quest === undefined ? undefined : { step: 'trial', ...quest };
  };
}
