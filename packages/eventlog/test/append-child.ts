// One appending process for concurrency.spec.ts, run by Node's type stripping:
//   node test/append-child.ts <kingdom> <label> <count>
// Appends <count> events one call at a time, to the log and to the quest's journal, as a hook does.
import process from 'node:process';

import { DAY_1, QUEST, makeEvent, plus } from '../src/__fixtures__/events.ts';
import { openEventLog, openJournal } from '../src/index.ts';

const [kingdom, label, count] = process.argv.slice(2);
if (kingdom === undefined || label === undefined || count === undefined) {
  throw new Error('usage: append-child.ts <kingdom> <label> <count>');
}
const ID_SPACE = 1_000_000;
const log = openEventLog(kingdom);
const journal = openJournal(kingdom, QUEST);
for (let index = 0; index < Number(count); index += 1) {
  const n = Number(label) * ID_SPACE + index;
  // The ids differ by n; the times only need to stay on one day.
  const event = makeEvent(plus(DAY_1, index), n);
  await log.append([event]);
  await journal.append([event]);
}
