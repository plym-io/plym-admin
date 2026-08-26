export const CONSOLE_URL = 'https://cloud.plym.io';

/**
 * Where a cloud account gets back in. The panel links here rather than
 * resetting anything itself: Root has no password a person types into this
 * blog — it arrives by handoff from the console — so the sign-in that is
 * actually worth recovering is the console account's.
 *
 * That sign-in has no password either. plym Cloud mails a single-use link to
 * the account's address, so the console's sign-in page *is* the recovery
 * page, and there is nothing else to point at: /forgot is gone.
 */
export const CONSOLE_SIGNIN_URL = `${CONSOLE_URL}/login`;

/**
 * Where a cloud customer reaches a person. The panel's own /support screen is
 * the better door while the panel is working — it is one click away and it
 * knows which edition it is talking about — so this address is for the case
 * where the panel itself is what has gone wrong.
 */
export const CONSOLE_SUPPORT_URL = `${CONSOLE_URL}/support`;
