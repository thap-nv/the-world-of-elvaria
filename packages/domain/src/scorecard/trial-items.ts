// The two items of the scorecard that read the trial (PS-25): did commands.setup and every check pass on a clean plot
// at the head of the default branch, and how long did each check take against its timeout.
import { MS_PER_MINUTE } from '../constants.ts';
import { CHECK_TIME_MAX_SHARE, COMMIT_SHOWN, percentOf, secondsOf } from './constants.ts';
import { failing, itemOf, reasonOf, standing, unmeasured } from './reasons.ts';
import type { Territory } from '../schema/territory.ts';
import type { Finding, ScorecardItem } from './reasons.ts';
import type { TerritoryTrial, TrialCheck, TrialStep } from './trial.ts';

/** What a failing step's reason names: its command, the line that tells why, and where its log is. */
function failureOf(step: TrialStep, prefix: 'setup' | 'check', check?: string): Finding {
  const named = check === undefined ? {} : { check };
  const at = { ...named, command: step.command, log: step.log_path };
  if (step.timed_out) return failing(reasonOf(`${prefix}_timed_out`, at));
  if (step.environment !== undefined)
    return failing(reasonOf(`${prefix}_environment`, { ...at, line: step.environment }));
  const exit = step.exit_code ?? '—';
  return failing(reasonOf(`${prefix}_failed`, { ...at, exit, line: step.error_line ?? '—' }));
}

function setupFinding(setup: TrialStep | null): Finding {
  if (setup === null) return standing(reasonOf('no_setup'));
  if (!setup.pass) return failureOf(setup, 'setup');
  return standing(
    reasonOf('setup_passed', { command: setup.command, seconds: secondsOf(setup.duration_ms) }),
  );
}

function checkFindings(territory: Territory, trial: TerritoryTrial): Finding[] {
  if (territory.checks.length === 0) return [standing(reasonOf('no_checks'))];
  const failed = trial.checks.filter(({ pass }) => !pass);
  if (failed.length > 0) return failed.map((check) => failureOf(check, 'check', check.id));
  // Stopped after its setup (Ctrl+C): the checks it never ran passed nothing.
  if (trial.checks.length === 0) return [failing(reasonOf('checks_not_run'))];
  return [standing(reasonOf('checks_passed', { count: trial.checks.length }))];
}

/**
 * (1) The trial: commands.setup ran and every check of the territory passed. Nothing was tried on a territory without
 * git: there is no branch to fork from. A setup that failed leaves the checks unrun, and says why on its own.
 */
export function trialItem(territory: Territory, trial: TerritoryTrial | null): ScorecardItem {
  if (trial === null) return unmeasured('trial', reasonOf('no_git'));
  if (trial.plot_failure !== undefined)
    return itemOf('trial', [failing(reasonOf('plot_failed', { detail: trial.plot_failure }))]);
  const setup = setupFinding(trial.setup);
  const checks = setup.fails ? [] : checkFindings(territory, trial);
  return itemOf('trial', [setup, ...checks]);
}

function checkTime(check: TrialCheck): Finding {
  const params = {
    check: check.id,
    seconds: secondsOf(check.duration_ms),
    minutes: check.timeout_minutes,
  };
  const share = check.duration_ms / (check.timeout_minutes * MS_PER_MINUTE);
  if (share <= CHECK_TIME_MAX_SHARE) return standing(reasonOf('check_time', params));
  return failing(reasonOf('check_slow', { ...params, max: percentOf(CHECK_TIME_MAX_SHARE, 1) }));
}

/** (2) Each check's time on the trial against its timeout; nothing to judge when no check ran. */
export function checkTimeItem(territory: Territory, trial: TerritoryTrial | null): ScorecardItem {
  if (territory.checks.length === 0) return unmeasured('check_time', reasonOf('no_checks'));
  if (trial === null || trial.checks.length === 0)
    return unmeasured('check_time', reasonOf('checks_not_run'));
  return itemOf('check_time', trial.checks.map(checkTime));
}

/** The commit a trial ran on, as the card's title names it; null when nothing was tried. */
export const shownBase = (trial: TerritoryTrial | null): string | null =>
  trial?.base?.slice(0, COMMIT_SHOWN) ?? null;
