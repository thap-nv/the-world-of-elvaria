// An excerpt of a real trial log: `<kingdom>/.runs/trial-elvaria/checks/test.log` of `territory check elvaria`
// (2026-11-13 15:51), `pnpm test` over the workspaces with their colours. Kept: a coverage table whose file names say
// "fail" (`fail-streak.ts`), vitest's `×` and `FAIL` lines for the three red tests, its summary and pnpm's code. The
// folder of the kingdom's repo is shortened to C:\repo; no secret was in it.
const ESC = '\u001b';
const dim = (text: string): string => `${ESC}[2m${text}${ESC}[22m`;
const red = (text: string): string => `${ESC}[31m${text}${ESC}[39m`;
const green = (text: string): string => `${ESC}[32m${text}${ESC}[39m`;
const DOMAIN = 'packages/domain test:';
const CLI = 'apps/cli test:';
const FILE = 'src/doctor/check-territory-trial.spec.ts';
const SUITE = 'elvaria doctor: the territory trial (PS-25)';
const FAIL = `${ESC}[41m${ESC}[1m FAIL ${ESC}[22m${ESC}[49m`;
const ROW = '|     100 |      100 |     100 |     100 |                   ';

export const TRIAL_TEST_LOG = [
  '$ pnpm test',
  `${DOMAIN} ${dim(' Test Files ')} ${ESC}[1m${green('122 passed')}${ESC}[22m${ESC}[90m (122)${ESC}[39m`,
  `${DOMAIN}   breakers.ts      ${ROW}`,
  `${DOMAIN}  src/character     ${ROW}`,
  `${DOMAIN}   constants.ts     ${ROW}`,
  `${DOMAIN}   fail-streak.ts   ${ROW}`,
  `${DOMAIN}   family.ts        ${ROW}`,
  `${CLI}  ${red('❯')} ${FILE} ${dim('(')}${dim('5 tests')}${dim(' | ')}${red('3 failed')}${dim(')')}`,
  `${CLI}    ${red('❯')} ${SUITE} ${dim('(5)')}`,
  `${CLI} ${ESC}[31m     ${ESC}[31m×${ESC}[31m reminds of a territory never tried${ESC}[39m${ESC}[33m 2647${dim('ms')}${ESC}[39m`,
  `${CLI} ${ESC}[31m     ${ESC}[31m×${ESC}[31m says when no item failed${ESC}[39m${ESC}[33m 1556${dim('ms')}${ESC}[39m`,
  `${CLI} ${red('⎯⎯⎯⎯⎯⎯⎯')}${ESC}[1m${ESC}[41m Failed Tests 3 ${ESC}[49m${ESC}[22m${red('⎯⎯⎯⎯⎯⎯⎯')}`,
  `${CLI} ${FAIL} ${FILE}${dim(' > ')}${SUITE}${dim(' > ')}reminds of a territory never tried`,
  `${CLI} ${ESC}[31m${ESC}[1mAssertionError${ESC}[22m: expected [ …(2) ] to deeply equal [ Array(1) ]${ESC}[39m`,
  `${CLI} ${FAIL} ${FILE}${dim(' > ')}${SUITE}${dim(' > ')}says when no item failed`,
  `${CLI} ${dim(' Test Files ')} ${ESC}[1m${red('1 failed')}${ESC}[22m${dim(' | ')}${ESC}[1m${green('67 passed')}${ESC}[22m`,
  `${CLI} Failed`,
  String.raw`C:\repo\.elvaria\worktrees\trial-elvaria\apps\cli:`,
  '\u2009ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL\u2009 @elvaria/cli@0.0.0 test: `pnpm build && vitest run --coverage`',
  'Exit status 1',
].join('\n');

/** The line the scorecard names for it: vitest's first `FAIL`, with its file and test, colours gone. */
export const TRIAL_TEST_FAILURE = `${CLI}  FAIL  ${FILE} > ${SUITE} > reminds of a territory never tried`;
