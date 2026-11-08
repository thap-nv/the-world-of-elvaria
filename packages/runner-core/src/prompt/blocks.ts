// The blocks prompts are made of (implementation-plan §3.7, §3.13; ADR 0010, 0017): each fills one template from
// the kingdom's files, and an optional block with nothing to say is empty, so joinBlocks leaves it out.
import { PATCH_FILE } from '../plot/patch.ts';
import { SUBQUESTS_FILE } from '../plot/subquests.ts';
import { SHELL_TOOL, WRITE_TOOLS } from '../policy/constants.ts';
import { fenced, fill, joinBlocks, withoutNotes } from './templates.ts';
import type { ToolPolicy } from '../policy/tool-policy.ts';
import type { PromptTemplates } from './templates.ts';
import type { Kind, Kingdom, Quest, Registry, Skill, Territory, Verdict } from '@elvaria/domain';

export type Locale = Kingdom['owner']['locale'];

/** The owner's language, as the prompt names it: handover letters and verdict notes are written in it (ADR 0010). */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { vi: 'Vietnamese', en: 'English' };

/** A fresh session reads this many of the last journal lines (ADR 0017). */
export const JOURNAL_TAIL_LINES = 20;

/** Continuing an assignee's work in a fresh session (§10 question 4): after a failed verdict, or a revival. */
export type Continuation =
  { readonly reason: 'returned'; readonly verdict: Verdict } | { readonly reason: 'revive' };

/** What the continuing session reads instead of a transcript: the letter, the journal's tail, the branch's log. */
export interface Memory {
  readonly handover: string | null;
  /** Lines of quests/<id>/journal.jsonl, oldest first; the last JOURNAL_TAIL_LINES are kept. */
  readonly journal: readonly string[];
  /** `git log --oneline <base>..<branch>`, or null before the first commit. */
  readonly git_log: string | null;
}

interface WithId {
  readonly id: string;
}

/** A registry entry by id. The registry and the quest were validated together, so a miss is a bug. */
export function entryOf<T extends WithId>(entries: readonly T[], id: string, what: string): T {
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`registry has no ${what} "${id}"`);
  return entry;
}

const present = (text: string | null | undefined): text is string =>
  text !== null && text !== undefined && text.trim() !== '';

export const decreeBlock = (decree: string | null, t: PromptTemplates): string =>
  present(decree) ? fill(t.decree, { decree: decree.trim() }) : '';

/** `Bash(pnpm test:*)` → `pnpm test`; `Bash(git status)` → `git status`; any other tool's rule → nothing. */
const shellCommandOf = (rule: string): string[] => {
  const match = /^Bash\((.+?)(?::\*)?\)$/.exec(rule);
  return match?.[1] === undefined ? [] : [match[1]];
};

/**
 * The commands the session's shell may run, listed from its permission rules (P1-11): without them a character
 * guesses a compound command, its settings refuse the whole line, and it stops to ask the owner. Empty without a
 * shell.
 */
export function shellBlock(policy: Pick<ToolPolicy, 'tools' | 'allow'>, t: PromptTemplates): string {
  const commands = policy.tools.includes(SHELL_TOOL) ? policy.allow.flatMap(shellCommandOf) : [];
  if (commands.length === 0) return '';
  return fill(t.shell, { commands: bullets(commands) });
}

const bullets = (items: readonly string[]): string => items.map((item) => `- \`${item}\``).join('\n');

/**
 * The read-only paths of the territory and the generators that rewrite them (P1-24), for a session that may edit
 * files: without it a character edits a generated page by hand, or stops to ask the owner to regenerate it (P1-16).
 * A generator is named only when the session's shell may run it. Empty without a write tool or a read-only path.
 */
