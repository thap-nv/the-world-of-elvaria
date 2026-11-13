// Memos and quests for the triage specs (PS-03b): a knight's quest on dc1-se-team whose letter held the memos, the
// quests a merge may name, and the Chancellor's reply as the CLI hands it over.
import { MemoSchema, QuestSchema } from '@elvaria/domain';
import type { Memo, MemoTriageFile, Quest } from '@elvaria/domain';

import type { CommandSource } from '../commands.ts';

export const AT = '2026-11-13T07:30:00+07:00';

export function questOf(id: string, fields: Record<string, unknown> = {}): Quest {
  return QuestSchema.parse({
    version: 1,
    id,
    title: `Quest ${id}`,
    description: `Work of ${id}.`,
    kind: 'build',
    rank: 'D',
    class_required: 'knight',
    tags: ['backend'],
    territory: 'dc1-se-team',
    status: 'open',
    tier: 'session',
    assignee: null,
    verifier: null,
    depends_on: [],
    budget: { max_minutes: 45, max_tokens: 400000, max_attempts: 3 },
    estimate: { tokens: 200000, minutes: 30 },
    attempts: 0,
    attempt_log: [],
    plot: { type: 'none' },
    deliverable: { type: 'branch' },
    seal_required: false,
    secrets_required: [],
    checks_run: [],
    created_by: 'user',
    created_at: '2026-11-12T09:00:00+07:00',
    updated_at: '2026-11-12T09:00:00+07:00',
    ...fields,
  });
}

/** The quest whose letter held every memo: it worked on the API. */
export const SOURCE = questOf('q_20261112_srcqst', { status: 'done', scope_paths: ['apps/api/**'] });
/** An open quest on the docs, rank E: a merge within the delegation's default rank. */
export const DOCS = questOf('q_20261112_d0csaa', { scope_paths: ['docs/**', 'README.md'], rank: 'E' });
/** An open quest on the web app, rank C: above the default rank. */
export const WEB = questOf('q_20261112_webapp', { scope_paths: ['apps/web/**'], rank: 'C' });
/** A quest at work: no merge names it. */
export const BUSY = questOf('q_20261112_bzyaaa', { status: 'working', assignee: 'thorn' });

export function memoOf(id: string, body: string, refs: readonly string[]): Memo {
  return MemoSchema.parse({
    version: 1,
    id,
    kind: 'proposal',
    from: 'thorn',
    quest: SOURCE.id,
    attempt: 1,
    to: { route: 'chancellor' },
    body,
    refs,
    state: 'open',
    filed_at: '2026-11-12T10:00:00+07:00',
  });
}

/** A one-quest draft of a triage reply. */
export const draftOf = (ref: string, fields: Record<string, unknown> = {}) => ({
  ref,
  title: `Draft ${ref}`,
  description: `Work of draft ${ref}.`,
  kind: 'document',
  rank: 'F',
  territory: 'dc1-se-team',
  tier: 'session',
  class_required: 'scribe',
  tags: ['docs'],
  scope_paths: ['docs/**'],
  depends_on_refs: [],
  estimate: { tokens: 20000, minutes: 10 },
  seal_required: false,
  secrets_required: [],
  ...fields,
});

export const triageOf = (decisions: readonly unknown[], drafts: readonly unknown[] = []): MemoTriageFile =>
  ({ version: 1, decisions, drafts }) as MemoTriageFile;

/** Headers of the triage: source `chancellor`, ids that grow; the quest id the Steward gives each. */
export function sourceOf(): CommandSource {
  let n = 0;
  return {
    header: () => {
      n += 1;
      return {
        version: 1,
        id: `01JCG000000000000000000${String(n).padStart(3, '0')}`,
        ts: AT,
        source: 'chancellor',
      };
    },
    questIdOf: (header) => `q_20261113_new${header.id.slice(-3)}` as Quest['id'],
  };
}
