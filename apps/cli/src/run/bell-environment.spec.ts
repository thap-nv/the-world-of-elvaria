import { QuestIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { lineOf } from './bell.ts';

// P1-54, (c) of the P1-50 report: checks whose environment failed get no judge, and the owner hears of it once.
const quest = {
  id: QuestIdSchema.parse('q_20261111_zaq7w0'),
  title: '/team: tên L4+ cho Leader',
  rank: 'C' as const,
};
const notice = {
  kind: 'environment' as const,
  quest,
  check: 'e2e',
  line: 'dependency db failed to start: No such container: 3f1c',
  log_path: '.runs/q_20261111_zaq7w0-1/checks/e2e.log',
  recheck_minutes: 10,
};

describe('the bell on checks whose environment failed', () => {
  it('names the check, the line of its log, when it runs again and where the log is', () => {
    expect(lineOf(translator('en'), notice)).toBe(
      'Quest q_20261111_zaq7w0 «/team: tên L4+ cho Leader» waits in review: its check e2e failed because of its ' +
        'environment, not the work (dependency db failed to start: No such container: 3f1c). No judge reads it and ' +
        'nobody loses a level; the checks run again in 10 minutes. Log: .runs/q_20261111_zaq7w0-1/checks/e2e.log',
    );
  });

  it('says it in the owner language, a dash for a log it does not know', () => {
    const { log_path: _none, ...bare } = notice;
    const said = lineOf(translator('vi'), bare);
    expect(said).toContain('kiểm tra máy e2e đỏ vì môi trường');
    expect(said.endsWith('Log: —')).toBe(true);
  });
});
