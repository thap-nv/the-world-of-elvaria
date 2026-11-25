// What a job of the Steward is shown beside what a spec cares about (PS-12f): the Temple off with nothing counted, and
// no character whose mana opens a session. A spec of the Temple's job gives its own.
import type { CharacterId } from '@elvaria/domain';
import type { TempleView } from '@elvaria/steward';

export const TEMPLE_OFF: TempleView = {
  log: { last_day: null, judged: 0, fails: 0, suspended: [] },
  due: { due: false, why: 'disabled' },
};

export const QUIET_VIEW = { temple: TEMPLE_OFF, mana_open: new Set<CharacterId>() };
