// The conformance suite's `image` (PS-11b) for fake-claude.mjs: a judge opens the probe's PNG with Read, through the
// PreToolUse hooks and then the allow rules of its settings, as Claude Code does under dontAsk (vision spike
// 2026-11-17: a file outside the plot opens only by its own `Read(//<drive>/…)` rule), then "sees" its stripes. Written
// apart from the adapter's absoluteRulePath, so a rule the adapter writes in another form is refused here too.
import process from 'node:process';

import { hookDenial } from './fake-claude-denials.mjs';

/** The rule Claude Code compares an absolute path with: `//` and the POSIX form, the drive in lower case. */
function ruleOf(file) {
  const drive = /^([A-Za-z]):[\\/]/.exec(file);
  const posix = drive === null ? file : `/${drive[1].toLowerCase()}${file.slice(2)}`;
  return `Read(/${posix.replaceAll('\\', '/')})`;
}

/** `cli` holds fake-claude's own helpers: speak, runHooks, finish. */
export function image(play, cli) {
  const file = play.core.fakeImageOf(process.env);
  const input = { file_path: file };
  cli.speak(play, [{ type: 'tool_use', id: 'toolu_fake_image', name: 'Read', input }]);
  const call = { session_id: play.id, tool_name: 'Read', tool_input: input, cwd: process.cwd() };
  const answers = cli.runHooks(play.settings, 'PreToolUse', call);
  const ruled = file !== undefined && (play.settings.permissions?.allow ?? []).includes(ruleOf(file));
  const answer = play.core.fakeImageAnswer(file, ruled && hookDenial(answers) === undefined);
  cli.speak(play, [{ type: 'text', text: JSON.stringify(answer) }]);
  return cli.finish(play, play.schema === undefined ? {} : { structured_output: answer });
}