export function readOnlyBlock(
  policy: Pick<ToolPolicy, 'tools' | 'allow' | 'laws'>,
  territory: Pick<Territory, 'commands'>,
  t: PromptTemplates,
): string {
  const paths = policy.laws.read_only_paths;
  const writes = policy.tools.some((tool) => (WRITE_TOOLS as readonly string[]).includes(tool));
  if (paths.length === 0 || !writes) return '';
  const runnable = new Set(policy.tools.includes(SHELL_TOOL) ? policy.allow.flatMap(shellCommandOf) : []);
  const generators = (territory.commands.generate ?? []).filter((command) => runnable.has(command));
  return fill(t['read-only'], {
    paths: bullets(paths),
    generators:
      generators.length === 0
        ? 'Your class cannot run their generators: when your change needs them rewritten, say so in Not done.'
        : `They are generated. After you change what they are generated from, run their generator and commit what it writes with your work:\n\n${bullets(generators)}`,
  });
}

/**
 * The territory's patch paths and the patch convention (P1-28), for a session that may edit files: without it a
 * Claude character refused `.husky/pre-push` asks the owner for the change (P1-16 §5.9). Empty without a write tool
 * or a patch path (ToolLaws has none on a territory without git).
 */
export function patchBlock(policy: Pick<ToolPolicy, 'tools' | 'laws'>, t: PromptTemplates): string {
  const paths = policy.laws.patch_paths;
  const writes = policy.tools.some((tool) => (WRITE_TOOLS as readonly string[]).includes(tool));
  if (paths.length === 0 || !writes) return '';
  return fill(t.patch, { paths: bullets(paths), patch_file: PATCH_FILE });
}

/**
 * The diff section of a verifier when the prompt carries none (`null`, the Steward's case until PlotManager.diff,
 * §11 P1-04): where to read it, against the ref the branch forked from (§3.3 "(P1-07)": `origin/<branch>` once
 * fetched, so a local default branch behind origin does not add other people's commits to the diff).
 */
export function diffBlock(diff: string | null, territory: Pick<Territory, 'vcs'>): string {
  if (diff !== null) return diff.trim() === '' ? 'The branch has no changes.' : fenced(diff, 'diff');
  const { vcs } = territory;
  if (vcs.type === 'none')
    return 'Not in this prompt: the plot is a folder without git; read the files the quest names.';
  const base = `${vcs.remote === undefined ? '' : 'origin/'}${vcs.default_branch ?? 'HEAD'}`;
  return `Not in this prompt: read it in the plot (your current directory) with \`git diff ${base}...HEAD\`, then each changed file in full.`;
}

/**
 * The class's craft (P1-15): the kingdom's `registry/<class.prompt_file>` without its maintainer note, after the
 * laws of the role. Empty when the file is gone or says nothing.
 */
export function classBlock(craft: string | null, name: string, t: PromptTemplates): string {
  const text = craft === null ? '' : withoutNotes(craft);
  return text === '' ? '' : fill(t.class, { class: name, craft: text });
}

/** Where the last judge of the run stopped (a `partial` verdict, §3.2): the next one reads on from there. */
export function partialBlock(partial: Verdict | null, t: PromptTemplates): string {
  if (partial?.progress === undefined) return '';
  return fill(t.partial, {
    judge: partial.verifier_id,
    verdict_id: partial.id,
    checked_until: partial.progress.checked_until,
    notes: present(partial.notes) ? fenced(partial.notes, 'markdown') : '',
  });
}

/**
 * The words a sub-quest draft may use (P1-15): the kinds with the classes each allows, the kingdom's tags and the
 * secrets the territory allows. The mage's class prompt explains the fields and points here; the Steward refuses
 * a list that names anything else.
 */
function subquestVocabulary(registry: Registry, territory: Pick<Territory, 'secrets_allowed'>): string[] {
  const kinds = registry.kinds.map((kind) => `${kind.id} (${kind.classes_allowed.join(', ') || 'no class'})`);
  const secrets = territory.secrets_allowed;
  return [
    `- Kinds of a sub-quest and the classes each allows: ${kinds.join('; ')}`,
    `- Tags: ${registry.tags.map(({ id }) => id).join(', ')}`,
    `- Secrets this territory allows: ${secrets.length === 0 ? 'none' : secrets.join(', ')}`,
  ];
}

/**
 * What the session leaves for the Steward to deliver, when the kind's convention needs a file of a given shape
 * (product plan §5: the prompt carries the kind's delivery convention). Other deliverables are the work itself.
 */
const DELIVERABLE_FACTS: Partial<
  Record<
    Kind['deliverable_type'],
    (registry: Registry, territory: Pick<Territory, 'secrets_allowed'>) => string[]
  >
