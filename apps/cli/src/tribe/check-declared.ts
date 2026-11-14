// What `elvaria tribe check` prints first (implementation-plan §3.14): what the tribe's adapter declares, the facts
// it declares per OS (the shell its sessions run commands in, P1-46; the longest user prompt its CLI takes,
// fix/verifier-prompt-limit, ADR 0021), and how far tribeLimitsOf lets the tribe go. Out of check.ts, which runs
// the suite, to keep both under the size limit (fix/cli-lines).
import { ADAPTER_CAPABILITIES, SHELL_PLATFORMS, promptMaxOf, shellOf, tribeLimitsOf } from '@elvaria/domain';
import type { AdapterCapabilities, Tribe } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

/** The shell the adapter declares per OS (P1-46, (b) of P1-40): `win32: Git Bash`; none when it declares none. */
function shellLine(t: Translate, caps: AdapterCapabilities): string {
  const shells = SHELL_PLATFORMS.flatMap((os) => {
    const shell = shellOf(caps, os);
    return shell === undefined ? [] : [`${os}: ${shell}`];
  });
  return shells.length === 0
    ? t('cli.tribe.check.no_shell')
    : t('cli.tribe.check.shell', { shells: shells.join('; ') });
}

/**
 * The prompt limit the adapter declares per OS (`win32: 26000`), as the shell is (fix/cli-lines, (97)). No line when
 * it declares none: no limit is the usual case, and nothing about the tribe's sessions changes with it.
 */
function promptLines(t: Translate, caps: AdapterCapabilities): string[] {
  const limits = SHELL_PLATFORMS.flatMap((os) => {
    const max = promptMaxOf(caps, os);
    return max === undefined ? [] : [`${os}: ${String(max)}`];
  });
  return limits.length === 0 ? [] : [t('cli.tribe.check.prompt_max', { limits: limits.join('; ') })];
}

/** What the adapter declares and how far tribeLimitsOf lets the tribe go. */
export function capabilityLines(t: Translate, tribe: Tribe, caps: AdapterCapabilities): string[] {
  const declared = ADAPTER_CAPABILITIES.filter((name) => caps[name]);
  const missing = ADAPTER_CAPABILITIES.filter((name) => !caps[name]);
  const limits = tribeLimitsOf(caps);
  const params = { tribe: tribe.id, adapter: tribe.adapter, auth: caps.auth.join(', ') };
  return [
    t('cli.tribe.check.declared', { ...params, capabilities: declared.join(', ') }),
    ...(missing.length === 0 ? [] : [t('cli.tribe.check.missing', { capabilities: missing.join(', ') })]),
    shellLine(t, caps),
    ...promptLines(t, caps),
    t('cli.tribe.check.max_rank', { rank: limits.max_rank }),
    ...(limits.guarded_zones ? [] : [t('cli.tribe.check.no_guarded')]),
  ];
}
