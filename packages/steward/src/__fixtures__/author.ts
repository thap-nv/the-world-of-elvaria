// The author's office of an amendment (PS-22b, ADR 0024), on call: a fake job that writes the author's
// decide_amendment for each quest waiting on its author, as the Chancellor's office does.
import type { Memo, Quest } from '@elvaria/domain';

import type { Bench } from './kingdom.ts';
import type { JobRun, OnCallJob } from '../types.ts';

/** The decision's payload, beside the memo it decides, from the memo and the quest as the author reads them. */
export type Decide = (memo: Memo, quest: Quest) => Record<string, unknown>;

/** The author's office, on call: one decide_amendment per quest waiting, written as the Chancellor's office does. */
export function authorJob(kingdom: () => Bench, decide: Decide): OnCallJob & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    id: 'amendment',
    asked,
    ready: (view) => Promise.resolve(view.amendments.some((id) => !asked.includes(id))),
    run: async ({ amendments }: JobRun) => {
      const id = amendments.find((quest) => !asked.includes(quest));
      if (id === undefined) return;
      asked.push(id);
      const { store, ids } = kingdom();
      const quest = await store.quests.read(id);
      const memo = quest.ok ? quest.value.blocked?.amendment?.memo : undefined;
      const read = memo === undefined ? undefined : await store.memos.read(memo);
      if (!quest.ok || read?.ok !== true) throw new Error('fixture: no amendment');
      const payload = { memo: read.value.id, ...decide(read.value, quest.value) };
      const ts = '2026-11-07T09:00:00+07:00';
      const command = {
        version: 1,
        id: ids.ulid(),
        ts,
        kind: 'decide_amendment',
        source: 'chancellor',
        payload,
      };
      const written = await store.inbox.write(command as never);
      if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
    },
  };
}
