// Machine checks of the deliverable itself (P1-15, implementation-plan §3.1 "(P1-14)", §3.2): before the judge of a
// quest whose deliverable has a shape the Steward will read, the Steward tries what the delivery will do and records
// the answer as one more check, next to the territory's. Keyed by the deliverable type of the domain's schema, like
// the delivery's own table (deliver/deliver.ts), never by kind or ritual id (ADR 0016). Today: `subquests`, the
// list a plan quest leaves for the Steward to open whole or not at all (quest-draft schema, registry, territory and
// secrets, refs). Under the council's pass rule a failing check fails the quest, so a list the Steward would refuse
// goes back to the mage instead of being delivered with no child opened.
import { CheckIdSchema } from '@elvaria/domain';
import type { Quest, VerdictCheck } from '@elvaria/domain';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { inKingdom, writeFileAtomic } from '@elvaria/store';

import { plotDirOf } from '../deliver/deliver.ts';
import { plannedChildren } from '../deliver/subquests.ts';
import type { Context } from '../context.ts';

/** The check's id in verdicts, `checks_run` and the log's name. */
export const SUBQUESTS_CHECK = CheckIdSchema.parse('subquests');

type DeliverableCheck = (ctx: Context, quest: Quest, runDir: string) => Promise<VerdictCheck>;

/** One line per child the delivery would open. */
const childLine = (child: Quest): string =>
  `- ${child.id} ${child.kind} (${child.class_required ?? child.script?.id ?? child.tier}): ${child.title}`;

const subquestsCheck: DeliverableCheck = async (ctx, quest, runDir) => {
  const started = ctx.deps.clock.now();
  const children = await plannedChildren(ctx, quest, plotDirOf(ctx, quest.plot));
  const log = children.ok
    ? `${SUBQUESTS_FILE}: the delivery would open ${children.value.length} sub-quests\n${children.value.map(childLine).join('\n')}\n`
    : `${SUBQUESTS_FILE}: the delivery would open none: ${children.error}\n`;
  const logPath = `${runDir}/checks/${SUBQUESTS_CHECK}.log`;
  await writeFileAtomic(inKingdom(ctx.root, logPath), log);
  return {
    id: SUBQUESTS_CHECK,
    pass: children.ok,
    duration_ms: ctx.deps.clock.now() - started,
    log_path: logPath,
  };
};

const DELIVERABLE_CHECKS: Partial<Record<Quest['deliverable']['type'], DeliverableCheck>> = {
  subquests: subquestsCheck,
};

/** The deliverable's own checks for run folder `runDir` (`.runs/<quest>-<n>`): none for most deliverables. */
export async function deliverableChecks(ctx: Context, quest: Quest, runDir: string): Promise<VerdictCheck[]> {
  const check = DELIVERABLE_CHECKS[quest.deliverable.type];
  return check === undefined ? [] : [await check(ctx, quest, runDir)];
}
