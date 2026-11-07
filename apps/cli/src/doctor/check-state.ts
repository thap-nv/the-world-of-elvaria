// The doctor's checks of what lives beside the kingdom's settings (P1-11): the treasury file, read for its names
// only and never printed (ADR 0013, implementation-plan §3.9), and the sessions a stopped Steward left running
// (`.state/sessions.json`, §3.4 "(P1-06)").
import { inspectTreasury } from '@elvaria/runner-core';
import type { TreasuryProblem } from '@elvaria/runner-core';
import { sessionsLeftBehind } from '@elvaria/steward';
import type { LeftSession } from '@elvaria/steward';
import { fromPortable } from '@elvaria/store';
import type { Translate } from '@elvaria/i18n';

import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

const reasonOf = (error: unknown): string =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : String(error);

function problemFinding(t: Translate, path: string, problem: TreasuryProblem): Finding {
  switch (problem.kind) {
    case 'shared':
      return finding('error', t('cli.doctor.treasury_shared', { path, mode: problem.mode }));
    case 'not_json':
      return finding('error', t('cli.doctor.treasury_not_json', { path }));
    case 'not_object':
      return finding('error', t('cli.doctor.treasury_not_object', { path }));
    case 'bad_name':
      return finding('error', t('cli.doctor.treasury_bad_name', { path, name: problem.name }));
    case 'bad_value':
      return finding('error', t('cli.doctor.treasury_bad_value', { path, name: problem.name }));
  }
}

/** Every name some territory allows a quest to ask for, with the territories that allow it. */
async function allowedNames(ctx: KingdomContext): Promise<Map<string, string[]>> {
  const { items } = await ctx.store.territories.list();
  const allowed = new Map<string, string[]>();
  for (const territory of items)
    for (const name of territory.secrets_allowed)
      allowed.set(name, [...(allowed.get(name) ?? []), territory.id]);
  return allowed;
}

/**
 * `kingdom.paths.treasury`: present, mode 0600 outside Windows, `{ "name": "value" }`, and holding every name a
 * territory allows. A file that cannot be used is an error; names it lacks are a warning, since only the quests
 * that ask for them stop (they go to the infirmary with a bell, P1-06).
 */
export async function checkTreasury(ctx: KingdomContext): Promise<Finding> {
  const { t } = ctx;
  const path = ctx.kingdom.paths.treasury;
  let inspected: Awaited<ReturnType<typeof inspectTreasury>>;
  try {
    inspected = await inspectTreasury(fromPortable(path, ctx.io.platform), { platform: ctx.io.platform });
  } catch (error) {
    return finding('error', t('cli.doctor.treasury_unreadable', { path, reason: reasonOf(error) }));
  }
  if (!inspected.ok) return problemFinding(t, path, inspected.error);
  const { found, names } = inspected.value;
  const allowed = await allowedNames(ctx);
  const missing = [...allowed.keys()].filter((name) => !names.includes(name)).sort();
  if (missing.length > 0) {
    const details = missing.map((name) => `${name} (${(allowed.get(name) ?? []).join(', ')})`);
    return finding('warn', t('cli.doctor.treasury_missing_names', { path }), details);
  }
  return found
    ? finding('ok', t('cli.doctor.treasury', { path, count: names.length }))
    : finding('ok', t('cli.doctor.treasury_absent', { path }));
}

const sessionLine = (t: Translate, left: LeftSession): string => {
  const params = { quest: left.quest, character: left.character, role: left.role, pid: left.pid };
  return left.process === 'same'
    ? t('cli.doctor.session_left', { ...params, spawned_at: left.spawned_at })
    : t('cli.doctor.session_left_unknown', params);
};

/** Sessions still running from a Steward that stopped without clearing `.state/sessions.json`; none, no line. */
export async function checkLeftSessions(ctx: KingdomContext): Promise<Finding[]> {
  const left = await sessionsLeftBehind(ctx.store.root);
  if (left.length === 0) return [];
  const details = left.map((session) => sessionLine(ctx.t, session));
  return [finding('warn', ctx.t('cli.doctor.sessions_left', { count: left.length }), details)];
}
