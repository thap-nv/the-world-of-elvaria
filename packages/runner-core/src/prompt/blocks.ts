// The blocks prompts are made of (implementation-plan §3.7, §3.13; ADR 0010, 0017): each fills one template from
// the kingdom's files, and an optional block with nothing to say is empty, so joinBlocks leaves it out.
import { fenced, fill, joinBlocks } from './templates.ts';
import type { PromptTemplates } from './templates.ts';
import type { Kingdom, Quest, Registry, Skill, Territory, Verdict } from '@elvaria/domain';

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

function partyFact(quest: Quest): string[] {
  if (quest.party_id === undefined) return [];
  const contract = quest.contract === undefined ? '' : `, contract \`${quest.contract}\``;
  return [`- Party: ${quest.party_role ?? 'part'} of ${quest.party_id}${contract}`];
}

export function questBlock(quest: Quest, registry: Registry, t: PromptTemplates): string {
  const kind = entryOf(registry.kinds, quest.kind, 'kind');
  const facts = [
    `- Kind: ${quest.kind} (deliverable: ${kind.deliverable_type})`,
    `- Rank: ${quest.rank}`,
    `- Tags: ${quest.tags.length === 0 ? 'none' : quest.tags.join(', ')}`,
    `- Territory: ${quest.territory}`,
    `- Limits: ${quest.budget.max_minutes} minutes, ${quest.budget.max_tokens} tokens`,
    ...partyFact(quest),
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
