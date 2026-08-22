import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight } from '@phosphor-icons/react';
import { redeemHandoff, type CloudError } from '@/api/cloud';
import { isApiError } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { CONSOLE_URL } from '@/lib/console';

/**
 * Where the visitor goes when the handoff cannot finish: back to the console
 * that issues these links, or to the password form for a blog that has no
 * console behind it.
 */
type WayOut = 'console' | 'login';

interface Failure {
  message: string;
  remedy: string | null;
  wayOut: WayOut;
}

const INCOMPLETE: Failure = {
  message: 'This sign-in link is incomplete.',
  remedy: 'Open the admin from the plym Cloud console again.',
  wayOut: 'console',
};

const UNREACHABLE: Failure = {
  message: 'Could not reach this blog to finish signing you in.',
  remedy: 'Open the admin from the plym Cloud console again.',
  wayOut: 'console',
};

/**
 * No gateway answered. Either this blog is self-hosted and was never going to
 * have a console session to hand over, or its gateway route is broken — and
 * the password form is the way in for both.
 */
const NO_GATEWAY: Failure = {
  message: 'This blog does not sign in through the plym Cloud console.',
  remedy: 'Sign in with your email and password instead.',
  wayOut: 'login',
};

/**
 * A gateway answered, but not about a handoff — the tenant is running a
 * platform from before this flow existed, so its catch-all proxy sees the
 * redeem as an unauthenticated API call and says so in those terms. Nothing
 * upstream of here is written for the person reading this page, so we say it
 * ourselves and hand support a phrase to search for.
 */
const UNSUPPORTED: Failure = {
  message: 'This blog could not complete the sign-in.',
  remedy:
    'Open the admin from the plym Cloud console again. If it keeps failing, tell ' +
    'support this blog cannot redeem sign-in links.',
  wayOut: 'console',
};

/** The failures the handoff itself defines, and so the only ones that explain themselves. */
const HANDOFF_KINDS = new Set(['handoff_code', 'handoff_denied']);

function failureOf(e: unknown): Failure {
  if (!isApiError(e)) return UNREACHABLE;
  if (e.status === 404) return NO_GATEWAY;
  const error = e as CloudError;
  if (!HANDOFF_KINDS.has(error.code)) return UNSUPPORTED;
  // A spent code, or a blog that cannot take a session right now: the control
  // plane writes both for a person to read, and its remedy is this page's
  // whole purpose.
  return {
    message: error.message,
    remedy: error.remedy ?? INCOMPLETE.remedy,
    wayOut: 'console',
  };
}

/**
 * The last leg of a plym Cloud handoff: the console has already vouched for
 * whoever is arriving, and this page spends the code it sent them with.
 *
 * The code rides in the URL fragment, which is why the exchange has to happen
 * in the browser at all — a fragment never reaches a server, a log or a
 * Referer header. It is single-use and short-lived, so this page redeems it
 * once, drops it from the address bar, and either lands on the dashboard or
 * says plainly that the link is spent. Nothing here is retried: a second
 * attempt with the same code is a failure by construction.
 */
export default function Handoff() {
  const navigate = useNavigate();
  const beginSession = useAuthStore((s) => s.beginSession);
  const [failure, setFailure] = useState<Failure | null>(null);
  const spent = useRef(false);

  useEffect(() => {
    // React runs this effect twice under StrictMode, and the second run would
    // redeem a code the first one has already burned.
    if (spent.current) return;
    spent.current = true;

    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    // Take the credential out of the address bar before spending it: it has no
    // second use, and leaving it there puts it in history and in every shared
    // screen for as long as this page is open.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );

    if (!code) {
      setFailure(INCOMPLETE);
      return;
    }

    redeemHandoff(code)
      .then((session) => {
        beginSession(session.accessToken, session.refreshToken);
        navigate('/', { replace: true });
      })
      .catch((e: unknown) => setFailure(failureOf(e)));
  }, [beginSession, navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-bg p-6">
      {failure ? (
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold tracking-tight">{failure.message}</h1>
          {failure.remedy && (
            <p className="mt-2 text-sm text-fg-muted">{failure.remedy}</p>
          )}
          <div className="mt-6">
            {failure.wayOut === 'console' ? (
              <a
                href={CONSOLE_URL}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Back to the plym Cloud console <ArrowRight size={13} weight="bold" />
              </a>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                Go to sign in <ArrowRight size={13} weight="bold" />
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div role="status" className="flex items-center gap-3 text-sm text-fg-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
          Signing you in…
        </div>
      )}
    </div>
  );
}
