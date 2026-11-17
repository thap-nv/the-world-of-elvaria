// ConsoleBell (implementation-plan §3.1, stage 1): the Steward rings with data, a Notice; this bell says it in the
// owner's language on the terminal that runs `elvaria run`. Desktop and web push come in stage 2.
import type { Translate } from '@elvaria/i18n';
import type { Bell, ManaGaugeNotice, Notice } from '@elvaria/steward';

import { gaugesOf } from '../digest/markdown.ts';
import { detailLines, whyLines } from '../quest/infirmary.ts';
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
  if (notice.reason === 'party_bars') return t('cli.quest.unclaimable.party_bars', { class: notice.class });
  return t('cli.quest.unclaimable.no_class', { class: notice.class });
}

/** The gauge a mana notice is about: a whole pool, or the cap of one model (P1-22). */
const gaugeOf = (t: Translate, notice: ManaGaugeNotice): string =>
  notice.model === undefined
    ? t('cli.run.notice.gauge.pool', { pool: notice.pool, tribe: notice.tribe })
    : t('cli.run.notice.gauge.model', { model: notice.model, tribe: notice.tribe });

/**
 * Why a quest went to the infirmary, in the owner's language (P1-32): the sentence of its reason (contract
 * infirmary-reason-codes), then the hook's lines and each part of the detail on a line of its own, as `quest show`
 * says them.
 */
function infirmaryLine(t: Translate, notice: Extract<Notice, { kind: 'infirmary' }>): string {
  const { quest, trip, detail = {}, reason } = notice;
  const [why = '', ...hook] = whyLines(t, reason, trip);
  const head = t('cli.run.notice.infirmary', { quest: quest.id, title: quest.title, reason: why });
  return [head, ...[...hook, ...detailLines(t, detail, reason)].map((line) => `    ${line}`)].join('\n');
}

type ManaNotice = Extract<Notice, { kind: 'mana_asleep' | 'mana_awake' | 'mana_warning' }>;

/** A gauge warned, ran dry or came back (P1-22). */
function manaLine(t: Translate, notice: ManaNotice): string {
  const gauge = gaugeOf(t, notice);
  if (notice.kind === 'mana_awake') return t('cli.run.notice.mana_awake', { gauge });
  if (notice.kind === 'mana_asleep') {
    const resets = notice.resets_at;
    return resets === undefined
      ? t('cli.run.notice.mana_asleep', { gauge })
      : t('cli.run.notice.mana_asleep_until', { gauge, resets_at: resets });
  }
  const window = t(`cli.run.notice.window.${notice.window}`);
  return t('cli.run.notice.mana_warning', { gauge, used_pct: notice.used_pct, window });
}

/** A merge into a merge quest's plot stopped (PS-08e): a conflict is the knight's next run, the rest the owner's. */
function mergeLine(t: Translate, notice: Extract<Notice, { kind: 'merge_stopped' }>): string {
  const { quest, branch, conflicts } = notice;
  const said = { quest: quest.id, title: quest.title, branch, files: conflicts.join(', ') };
  return t(`cli.run.notice.merge_${notice.reason}`, said);
}

/** A tribe held at its CLI's version, or whose CLI is gone (A1b). */
function tribeLine(t: Translate, notice: Extract<Notice, { kind: 'tribe_held' }>): string {
  const { tribe, path, version, checked } = notice;
  return version === undefined
    ? t('cli.run.notice.tribe_gone', { tribe, path, checked })
    : t('cli.run.notice.tribe_held', { tribe, path, version, checked });
}

/** A delivery to the forge (PS-08c): the pull request, with the files to look at; or where it stopped and why. */
function deliveryLine(
  t: Translate,
  notice: Extract<Notice, { kind: 'delivery_pushed' | 'delivery_failed' }>,
): string {
  const quest = { quest: notice.quest.id, title: notice.quest.title };
  if (notice.kind === 'delivery_failed') {
    const stage = t(`cli.forge.stage.${notice.stage}`);
    return t('cli.run.notice.delivery_failed', {
      ...quest,
      stage,
      why: t(`cli.forge.reason.${notice.reason}`),
    });
  }
  if (notice.warnings.length === 0) return t('cli.run.notice.delivery_pushed', { ...quest, url: notice.url });
  const files = notice.warnings.join(', ');
  return t('cli.run.notice.delivery_pushed_warnings', { ...quest, url: notice.url, files });
}

/** PS-26: checks of a default branch turned red, and the draft the patrol opened for them. */
function baseRedLine(t: Translate, notice: Extract<Notice, { kind: 'base_red' }>): string {
  const { territory, draft } = notice;
  const checks = notice.checks.map(({ check }) => check).join(', ');
  return draft === undefined
    ? t('cli.run.notice.base_red', { territory, checks })
    : t('cli.run.notice.base_red_draft', { territory, checks, quest: draft });
}

export function lineOf(t: Translate, notice: Notice): string {
  if (notice.kind === 'suspended') {
    const { character, count } = notice;
    return t('cli.run.notice.suspended', { character, count, fail_kind: notice.fail_kind ?? 'other' });
  }
  if (notice.kind === 'mana_asleep' || notice.kind === 'mana_awake' || notice.kind === 'mana_warning')
    return manaLine(t, notice);
  if (notice.kind === 'digest') {
    const { day, file, must, can_wait } = notice;
    return t('cli.run.notice.digest', { day, file, must, can_wait });
  }
  if (notice.kind === 'tribe_held') return tribeLine(t, notice);
  if (notice.kind === 'base_red') return baseRedLine(t, notice);
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
      return infirmaryLine(t, notice);
    case 'question':
      return t('cli.run.notice.question', { ...quest, question: notice.question });
    case 'subquests_refused':
      return t('cli.run.notice.subquests_refused', { ...quest, reason: notice.reason });
    case 'merge_stopped':
      return mergeLine(t, notice);
    case 'delivery_pushed':
    case 'delivery_failed':
      return deliveryLine(t, notice);
    case 'environment':
      return t('cli.run.notice.environment', {
        ...quest,
        check: notice.check,
        line: notice.line,
        minutes: notice.recheck_minutes,
        log: notice.log_path ?? '—',
      });
    case 'judge_mana':
      return t('cli.run.notice.judge_mana', {
        ...quest,
        classes: notice.classes.join(', ') || '—',
        class: notice.classes[0] ?? 'judge',
        gauges: gaugesOf(t, notice.gauges),
      });
    case 'unjudgeable':
      // PS-11: the judge it lacks is one whose tribe reads images, not one on another model.
      return t(notice.vision === true ? 'cli.run.notice.unjudgeable_vision' : 'cli.run.notice.unjudgeable', {
        ...quest,
        classes: notice.classes.join(', ') || '—',
        class: notice.classes[0] ?? 'judge',
        model: notice.model ?? '—',
      });
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
