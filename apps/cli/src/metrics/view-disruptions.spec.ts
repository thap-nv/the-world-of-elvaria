import {
  EVENT_VERSION,
  EventSchema,
  disruptionsOf,
  metricsOf,
  parseDisruptionKinds,
  questViewOf,
} from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { disruptionsSection } from './view-disruptions.ts';
import { metricsSections } from './view.ts';
import { questFixture } from '../__fixtures__/quest.ts';

const t = translator('en');
const names = { name_vi: 'Sự cố', name_en: 'Disruption', description: 'A sample disruption.' };
const parsed = parseDisruptionKinds({
  version: 1,
  disruptions: [
    { ...names, id: 'single', shape: 'event', type: 'quest.unclaimable' },
    {
      ...names,
      id: 'session_cut_then_submitted',
      shape: 'sequence',
      first: { type: 'agent.session.end', where: [{ path: 'data.outcome', in: ['max_turns'] }] },
      then: { type: 'quest.submitted' },
      same: ['quest', 'session'],
      within_seconds: 600,
    },
    {
      ...names,
      id: 'wait',
      shape: 'sequence',
      first: { type: 'agent.session.end' },
      then: { type: 'quest.submitted' },
      same: ['quest', 'session'],
      after_minutes: 5,
    },
  ],
});
if (!parsed.ok) throw new Error('Invalid sample registry');
const kinds = parsed.value;

const submitted = {
  quest: questViewOf(questFixture('review', undefined, { assignee: 'thorn', attempts: 1 })),
};
const event = (
  index: number,
  type: string,
  time: string,
  data: Record<string, unknown> = { reason: 'no_class', rank: 'E', class: 'knight' },
) =>
  EventSchema.parse({
    v: EVENT_VERSION,
    id: `01JC000000000000000000000${index}`,
    ts: `2026-11-25T${time}+07:00`,
    type,
    actor: { kind: 'steward' },
    quest: 'q_20261125_c4mcjt',
    session: 'sample-session',
    data,
  });

describe('operational disruptions section', () => {
  it('counts in registry order, sums minutes and shows only the three newest first-event ids', () => {
    const events = [
      event(0, 'agent.session.end', '21:41:00', { outcome: 'max_turns' }),
      event(1, 'quest.unclaimable', '21:42:00'),
      event(2, 'quest.unclaimable', '21:43:00'),
      event(3, 'quest.unclaimable', '21:44:00'),
      event(4, 'quest.unclaimable', '21:45:00'),
      event(5, 'quest.submitted', '21:48:59', submitted),
    ];
    const disruptions = disruptionsOf(events, kinds);
    expect(disruptions.find(({ kind }) => kind === 'wait')?.minutes).toBe(7);
    expect(disruptions.find(({ kind }) => kind === 'session_cut_then_submitted')).not.toHaveProperty(
      'minutes',
    );
    const section = disruptionsSection(t, { ok: true, kinds, disruptions });
    expect(section.table?.rows).toEqual([
      [
        'single',
        '4',
        '0',
        '01JC0000000000000000000004, 01JC0000000000000000000003, 01JC0000000000000000000002',
      ],
      ['session_cut_then_submitted', '1', '7', '01JC0000000000000000000000'],
      ['wait', '1', '7', '01JC0000000000000000000000'],
    ]);
    const metrics = metricsOf({ quests: [], verdicts: [], commands: [], events: [] });
    const sections = metricsSections(t, metrics, new Map(), section);
    expect(sections[sections.indexOf(section) - 1]?.title).toBe('Checks by mode');
    expect(sections.slice(-6)).toEqual(metricsSections(t, metrics).slice(-6));
  });

  it('uses explicit minutes when present and sums multiple occurrences', () => {
    const disruptions = disruptionsOf(
      [
        event(0, 'agent.session.end', '21:41:00', { outcome: 'max_turns' }),
        event(1, 'quest.submitted', '21:48:00', submitted),
      ],
      kinds,
    );
    const first = disruptions.find(({ kind }) => kind === 'wait');
    if (first === undefined) throw new Error('Missing wait');
    expect(
      disruptionsSection(t, {
        ok: true,
        kinds,
        disruptions: [first, { ...first, minutes: 11 }],
      }).table?.rows,
    ).toEqual([['wait', '2', '18', '01JC0000000000000000000000, 01JC0000000000000000000000']]);
  });

  it('prints None without rows, in both languages', () => {
    expect(disruptionsSection(t, { ok: true, kinds, disruptions: [] })).toEqual({
      title: 'Operational disruptions',
      lines: ['None.'],
    });
    expect(disruptionsSection(translator('vi'), { ok: true, kinds, disruptions: [] }).title).toBe(
      'Sự cố vận hành',
    );
  });
});
