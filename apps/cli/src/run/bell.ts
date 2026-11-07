// ConsoleBell (implementation-plan §3.1, stage 1): the Steward rings with data, a Notice; this bell says it in the
// owner's language on the terminal that runs `elvaria run`. Desktop and web push come in stage 2.
import type { Translate } from '@elvaria/i18n';
import type { Bell, Notice } from '@elvaria/steward';

import { stretchOf } from '../quest/unclaimable.ts';
import type { CliIo } from '../io.ts';

/** Why an open quest waits, with the sentences `quest show` uses for the same notice (P1-03). */
function waitReason(t: Translate, notice: Extract<Notice, { kind: 'unclaimable' }>): string {
  const { best } = notice;
  if (notice.reason === 'level_too_low' && best !== undefined) {
    return t('cli.quest.unclaimable.level_too_low', {
      rank: notice.quest.rank,
      class: notice.class,
      character: best.character,
      level: best.level,
      ceiling: best.ceiling,
      stretch: stretchOf(best.ceiling),
    });
  }
  return t('cli.quest.unclaimable.no_class', { class: notice.class });
}

export function lineOf(t: Translate, notice: Notice): string {
  const quest = { quest: notice.quest.id, title: notice.quest.title };
  switch (notice.kind) {
    case 'unclaimable':
      return t('cli.run.notice.unclaimable', {
        ...quest,
        rank: notice.quest.rank,
        reason: waitReason(t, notice),
      });
    case 'awaiting_seal':
      return t('cli.run.notice.awaiting_seal', quest);
    case 'infirmary':
      return t('cli.run.notice.infirmary', { ...quest, reason: notice.reason });
    case 'question':
      return t('cli.run.notice.question', { ...quest, question: notice.question });
  }
}

export function consoleBell(t: Translate, io: CliIo): Bell {
  return {
    ring: (notice) => {
      io.out(lineOf(t, notice));
      return Promise.resolve();
    },
  };
}
