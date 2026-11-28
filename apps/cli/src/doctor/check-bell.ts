// Describe the desktop bell without showing a toast. The notifier's platform gate is shared with doctor.
import type { Translate } from '@elvaria/i18n';

import { isDesktopPlatform } from '../bell/platform.ts';
import { finding } from './finding.ts';
import type { Finding } from './finding.ts';

export function checkBell(
  t: Translate,
  desktop: boolean,
  platform: NodeJS.Platform,
  registered = false,
): Finding[] {
  if (!desktop) return [finding('ok', t('bell.doctor.off'))];
  if (!isDesktopPlatform(platform)) return [finding('warn', t('bell.doctor.unsupported', { platform }))];
  return [
    finding(
      platform === 'win32' && !registered ? 'warn' : 'ok',
      t('bell.doctor.on', { platform: platform === 'win32' ? 'Windows' : 'macOS' }),
      platform === 'win32' ? [t(registered ? 'bell.doctor.registered' : 'bell.doctor.unregistered')] : [],
    ),
  ];
}
