// A second process for concurrency.spec.ts: `node test/update-worker.ts <kingdom> <quest id> <count>` adds 1
// to the quest's estimate.minutes `count` times through the store, as the Steward and the CLI would.
// Node runs this TypeScript file directly (type stripping; imports name their `.ts` files).
import process from 'node:process';

import { QuestIdSchema, ok } from '@elvaria/domain';

import { openKingdom } from '../src/index.ts';

const [root = '', rawId = '', rawCount = '0'] = process.argv.slice(2);
const quests = openKingdom(root).quests;
const id = QuestIdSchema.parse(rawId);

for (let done = 0; done < Number(rawCount); done += 1) {
  const result = await quests.update(id, (quest) =>
    ok({ ...quest, estimate: { ...quest.estimate, minutes: quest.estimate.minutes + 1 } }),
  );
  if (!result.ok) {
    process.stderr.write(`${JSON.stringify(result.error)}\n`);
    process.exit(1);
  }
}
