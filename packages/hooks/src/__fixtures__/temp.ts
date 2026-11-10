// Throwaway kingdoms in the OS temp folder. The name has a space on purpose: real kingdoms live in paths like
// `D:\Dummy\Tool - Personal\…`.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openEventLog, openJournal } from '@elvaria/eventlog';
import type { EventBatch } from '@elvaria/eventlog';

import { CHARACTER, QUEST } from './claude-payloads.ts';
import type { HookEnv } from '../context.ts';

export interface TempKingdom {
  readonly root: string;
  /** The run folder of attempt 1 of QUEST, as the runner lays it out (§2.2). */
  readonly runDir: string;
  /** env `ELVARIA_*` of a session on QUEST, attempt 1. */
  env(fields?: Record<string, string | undefined>): HookEnv;
  /** Every line of the log, read back through the domain's EventSchema. */
  log(): Promise<EventBatch>;
  journal(): ReturnType<ReturnType<typeof openJournal>['read']>;
  writeHandover(text: string): Promise<void>;
  remove(): Promise<void>;
}

export async function tempKingdom(): Promise<TempKingdom> {
  const root = await mkdtemp(path.join(tmpdir(), 'elvaria hooks '));
  const runDir = path.join(root, '.runs', `${QUEST}-1`);
  await mkdir(runDir, { recursive: true });
  return {
    root,
    runDir,
    env: (fields = {}) => ({
      ELVARIA_KINGDOM: root,
      ELVARIA_QUEST: QUEST,
      ELVARIA_ATTEMPT: '1',
      ELVARIA_CHARACTER: CHARACTER,
      ELVARIA_ROLE: 'verifier',
      ELVARIA_TRIBE: 'claude',
      ELVARIA_TZ: 'Asia/Ho_Chi_Minh',
      ...fields,
    }),
    log: () => openEventLog(root).read(),
    journal: () => openJournal(root, QUEST).read(),
    writeHandover: async (text) => {
      await mkdir(path.join(root, 'quests', QUEST), { recursive: true });
      await writeFile(path.join(root, 'quests', QUEST, 'handover.md'), text, 'utf8');
    },
    // On Windows a hook child that just ended, or the indexer, may hold the folder a moment (EBUSY): retry (P1-39).
    remove: () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }),
  };
}
