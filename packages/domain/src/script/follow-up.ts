// The session quest that takes over a failed script run (implementation-plan §2.5, §3.12; P1-17): a batch's open units
// (link-check's dead links) or a failing check (run-check: the "Exorcism" quest when there are monsters). The catalog
// entry names its kind and class (`follow_up`), so no kind or script is switched on here (ADR 0016). One quest takes
// every open unit, rather than one quest each: tiny jobs go together (ADR 0017).
import { QUEST_TITLE_MAX_LENGTH } from '../constants.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { CatalogScript } from '../schema/registry-entries.ts';

export interface FailedRun {
  /** The script-tier quest whose run failed. */
  readonly parent: Quest;
  readonly script: CatalogScript;
  /** The machine's verdict on the run: its notes say what the script found. */
  readonly verdict: Pick<Verdict, 'notes'>;
  /** `kingdom.owner.locale`: the title names the script in the owner's language. */
  readonly locale: Kingdom['owner']['locale'];
}

const clipTitle = (title: string): string =>
  title.length <= QUEST_TITLE_MAX_LENGTH ? title : `${title.slice(0, QUEST_TITLE_MAX_LENGTH - 1)}…`;

/**
 * The `create_quest` payload of the follow-up, or undefined when the catalog entry names none (the failed run then
 * waits in the infirmary for the owner). It is open at once, a child of the failed quest, on its territory, rank
 * and tags; the Steward makes the quest through `questFromCommand`, so the kingdom's rules hold.
 */
export function followUpOf(run: FailedRun): CommandPayload<'create_quest'> | undefined {
  const { parent, script, verdict, locale } = run;
  if (script.follow_up === undefined) return undefined;
  const name = locale === 'vi' ? script.name_vi : script.name_en;
  const description = [
    `The catalog script ${script.id} found work in quest ${parent.id} («${parent.title}»); the machine's verdict on that run follows. Do that work, then run ${script.id} again to check it is done.`,
    verdict.notes ?? '',
  ]
    .filter((part) => part !== '')
    .join('\n\n');
  return {
    draft: false,
    title: clipTitle(`${name}: ${parent.title}`),
    description,
    kind: script.follow_up.kind,
    rank: parent.rank,
    territory: parent.territory,
    tier: 'session',
    class_required: script.follow_up.class,
    tags: [...parent.tags],
    parent_id: parent.id,
    // A battle's aftermath: the Steward opens it, as it opens a plan's sub-quests (`council`).
    created_by: 'battle',
  };
}
