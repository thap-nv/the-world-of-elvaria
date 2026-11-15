// What doctor says of a tribe's declared facts besides its shell (check-prompt.ts): whether its CLI reads images
// (PS-11), the limit of its prompt being shown in check-shell.spec.ts with a real adapter file.
import { TribeSchema } from '@elvaria/domain';
import type { AdapterCapabilities } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { visionFindings } from './check-prompt.ts';

const TRIBE = TribeSchema.parse({ id: 'gemini', adapter: 'antigravity', enabled: true, max_concurrent: 1 });
const CAPS = { auth: ['login'], headless: true } as unknown as AdapterCapabilities;

describe('visionFindings', () => {
  it('says so when the adapter declares that its CLI reads images, and nothing otherwise', () => {
    expect(visionFindings(TRIBE, { ...CAPS, vision: true }, translator('en'))).toEqual([
      {
        level: 'ok',
        text: 'Tribe gemini: its CLI reads images; its judges may take a quest whose ritual compares screens (visual_review).',
        details: [],
      },
    ]);
    expect(visionFindings(TRIBE, { ...CAPS, vision: false }, translator('en'))).toEqual([]);
    expect(visionFindings(TRIBE, CAPS, translator('en'))).toEqual([]);
    expect(visionFindings(TRIBE, undefined, translator('en'))).toEqual([]);
  });
});
