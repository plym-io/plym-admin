import { useEffect, useState } from 'react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { ArrowRight, Compass, WarningCircle, Wrench } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { CONSOLE_SUPPORT_URL } from '@/lib/console';
import { isStaleBuild } from '@/lib/stale-build';
import { useIsCloud } from '@/store/cloud';
import type { UiIcon } from '@/components/ui/icon';

/** How often we ask whether the panel is being served again. */
const PROBE_INTERVAL = 5000;

/**
 * A reload is the cure for a build that was replaced under an open page — but
 * only the first time. If the page we reload into fails the same way, reloading
 * is not the cure, and repeating it would spin the browser instead of saying
 * anything. The mark is written before the reload and read on the way back, so
 * a second failure within the minute stays put and leaves the move to whoever
 * is reading.
 */
const RELOAD_MARK = 'plym.admin.reloaded';
const RELOAD_WINDOW = 60_000;

function reloadedJustNow(): boolean {
  const at = Number(sessionStorage.getItem(RELOAD_MARK));
  return at > 0 && Date.now() - at < RELOAD_WINDOW;
}

function reloadPanel() {
  sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  window.location.reload();
}

/**
 * Waits for the panel to answer again and goes straight back to it, which is
 * what makes the wait unattended: an update lands, the next probe succeeds and
 * the reader is returned to the route they asked for on the build that is now
 * being served.
 *
 * The probe is the current address, because that is the thing that has to work
 * — the server answers every route under the mount with the panel's shell, and
 * a shell that comes back means the assets beside it did too. A refused request
 * is not an exception here, it is the answer: still down, ask again shortly.
 *
 * Returns whether the panel is back but reloading has been left to the reader.
 */
function usePanelReturn(watch: boolean): boolean {
  const [back, setBack] = useState(false);

  useEffect(() => {
    if (!watch || back) return;

    const controller = new AbortController();
    let timer = 0;

    const probe = async () => {
      const answering = await fetch(window.location.href, {
        cache: 'no-store',
        signal: controller.signal,
      }).then(
        (res) => res.ok,
        () => false,
      );
      if (controller.signal.aborted) return;
      if (!answering) {
        timer = window.setTimeout(probe, PROBE_INTERVAL);
        return;
      }
      if (reloadedJustNow()) setBack(true);
      else reloadPanel();
    };

    void probe();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [watch, back]);

  return back;
}

function Screen({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: UiIcon;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-bg-muted text-fg-subtle">
          <Icon size={22} weight="duotone" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{body}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * The way out of a failure that outlasts the wait, for the edition that has
 * one. A self-hosted blog's panel is answerable to whoever runs it, and there
 * is nobody else to send them to.
 */
function SupportLine() {
  if (!useIsCloud()) return null;
  return (
    <p className="mt-6 text-sm text-fg-muted">
      If this keeps happening,{' '}
      <a href={CONSOLE_SUPPORT_URL} className="font-medium text-accent hover:underline">
        contact support
      </a>
      .
    </p>
  );
}

function Updating() {
  const back = usePanelReturn(true);
  return (
    <Screen
      icon={Wrench}
      title="The admin portal is being updated"
      body={
        back
          ? 'It is answering again. Reload to pick up where you left off.'
          : 'This usually takes a couple of minutes. The page comes back on its own as soon as the update lands.'
      }
    >
      <div className="mt-6 flex flex-col items-center gap-4">
        <Button variant="primary" onClick={reloadPanel}>
          Reload now
        </Button>
        {!back && (
          <div
            role="status"
            className="flex items-center gap-2 text-[13px] text-fg-subtle"
          >
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
            Waiting for it to come back…
          </div>
        )}
      </div>
      <SupportLine />
    </Screen>
  );
}

function NotFound() {
  return (
    <Screen
      icon={Compass}
      title="That page isn’t here"
      body="The address may have moved, or it was never part of the panel."
    >
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          Go to the dashboard <ArrowRight size={13} weight="bold" />
        </Link>
      </div>
    </Screen>
  );
}

function Broken({ detail }: { detail: string | null }) {
  return (
    <Screen
      icon={WarningCircle}
      title="Something went wrong"
      body="The panel hit an error it could not carry on from. Reloading usually clears it."
    >
      {detail && (
        <p className="mt-3 rounded-md bg-bg-subtle px-3 py-2 font-mono text-[12px] break-words text-fg-subtle">
          {detail}
        </p>
      )}
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button variant="primary" onClick={reloadPanel}>
          Reload now
        </Button>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          Go to the dashboard <ArrowRight size={13} weight="bold" />
        </Link>
      </div>
      <SupportLine />
    </Screen>
  );
}

/**
 * What the panel says instead of failing in developer language.
 *
 * Three failures reach here and they are not the same news. A screen whose
 * chunk is gone means the deployment moved on without this tab and the wait is
 * measured in minutes; an address that matches no route is a dead link and no
 * amount of waiting fixes it; anything else is a fault worth naming, with the
 * one line support would ask for kept on screen.
 */
export function RouteError() {
  const error = useRouteError();

  if (isStaleBuild(error)) return <Updating />;
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <Broken detail={error instanceof Error ? error.message : null} />;
}
