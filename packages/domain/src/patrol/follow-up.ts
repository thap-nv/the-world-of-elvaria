// The draft quest the patrol opens when checks of a territory's default branch turn red (PS-26, owner's K7 of
// plans/phase-2-merge-queue.md): no `proposal` memo written by the machine, since what a triage would weigh (the check,
// its first error line, its log, the quests merged since the last green patrol) the machine already has. Only for a
// territory that declares `patrol.follow_up`, of the kind, rank and class it names; a draft, so no mana goes before
// the owner confirms it. The Steward makes it through questFromCommand, under an id of the territory and the commit
// first found red, so a patrol run again after a stop finds it instead of opening a second one.
import { clipTitle } from '../script/follow-up.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Registry } from '../schema/registry.ts';
import type { TerritoryPatrol } from '../schema/territory-patrol.ts';
import type { RedCheck } from './health.ts';

export interface PatrolFollowUp {
  readonly territory: TerritoryId;
  readonly follow_up: NonNullable<TerritoryPatrol['follow_up']>;
  /** The checks this run found red that the last one had not, all on one commit. */
  readonly turned_red: readonly RedCheck[];
  readonly kinds: Registry['kinds'];
  /** `kingdom.owner.locale`: the title names the kind in the owner's language. */
  readonly locale: Kingdom['owner']['locale'];
}

function redLines(red: RedCheck): string[] {
  const suspects = red.suspects.map(
    ({ quest, sealed }) => `${quest}${sealed ? '' : ' (merged without the seal)'}`,
  );
  return [
    `- ${red.check}: ${red.error_line ?? 'its log says nothing more'} (log: ${red.log_path})`,
    red.green_at === undefined
      ? '  No earlier patrol found it green.'
      : `  Green at the patrol of ${red.green_at}; merged since: ${suspects.length === 0 ? 'none (the change came from outside Elvaria)' : suspects.join(', ')}.`,
  ];
}

/** The `create_quest` payload of the draft, or undefined when nothing turned red. */
export function patrolFollowUpOf(run: PatrolFollowUp): CommandPayload<'create_quest'> | undefined {
  const { territory, follow_up: followUp, turned_red: red, locale } = run;
  const [first] = red;
  if (first === undefined) return undefined;
  const kind = run.kinds.find(({ id }) => id === followUp.kind);
  const name = kind === undefined ? followUp.kind : locale === 'vi' ? kind.name_vi : kind.name_en;
  const checks = red.map(({ check }) => check).join(', ');
  const description = [
    `The daily patrol ran every check of territory ${territory} on a clean plot at the head of its default branch, commit ${first.commit ?? 'unknown'}, and these turned red:`,
    ...red.flatMap(redLines),
    'Make the default branch green again. The logs are in the kingdom; run the failing checks in your plot first, and look at the quests merged since the last green patrol before anything else.',
  ].join('\n');
  return {
    draft: true,
    title: clipTitle(`${name}: ${territory} ${checks}`),
    description,
    kind: followUp.kind,
    rank: followUp.rank,
    territory,
    tier: 'session',
    class_required: followUp.class,
    tags: [],
    created_by: 'patrol',
  };
}
