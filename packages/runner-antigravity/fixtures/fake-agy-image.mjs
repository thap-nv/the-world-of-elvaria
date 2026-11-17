// The conformance suite's `image` (PS-11b) for fake-agy.mjs: a judge reads the probe's PNG with read_file, through the
// PreToolUse hook and then the read_file rules of its settings, prefixes on `/` paths as agy 1.5.9 compares them
// (vision spike 2026-11-17: `read_file(E:/…/home.png)`, the drive as the path has it), then "sees" its stripes. Written
// apart from the adapter's settings, so a rule the adapter writes in another form is refused here too.
import process from 'node:process';

const prefixesOf = (rules) => (rules ?? []).flatMap((rule) => /^read_file\((.+)\)$/.exec(rule)?.[1] ?? []);

/** Whether agy's own rules let read_file open `file` once the hook deferred to them: deny first, then allow. */
function granted(settings, file) {
  const at = file.replaceAll('\\', '/');
  if (prefixesOf(settings.permissions?.deny).some((prefix) => at.startsWith(prefix))) return false;
  return prefixesOf(settings.permissions?.allow).some((prefix) => at.startsWith(prefix));
}

/** The judge's answer; `agy` holds fake-agy's own: core, settings, runHook, base, and the step's index. */
export function readImage(agy) {
  const file = agy.core.fakeImageOf(process.env);
  const toolCall = { name: 'read_file', args: { Path: file } };
  const hook = agy.runHook('PreToolUse', agy.base({ stepIdx: agy.stepIdx, toolCall }));
  const decision = hook.declared ? hook.decision?.decision : 'allow';
  const deferred =
    decision === 'allow' || (decision === 'deny_unless_prior_grant' && granted(agy.settings, file));
  return agy.core.fakeImageAnswer(file, file !== undefined && hook.failed !== true && deferred);
}
