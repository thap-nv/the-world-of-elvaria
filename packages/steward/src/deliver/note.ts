// The delivery note `.runs/<quest>-delivery.md` (implementation-plan §9.1 item 11, ADR 0012): what the quest
// delivered and how the owner takes it, written once when the quest is delivered. For a branch it is the pull
// request's description, with the commands to merge by hand: Elvaria never pushes or merges in stage 1. Headings are
// fixed English, like the handover letter's; the rest comes from the kingdom's files, in the owner's language
// already (the quest, the letter, the verdicts' notes), so the Steward needs no translation of its own.
import { MACHINE_VERIFIER, USER_VERIFIER } from '@elvaria/domain';
import { PATCH_FILE } from '@elvaria/runner-core';
import type { PartyRole, PartyStatus, Quest, Territory, Verdict } from '@elvaria/domain';

import { replacedDirOf } from './copy.ts';
import type { Copied } from './copy.ts';
import type { Subquests } from './subquests.ts';

/** Portable, relative to the kingdom: `deliverable.path` of a delivered quest. */
export const deliveryNoteOf = (quest: Pick<Quest, 'id'>): string => `.runs/${quest.id}-delivery.md`;

export interface NoteInput {
  readonly quest: Quest;
  readonly territory: Territory | undefined;
  /** The handover letter, as the kingdom keeps it (masked at the session's end). */
  readonly handover: string | null;
  /** The verdicts of the last run: the judge's or the machine's, then the owner's. */
  readonly verdicts: readonly Verdict[];
  readonly copied?: Copied;
  readonly subquests?: Subquests;
  /** The paths the Steward changed from the assignee's patch, over every run (`plot.patched` lines, P1-31). */
  readonly patched?: readonly string[];
  /** Where the quest's party stands (partyStatusOf, P1-18); absent outside a party. */
  readonly party?: PartyStatus;
}

const code = (text: string): string => `\`${text}\``;
const section = (title: string, ...body: readonly string[]): string => [`## ${title}`, ...body].join('\n\n');

/** Two levels down, so the letter's own headings (`# Handover`, `## Done`…) sit under the note's section. */
function demoted(text: string): string {
  let fenced = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith('```')) fenced = !fenced;
      return !fenced && /^#{1,4} /.test(line) ? `##${line}` : line;
    })
    .join('\n');
}

/** The branch the plot started from: the contract's for a part or a merge quest (P1-18), else the default one. */
function startOf({ quest, territory }: NoteInput): string | undefined {
  if (quest.party_id !== undefined && quest.party_role !== 'contract') return `quest/${quest.party_id}`;
  return territory?.vcs.default_branch;
}

function facts(input: NoteInput): string {
  const { quest } = input;
  const plot = quest.plot;
  const start = startOf(input);
  const where =
    plot.type === 'worktree' && plot.branch !== undefined
      ? `- Branch: ${code(plot.branch)}${start === undefined ? '' : `, from ${code(start)}`}`
      : plot.type === 'folder' && plot.path !== undefined
        ? `- Plot: ${code(plot.path)}`
        : '- Plot: none';
  return [
    `- Quest: ${code(quest.id)} (${quest.kind}, rank ${quest.rank}) on ${code(quest.territory)}`,
    `- Deliverable: ${quest.deliverable.type}`,
    where,
  ].join('\n');
}

function byWhom(verdict: Verdict): string {
  if (verdict.verifier_id === USER_VERIFIER) return 'The owner, by hand.';
  if (verdict.verifier_id === MACHINE_VERIFIER)
    return `The machine, from the checks (ritual ${code(verdict.ritual)}).`;
  return `${code(verdict.verifier_id)}, ritual ${code(verdict.ritual)}.`;
}

function verdictBlock(verdict: Verdict): string {
  const checks = verdict.checks.map((check) => `${check.pass ? '✓' : '✗'} ${code(check.id)}`);
  const lines = [byWhom(verdict), ...(checks.length === 0 ? [] : [`Checks: ${checks.join(', ')}.`])];
  const notes = verdict.notes?.trim() ?? '';
  return [
    `### ${code(verdict.id)}: ${verdict.result}`,
    lines.join(' '),
    ...(notes === '' ? [] : [notes]),
  ].join('\n\n');
}

function verification({ quest, verdicts }: NoteInput): string {
  const seal = quest.seal;
  const sealed =
    seal === undefined
      ? []
      : [`Sealed by the owner at ${seal.at}${seal.note === undefined ? '.' : `: ${seal.note}`}`];
  const blocks = verdicts.map(verdictBlock);
  return section(
    'Verification',
    ...(blocks.length === 0 && sealed.length === 0 ? ['None.'] : [...blocks, ...sealed]),
  );
}

