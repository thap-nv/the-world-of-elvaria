// The Steward's check of the screens of a review (PS-11b): for a quest whose ritual asks for eyes (judgedByEye), after
// the territory's checks, the images they left in the run's `screens/` folder keep the contract (runner-core
// screensOf: at least one screen, PNG only, kebab-case names, SCREEN_* ceilings). A judge with nothing to look at would
// pass a visible change blind, or give `partial` again and again: the check fails instead, under the ritual's pass
// rule as any check, and its log says the usual causes, so the next session of the work can mend them.
import { judgedByEye } from '@elvaria/domain';
import { SCREENS_ENV, screensDirOf, screensOf } from '@elvaria/runner-core';
import { inKingdom, writeFileAtomic } from '@elvaria/store';
import type { CheckId, Quest, VerdictCheck } from '@elvaria/domain';

import type { Context } from '../context.ts';

/** The check's id in verdicts, `checks_run` and the log's name. */
export const SCREENS_CHECK_ID = 'screens' as CheckId;

const NO_SCREEN = [
  'no check of the territory captured a screen for the judge. Usually either:',
  `- no check of the territory writes its screens (<name>.png) into the folder its env ${SCREENS_ENV} names; or`,
  '- the `when` globs of the check that captures them matched no file this quest changed, so it did not run.',
];

/** The log's lines: what the judge gets, then what breaks the contract. */
function linesOf(screens: Awaited<ReturnType<typeof screensOf>>, folder: string): string[] {
  const shown = screens.pairs.map(({ name, reference, diff }) => {
    const beside = [
      reference === undefined ? [] : ['reference'],
      diff === undefined ? [] : ['difference'],
    ].flat();
    return `✓ ${name}${beside.length === 0 ? '' : ` (with its ${beside.join(' and ')})`}`;
  });
  const none = screens.pairs.length === 0 ? NO_SCREEN : [];
  const problems = screens.problems.map((problem) => `✗ ${problem}`);
  return [`screens: ${folder}`, ...shown, ...problems, ...none];
}

/** The screens check for run folder `runDir` (`.runs/<quest>-<n>`): one for a quest judged by eye, else none. */
export async function screensChecks(ctx: Context, quest: Quest, runDir: string): Promise<VerdictCheck[]> {
  if (!judgedByEye(quest, ctx.world.registry)) return [];
  const started = ctx.deps.clock.now();
  const screens = await screensOf(ctx.root, runDir);
  const logPath = `${runDir}/checks/${SCREENS_CHECK_ID}.log`;
  const lines = linesOf(screens, screensDirOf(runDir));
  await writeFileAtomic(inKingdom(ctx.root, logPath), `${lines.join('\n')}\n`);
  return [
    {
      id: SCREENS_CHECK_ID,
      pass: screens.pairs.length > 0 && screens.problems.length === 0,
      duration_ms: ctx.deps.clock.now() - started,
      log_path: logPath,
    },
  ];
}
