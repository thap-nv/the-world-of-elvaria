import { describe, expect, it } from 'vitest';

import { BASE, GOOD_GAZETTEER, territoryOf } from './__fixtures__/card.ts';
import { GAZETTEER_MAX_COMMITS } from './constants.ts';
import { gazetteerItem, namesCommand, sessionCommandsOf } from './gazetteer.ts';
import type { ScorecardItem } from './reasons.ts';

const codes = (item: ScorecardItem) => item.reasons.map(({ code }) => code);
const SHORT = BASE.slice(0, 12);

describe('namesCommand', () => {
  it('finds the whole line, or its words before the first option, whitespace aside', () => {
    expect(namesCommand('run `pnpm   lint` first', 'pnpm lint')).toBe(true);
    expect(namesCommand('Install: pnpm install.', 'pnpm install --frozen-lockfile --prefer-offline')).toBe(
      true,
    );
    expect(namesCommand('pnpm --filter @demo/api test', 'pnpm --filter @demo/api test')).toBe(true);
  });

  it('wants the whole line when its stem is one word', () => {
    expect(namesCommand('pnpm is the package manager', 'pnpm --filter @demo/api test')).toBe(false);
    expect(namesCommand('the tests', 'pnpm test')).toBe(false);
  });
});

describe('sessionCommandsOf', () => {
  it("lists what a session meets, each generator and check apart; never the machine's own commands", () => {
    const territory = territoryOf({
      commands: {
        setup: 'pnpm install',
        test: 'pnpm test',
        reset: 'docker compose down -v',
        coverage: 'pnpm coverage',
        generate: ['pnpm docs:gen', 'pnpm schemas'],
      },
      checks: [
        { id: 'e2e', run: ['pnpm e2e'], when: ['**'], timeout_minutes: 30, cleanup: 'docker rm -f x' },
      ],
    });
    expect(sessionCommandsOf(territory)).toEqual([
      { field: 'commands.setup', lines: ['pnpm install'] },
      { field: 'commands.test', lines: ['pnpm test'] },
      { field: 'commands.generate', lines: ['pnpm docs:gen'] },
      { field: 'commands.generate', lines: ['pnpm schemas'] },
      { field: 'checks.e2e.run', lines: ['pnpm e2e'] },
    ]);
  });
});

describe('the gazetteer item', () => {
  const stamped = (text: string) => `<!-- elvaria:commit ${BASE} -->\n${text}`;

  it('passes a gazetteer that is fresh and names every command', () => {
    const item = gazetteerItem(territoryOf(), {
      text: stamped(GOOD_GAZETTEER),
      stamp: BASE,
      commits_since: 3,
    });
    expect(item.status).toBe('pass');
    expect(item.reasons).toEqual([
      { code: 'gazetteer_fresh', params: { stamp: SHORT, commits: 3 } },
      { code: 'gazetteer_names', params: { count: 3 } },
    ]);
  });

  it('fails a missing or empty gazetteer, and says nothing else of it', () => {
    expect(codes(gazetteerItem(territoryOf(), { text: null }))).toEqual(['gazetteer_missing']);
    expect(gazetteerItem(territoryOf(), { text: ' \n' }).status).toBe('fail');
  });

  it('fails a gazetteer that names none of the commands, field by field', () => {
    const item = gazetteerItem(territoryOf(), { text: 'A demo repo.', stamp: BASE, commits_since: 0 });
    expect(item.status).toBe('fail');
    expect(item.reasons.filter(({ code }) => code === 'command_unnamed').map(({ params }) => params)).toEqual(
      [
        { field: 'commands.setup', command: 'pnpm install --frozen-lockfile' },
        { field: 'checks.lint.run', command: 'pnpm lint' },
        { field: 'checks.test.run', command: 'pnpm build && pnpm test' },
      ],
    );
  });

  it('fails without a stamp, with a stamp git does not know, and past the commits it allows', () => {
    expect(codes(gazetteerItem(territoryOf(), { text: GOOD_GAZETTEER }))).toEqual([
      'gazetteer_unstamped',
      'gazetteer_names',
    ]);
    const unknown = gazetteerItem(territoryOf(), { text: GOOD_GAZETTEER, stamp: BASE, commits_since: null });
    expect(unknown.reasons[0]).toEqual({ code: 'gazetteer_stamp_unknown', params: { stamp: SHORT } });
    const commits = GAZETTEER_MAX_COMMITS + 1;
    const stale = gazetteerItem(territoryOf(), { text: GOOD_GAZETTEER, stamp: BASE, commits_since: commits });
    expect(stale.reasons[0]).toEqual({
      code: 'gazetteer_stale',
      params: { stamp: SHORT, commits, max: GAZETTEER_MAX_COMMITS },
    });
  });

  it('leaves the stamp unchecked when the commits were not counted, and names no command of a bare territory', () => {
    const bare = territoryOf({ commands: {}, checks: [] });
    const item = gazetteerItem(bare, { text: GOOD_GAZETTEER, stamp: BASE });
    expect(item).toEqual({
      id: 'gazetteer',
      status: 'pass',
      reasons: [{ code: 'gazetteer_stamp_unchecked', params: { stamp: SHORT } }],
    });
  });
});