function subquestsSection(subquests: Subquests): string {
  if (subquests.status === 'refused') return section('Sub-quests', `None opened: ${subquests.reason}.`);
  const rows = subquests.quests.map(
    (child) =>
      `- ${code(child.id)} ${child.title} (${child.kind}, rank ${child.rank}${child.class_required === undefined ? '' : `, ${child.class_required}`})`,
  );
  return section('Sub-quests', rows.length === 0 ? 'None.' : rows.join('\n'));
}

function copiedSection({ quest, territory }: NoteInput, copied: Copied): string {
  if (copied.missing)
    return section(
      'Copied into the territory',
      `Nothing: ${code(territory?.path ?? quest.territory)} is not there. The work stays in ${code(quest.plot.path ?? '')}; copy it yourself.`,
    );
  const rows = copied.copied.map(
    (file) => `- ${code(file)}${copied.replaced.includes(file) ? ' (replaced)' : ''}`,
  );
  const kept =
    copied.replaced.length === 0
      ? []
      : [`What the replaced files held before is kept in ${code(replacedDirOf(quest.id))}.`];
  return section(
    'Copied into the territory',
    rows.length === 0 ? 'Nothing: the plot is empty.' : rows.join('\n'),
    ...kept,
  );
}

/**
 * What the character did not write itself (P1-31): its CLI refuses these paths, so the Steward applied its patch
 * (laws.patch_paths, P1-28). A git hook among them runs on the owner's machine once merged, so the note names them.
 */
function patchedSection(patched: readonly string[] | undefined): string[] {
  if (patched === undefined || patched.length === 0) return [];
  return [
    section(
      'Applied through a patch',
      `The character's CLI does not write these paths, so it wrote its change as a patch (${code(PATCH_FILE)}) and the Steward applied it before the commit. Read their diff before you merge:`,
      patched.map((file) => `- ${code(file)}`).join('\n'),
    ),
  ];
}

/** What each member of a party is to the owner merging it (P1-18): only the merge quest's branch is merged. */
const PARTY_ROLE_NOTE: Readonly<Record<PartyRole, (merge: string) => string>> = {
  contract: (merge) =>
    `This quest wrote the contract and opened the parts. Every branch of the party starts from this one, and ${merge} merges them all: do not merge this branch by hand.`,
  part: (merge) =>
    `This branch is one part, made on the contract's branch. Do not merge it alone: ${merge} merges every part, runs every check of the territory and waits for your seal; merge its branch instead.`,
  merge: () =>
    'This branch holds the contract and every part of the party, checked as a whole: merging it delivers the party.',
};

function partySection({ quest, party }: NoteInput): string[] {
  if (party === undefined) return [];
  const merge = party.merge === null ? 'its merge quest' : `merge quest ${code(party.merge)}`;
  const status = `Party ${code(party.party)}: ${party.stage}, ${party.parts.done} of ${party.parts.total} parts done.`;
  return [section('Party', status, PARTY_ROLE_NOTE[quest.party_role ?? 'part'](merge))];
}

/**
 * The owner merges a branch by hand (§9.1 item 11); a plan's branch only carries its list of sub-quests, and a
 * party's part reaches the main branch through its merge quest (P1-18).
 */
function mergeSection({ quest, territory }: NoteInput): string[] {
  const branch = quest.plot.branch;
  if (quest.plot.type !== 'worktree' || branch === undefined || territory === undefined) return [];
  if (quest.deliverable.type === 'subquests' || quest.party_role === 'part') return [];
  const repo = territory.path;
  const push =
    territory.vcs.remote === undefined
      ? []
      : [
          `For a pull request instead: ${code(`git -C "${repo}" push origin ${branch}`)}, with this note as its description.`,
        ];
  return [
    section(
      'Merge by hand',
      'Elvaria never pushes or merges (ADR 0012). Once you have read the branch:',
      ['```', `git -C "${repo}" merge --no-ff ${branch}`, '```'].join('\n'),
      ...push,
    ),
  ];
}

const DRAFT = section(
  'Draft',
  'Elvaria sends nothing. The draft is the work above: publish or send it yourself once you agree with it.',
);

export function deliveryNote(input: NoteInput): string {
  const { quest, handover, copied, subquests } = input;
  const letter = handover?.trim() ?? '';
  const blocks = [
    `# ${quest.title}`,
    facts(input),
    section('Description', quest.description.trim()),
    verification(input),
    section('Handover letter', letter === '' ? 'None.' : demoted(letter)),
    ...patchedSection(input.patched),
    ...(subquests === undefined ? [] : [subquestsSection(subquests)]),
    ...(copied === undefined ? [] : [copiedSection(input, copied)]),
    ...(quest.deliverable.type === 'draft' ? [DRAFT] : []),
    ...partySection(input),
    ...mergeSection(input),
  ];
  return `${blocks.join('\n\n')}\n`;
}
