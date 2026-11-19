// The ceilings a quest's sessions are held to (PS-28b, docs/plans/session-stamina.md): computed with the breakers' own
// functions and the calibration the Steward reads every tick (heldReadingsOf), never from budget.max_tokens alone. The
// ceiling in force is seldom the budget: once the holder's tribe is known it is the estimate times the tribe's factor,
// the rank's share or the owner's raise (tokenCeilingFor). `quest show` prints them, `quest edit` says what a new budget
// does to them, and the bell's figures are written the same way.
import { CALIBRATION_MIN_SAMPLES, calibrationOf, tokenCeilingFor } from '@elvaria/domain';
import type { Calibration, Quest, Role, SessionRules, SessionTrip, TokenCeiling } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import type { KingdomContext } from '../kingdom-context.ts';

export interface CeilingRules {
  readonly rules: SessionRules;
  readonly calibration: Calibration;
  readonly soft_pct: number;
  readonly hard_pct: number;
}

/** The kingdom's breaker settings, characters and calibration, as the Steward composes them for its breakers. */
export async function ceilingRulesOf(ctx: KingdomContext, quests: readonly Quest[]): Promise<CeilingRules> {
  const { items } = await ctx.store.characters.list();
  const characters = new Map(items.map((character) => [character.id as string, character]));
  const { breakers, tribes } = ctx.kingdom;
  return {
    rules: { ...breakers, characters, tribes },
    calibration: calibrationOf(quests, characters, ctx.kingdom),
    soft_pct: breakers.soft_pct,
    hard_pct: breakers.hard_pct,
  };
}

export const tokenCeilingIn = (quest: Quest, role: Role, rules: CeilingRules): TokenCeiling =>
  tokenCeilingFor(quest, role, rules.rules, rules.calibration);

const MINUTE_DIGITS = 1;

/** A figure of a gauge as the owner reads it: whole tokens and turns, minutes to a tenth. */
export const figureOf = (measure: SessionTrip, value: number): string =>
  measure === 'time' ? String(Number(value.toFixed(MINUTE_DIGITS))) : String(Math.round(value));

/** Where a gauge with `limit` sits at `pct` percent: the reminder mark at soft_pct, the cut at hard_pct. */
export const atPct = (limit: number, pct: number): number => (limit * pct) / 100;

export const measureName = (t: Translate, measure: SessionTrip): string => t(`cli.quest.measure.${measure}`);

/** The holder of `role` on the quest, or none for an empty seat. */
export const holderOf = (quest: Quest, role: Role): string | undefined =>
  (role === 'assignee' ? quest.assignee : quest.verifier) ?? undefined;

/** Why the token ceiling is what it is, in a few words, for a sentence that says it changed nothing. */
export function sourceText(t: Translate, quest: Quest, ceiling: TokenCeiling): string {
  const tribe = ceiling.tribe ?? NONE;
  if (ceiling.source === 'estimate') return t('cli.quest.ceiling.source.estimate', { tribe });
  if (ceiling.source === 'rank_share') return t('cli.quest.ceiling.source.rank_share', { rank: quest.rank });
  return t(`cli.quest.ceiling.source.${ceiling.source}`);
}

/** The sentence of what set a calibrated ceiling: the estimate times the tribe's factor, or the rank's share. */
function calibratedWhy(t: Translate, quest: Quest, ceiling: TokenCeiling): string[] {
  const { parts, factor } = ceiling;
  const tribe = ceiling.tribe ?? NONE;
  const budget = quest.budget.max_tokens;
  if (parts === undefined || factor === undefined) return [];
  if (ceiling.source === 'raised') return [t('cli.quest.ceiling.why.raised', { budget })];
  if (ceiling.source === 'rank_share') {
    const share = Math.round(parts.rank_share);
    return [t('cli.quest.ceiling.why.rank_share', { budget, rank: quest.rank, share, tribe })];
  }
  const factor_source =
    factor.source === 'measured'
      ? t('cli.quest.ceiling.factor.measured', { samples: factor.samples })
      : t('cli.quest.ceiling.factor.default', { samples: factor.samples, min: CALIBRATION_MIN_SAMPLES });
  const estimate = quest.estimate.tokens;
  return [
    t('cli.quest.ceiling.why.estimate', { budget, estimate, factor: factor.value, tribe, factor_source }),
  ];
}

/** Why the ceiling of `role` is not the budget, and from what figure a raise lifts it. */
function whyLine(t: Translate, quest: Quest, ceiling: TokenCeiling, rules: CeilingRules): string {
  const judge = ceiling.role === 'verifier';
  const empty = holderOf(quest, ceiling.role) === undefined;
  const differs = ceiling.limit !== quest.budget.max_tokens;
  const parts = [
    ...(empty ? [t('cli.quest.ceiling.no_tribe')] : []),
    ...(differs ? calibratedWhy(t, quest, ceiling) : []),
    ...(judge ? [t('cli.quest.ceiling.judge', { multiplier: rules.rules.verifier_tokens_multiplier })] : []),
    t('cli.quest.ceiling.raise', { from: ceiling.raise_from }),
  ];
  return parts.join(' ');
}

/** One seat's ceilings: tokens and minutes, nominal, at the mark and at the cut. */
function seatLines(t: Translate, quest: Quest, role: Role, rules: CeilingRules): string[] {
  const ceiling = tokenCeilingIn(quest, role, rules);
  const character = holderOf(quest, role);
  const who =
    character === undefined
      ? t(`cli.quest.ceiling.nobody.${role}`)
      : t(`cli.quest.ceiling.who.${role}`, { character, tribe: ceiling.tribe ?? NONE });
  const tokens = ceiling.limit;
  const minutes = quest.budget.max_minutes;
  const line = t('cli.quest.ceiling.line', {
    who,
    tokens,
    tokens_mark: figureOf('tokens', atPct(tokens, rules.soft_pct)),
    tokens_cut: figureOf('tokens', atPct(tokens, rules.hard_pct)),
    minutes,
    minutes_mark: figureOf('time', atPct(minutes, rules.soft_pct)),
    minutes_cut: figureOf('time', atPct(minutes, rules.hard_pct)),
  });
  return [`  ${line}`, `    ${whyLine(t, quest, ceiling, rules)}`];
}

/** `quest show`: the ceilings in force for the assignee and the judge, as the breakers would hold their sessions. */
export const ceilingLines = (t: Translate, quest: Quest, rules: CeilingRules): string[] => [
  '',
  t('cli.quest.ceiling.head'),
  ...seatLines(t, quest, 'assignee', rules),
  ...seatLines(t, quest, 'verifier', rules),
];
