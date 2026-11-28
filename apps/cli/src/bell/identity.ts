import { fileURLToPath } from 'node:url';

const BELL_ICON_URL = new URL('../../assets/bell/elvaria-bell.png', import.meta.url);

/** Assets belong to the git worktree, alongside both src and dist, including pinned builds. */
export const bellIcon = (): string => fileURLToPath(BELL_ICON_URL);

export const BELL_APP_ID = 'Elvaria';
export const BELL_REGISTRY_KEY = `HKCU\\Software\\Classes\\AppUserModelId\\${BELL_APP_ID}`;
