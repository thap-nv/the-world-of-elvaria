import { afterEach, describe, expect, it } from 'vitest';

import { LINKS, infirmaryLine, scriptKingdom, scriptQuest } from '../__fixtures__/scripts.ts';

const kingdom = scriptKingdom();
afterEach(() => kingdom.remove());

describe('script infirmary reasons through the event recorder (LL-07)', () => {
  it.each([
    {
      exit: 1,
      stdout: '',
      stderr: '  boom\npassword=hidden-value\n',
      code: 'broken',
      params: {},
      message: '  boom\npassword=[redacted]\n',
    },
    {
      exit: 2,
      stdout: '',
      stderr: '  cannot use params\n',
      code: 'usage',
      params: {},
      message: '  cannot use params\n',
    },
    { exit: 1, stdout: '', stderr: '', code: 'broken_exit', params: { exit: 1 }, message: '' },
    { exit: null, stdout: '', stderr: '', code: 'broken_killed', params: {}, message: '' },
    { exit: 2, stdout: '', stderr: '', code: 'usage_silent', params: {}, message: '' },
    {
      exit: 0,
      stdout: '{}\n{}\n',
      stderr: '',
      code: 'broken_lines',
      params: { lines: 2 },
      message: '{}\n{}\n',
    },
    {
      exit: 0,
      stdout: '  not JSON\n',
      stderr: '',
      code: 'broken_not_json',
      params: {},
      message: '  not JSON\n',
    },
    {
      exit: 0,
      stdout: '{}\n',
      stderr: '',
      code: 'broken_shape',
      params: { produces: 'units' },
      message: '{}\n',
    },
  ])('records script:$code with exact params and verbatim external output', async (sample) => {
    const bench = await kingdom.setup({
      deps: {
        scripts: () =>
          Promise.resolve({
            exit_code: sample.exit,
            stdout: sample.stdout,
            stderr: sample.stderr,
            timed_out: false,
            stopped: false,
            duration_ms: 1,
          }),
      },
    });
    await bench.command('create_quest', scriptQuest('Broken', LINKS));
    await kingdom.run();
    expect((await bench.quest('Broken')).status).toBe('infirmary');
    const line = await infirmaryLine(bench);
    expect(line?.reason).toEqual({
      code: `script:${sample.code}`,
      params: { script: 'link-check', ...sample.params },
    });
    expect(line?.detail).toEqual({
      script: 'link-check',
      ...(sample.message === '' ? {} : { message: sample.message }),
    });
    expect(line?.trip).toBe(sample.exit === 2 ? 'script_usage' : 'script_broken');
  });
});
