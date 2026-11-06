import { describe, expect, inject, it } from 'vitest';

import { QUEST_STATUSES } from '../schema/quest/shared.ts';
import { STATUS_TONES, statusToneOf } from './status-tone.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The current elvaria.css, read by vitest.config.mjs: ui-kit once it exists, the design handoff until then. */
    designCss: { path: string; text: string };
  }
}

const css = inject('designCss');
const cssTones = [...new Set([...css.text.matchAll(/\[data-status="([^"]+)"\]/g)].map((match) => match[1]))];

describe('statusToneOf', () => {
  it(`uses exactly the data-status tones of ${css.path.split(/[\\/]/).slice(-3).join('/')}`, () => {
    expect(cssTones.length).toBeGreaterThan(0);
    expect([...cssTones].sort()).toEqual([...STATUS_TONES].sort());
  });

  it('gives every quest status a tone the CSS draws, and every tone a status', () => {
    const used = new Set(QUEST_STATUSES.map(statusToneOf));
    for (const status of QUEST_STATUSES) expect(cssTones).toContain(statusToneOf(status));
    expect(STATUS_TONES.filter((tone) => !used.has(tone))).toEqual([]);
  });

  it('maps the twelve statuses as the plan and the glossary say (§2.7, glossary §7.1)', () => {
    expect(Object.fromEntries(QUEST_STATUSES.map((status) => [status, statusToneOf(status)]))).toEqual({
      draft: 'open',
      open: 'open',
      claimed: 'working',
      working: 'working',
      review: 'review',
      returned: 'returned',
      awaiting_seal: 'seal',
      done: 'done',
      blocked: 'open',
      paused_mana: 'sleep',
      infirmary: 'infirmary',
      archived: 'open',
    });
  });
});
