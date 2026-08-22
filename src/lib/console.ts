export const CONSOLE_URL = 'https://cloud.plym.io';

/**
 * Where a cloud account recovers its own sign-in. The panel links here rather
 * than resetting anything itself: Root has no password a person types into
 * this blog — it arrives by handoff from the console — so the credential that
 * is actually worth recovering is the console account's.
 */
export const CONSOLE_FORGOT_URL = `${CONSOLE_URL}/forgot`;