> = {
  subquests: (registry, territory) => [
    `- Deliverable: the sub-quests, written to \`${SUBQUESTS_FILE}\` at the root of the plot as quest-draft JSON: \`{"version": 1, "drafts": [...]}\`, each draft with ref (d1, d2…), title, description, kind, rank, territory, tier, class_required, tags, depends_on_refs, parent_ref (optional), estimate {tokens, minutes}, seal_required, secrets_required. The Steward opens them once this quest is done`,
    ...subquestVocabulary(registry, territory),
  ],
};

function partyFact(quest: Quest): string[] {
  if (quest.party_id === undefined) return [];
  const contract = quest.contract === undefined ? '' : `, contract \`${quest.contract}\``;
  return [`- Party: ${quest.party_role ?? 'part'} of ${quest.party_id}${contract}`];
}

export function questBlock(
  quest: Quest,
  registry: Registry,
  territory: Pick<Territory, 'secrets_allowed'>,
  t: PromptTemplates,
): string {
  const kind = entryOf(registry.kinds, quest.kind, 'kind');
  const facts = [
    `- Kind: ${quest.kind} (deliverable: ${kind.deliverable_type})`,
    `- Rank: ${quest.rank}`,
    `- Tags: ${quest.tags.length === 0 ? 'none' : quest.tags.join(', ')}`,
    `- Territory: ${quest.territory}`,
    `- Limits: ${quest.budget.max_minutes} minutes, ${quest.budget.max_tokens} tokens`,
    ...partyFact(quest),
    ...(DELIVERABLE_FACTS[kind.deliverable_type]?.(registry, territory) ?? []),
  ];
  return fill(t.quest, {
    quest_id: quest.id,
    title: quest.title,
    facts: facts.join('\n'),
    description: quest.description,
  });
}

export const gazetteerBlock = (territory: Territory, gazetteer: string | null, t: PromptTemplates): string =>
  present(gazetteer) ? fill(t.gazetteer, { territory: territory.name, gazetteer: gazetteer.trim() }) : '';

export function scriptureBlock(scriptures: readonly string[], t: PromptTemplates): string {
  const texts = scriptures.filter(present).map((text) => text.trim());
  return texts.length === 0 ? '' : fill(t.scripture, { scriptures: texts.join('\n\n') });
}

/** Stage 1 has no skills (§3.13); the block is ready for stage 5, which decides how a CLI loads them. */
export function skillsBlock(skills: readonly Skill[], t: PromptTemplates): string {
  if (skills.length === 0) return '';
  return fill(t.skills, {
    skills: skills.map((skill) => `- \`${skill.id}\`: ${skill.description}`).join('\n'),
  });
}

/** The owner's answer to the question that blocked the quest, for a fresh session after the answer (§2.4). */
function answerBlock(quest: Quest, t: PromptTemplates): string {
  const blocked = quest.blocked;
  if (blocked === undefined || !present(blocked.answer)) return '';
  return fill(t.answer, { question: blocked.question, answer: blocked.answer.trim() });
}

function memoryBlock(memory: Memory, t: PromptTemplates): string {
  const journal = memory.journal.slice(-JOURNAL_TAIL_LINES);
  return fill(t.memory, {
    handover: present(memory.handover)
      ? fenced(memory.handover, 'markdown')
      : 'None: the earlier session left no letter.',
    journal: journal.length === 0 ? 'None.' : fenced(journal.join('\n'), 'jsonl'),
    git_log: present(memory.git_log) ? fenced(memory.git_log) : 'No commits yet.',
  });
}

export function continuationBlock(
  quest: Quest,
  continuation: (Continuation & Memory) | null,
  t: PromptTemplates,
): string {
  if (continuation === null) return '';
  const intro =
    continuation.reason === 'revive'
      ? t.revive
      : fill(t.returned, {
          result: continuation.verdict.result,
          fail_kind: continuation.verdict.fail_kind ?? 'none',
          notes: continuation.verdict.notes?.trim() ?? '',
        });
  return joinBlocks([intro, answerBlock(quest, t), memoryBlock(continuation, t)]);
}
