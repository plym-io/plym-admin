import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Navigate } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowSquareOut,
  CircleNotch,
  Envelope,
  Eye,
  EyeSlash,
  LockKey,
  WarningCircle,
} from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { useIsCloud } from '@/store/cloud';
import { CONSOLE_URL } from '@/lib/console';
import { isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useResolvedTheme, type ResolvedTheme } from '@/store/theme';
import { cn } from '@/lib/classnames';
import { asset } from '@/lib/base';
import homeLight from '@/assets/login/home-light.webp';
import homeDark from '@/assets/login/home-dark.webp';

interface Form {
  email: string;
  password: string;
}

/**
 * The panel behind the door, in the theme the door is painted in. Both faces
 * ship with the bundle rather than loading from plym.io: an OSS instance is
 * often the only thing on its network, and a sign-in screen that needs the
 * internet to look finished is a sign-in screen that looks broken.
 */
const SHOT: Record<ResolvedTheme, string> = { light: homeLight, dark: homeDark };

const FIELD =
  'peer h-11 rounded-lg pl-10 pr-3 text-[15px] shadow-xs transition-[border-color,box-shadow] focus:ring-4 focus:ring-accent-soft';

function Field({
  id,
  label,
  icon,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-fg-muted"
      >
        {label}
      </label>
      {/* The input comes first so the icon can be `peer-focus:` styled off it. */}
      <div className="relative flex items-center">
        {children}
        <span className="pointer-events-none absolute left-3 flex text-fg-subtle transition-colors peer-focus:text-accent">
          {icon}
        </span>
      </div>
      {hint}
    </div>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Decorative: the word beside it already says the name, which is also
          what keeps this honest if the file never arrives. */}
      <img src={asset('logo.svg')} alt="" aria-hidden className="h-8 w-auto" />
      <span className="font-display text-[22px] font-bold leading-none tracking-[-0.04em]">
        plym
      </span>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useResolvedTheme();
  const reduceMotion = useReducedMotion();
  const { isAuthenticated, setTokens, setUser } = useAuthStore();
  const isCloud = useIsCloud();
  const { register, handleSubmit } = useForm<Form>();
  const [error, setError] = useState<string | null>(null);
  const [consoleHint, setConsoleHint] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const password = register('password', { required: true });
  const readCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(e.getModifierState('CapsLock'));

  /* The stylesheet's reduced-motion rule reaches CSS animations only, and
     these are driven in JS — so they have to ask for themselves. The travel
     goes; the fade stays. */
  const rise = (y: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
  });

  if (isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (values: Form) => {
    setSubmitting(true);
    setError(null);
    setConsoleHint(false);
    try {
      const tokens = await call(
        api.POST('/api/auth/login', { body: values }),
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await call(api.GET('/api/users/me'));
      setUser(me);
      navigate(from, { replace: true });
    } catch (e) {
      const status = isApiError(e) ? e.status : 0;
      setError(
        status === 401
          ? "That doesn't look right. Try again."
          : isApiError(e)
            ? e.message
            : 'Could not reach the server.',
      );
      // A 401 on a cloud blog most often means the owner is at the wrong
      // door: their sign-in is the console's, which mails them a link rather
      // than taking a password at all. "Try again" alone would send them
      // straight back through this one.
      setConsoleHint(isCloud && status === 401);
      setShaking(true);
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[1.1fr_minmax(0,1fr)]">
      {/* Left — the recessed plane, and the product standing on it. */}
      <aside className="relative hidden overflow-hidden bg-canvas lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(150deg, var(--color-bg-subtle) 0%, var(--color-canvas) 46%, var(--color-bg-subtle) 100%)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(72% 56% at 8% 2%, var(--color-accent-soft), transparent 62%)',
            }}
          />
          {/* Faded plotting grid. Gradients rather than an inline SVG: the
              build's CSS minifier is not to be trusted with a data: URI. */}
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
              backgroundSize: '52px 52px',
              maskImage:
                'radial-gradient(64% 58% at 26% 18%, #000, transparent 76%)',
              WebkitMaskImage:
                'radial-gradient(64% 58% at 26% 18%, #000, transparent 76%)',
            }}
          />
        </div>

        <div className="relative z-10 px-14 pt-16 xl:px-20 xl:pt-20">
          {/* The product's own positioning line, and nothing else — a sign-in
              screen is not the place for a pitch. */}
          <h2 className="max-w-[14ch] font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-fg">
            Modern CMS for the AI-native web.
          </h2>
        </div>

        <motion.div
          {...rise(18)}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mt-10 min-h-0 flex-1 overflow-hidden"
        >
          <div
            className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 blur-3xl"
            aria-hidden
            style={{
              background:
                'radial-gradient(42% 42% at 34% 26%, var(--color-accent-soft), transparent 72%)',
            }}
          />
          {/* Both faces are in the DOM from first paint, stacked, and the theme
              only changes which one is opaque. Swapping a single `src` makes
              the first toggle wait on a download; there is nothing to wait for
              if the file is already decoded.

              Sized by height, so it fills this column top to bottom and runs
              off the right edge. Driving it from the width instead would leave
              the top or the bottom short of the frame at some window sizes,
              and a screenshot cut along the top reads as a mistake in a way
              one cut along the side does not. */}
          {(['light', 'dark'] as const).map((face) => (
            <img
              key={face}
              src={SHOT[face]}
              alt=""
              aria-hidden
              data-shot={face}
              data-active={face === theme}
              className={cn(
                'absolute inset-y-0 left-14 h-full w-auto max-w-none rounded-tl-xl border-l border-t border-border shadow-lg transition-opacity duration-300 xl:left-20',
                face === theme ? 'opacity-100' : 'opacity-0',
              )}
            />
          ))}
        </motion.div>

        {/* The shot is cut off by the form's edge, and what it happens to be
            showing there is whatever the screenshot had at that column — in
            dark, its cards are --p-surface, the same colour the form panel is.
            Fading the last stretch into --p-canvas means the colour arriving at
            the seam is always the recessed plane, whatever the pixels behind
            it are, and recessed-against-surface is a step the palette
            guarantees in both themes. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-20 w-24"
          aria-hidden
          style={{
            background:
              'linear-gradient(to right, transparent, var(--color-canvas) 92%)',
          }}
        />
      </aside>

      {/* Right — the form, on the surface plane so it reads as the foreground.
          It has to say so at the seam: in dark the panel and the screenshot's
          own cards are both --p-surface, so with nothing between them the shot
          dissolves into the form instead of ending. The border is the one thing
          that reads in both themes — lighter than either surface in dark,
          darker than either in light — and the shadow puts this plane in front
          rather than merely beside. */}
      <div className="relative z-20 flex flex-col lg:border-l lg:border-border lg:shadow-[-32px_0_64px_-32px_rgba(0,0,0,0.35)]">
        <div className="flex justify-end px-6 pt-6 sm:px-10">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10">
          <motion.div
            {...rise(10)}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onAnimationEnd={() => setShaking(false)}
            className={cn('w-full max-w-[368px]', shaking && 'animate-shake')}
          >
            <Wordmark />

            <h1 className="mt-9 font-display text-[27px] font-semibold leading-none tracking-[-0.03em]">
              Sign in
            </h1>
            {/* Which panel this is. An admin who runs several should not have
                to read the address bar to find out which door they're at. */}
            <p className="mt-2 text-sm text-fg-muted">
              to <span className="font-medium text-fg">{window.location.host}</span>
            </p>

            {/* On a cloud blog the owner has no password in this blog's user
                table — their credential lives at the console, and the panel
                opens from there. Say so before the form's 401 has to. The
                email/password pair below still belongs to team accounts
                created inside the panel. */}
            {isCloud && (
              <>
                <a
                  href={CONSOLE_URL}
                  className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-subtle px-5 text-[15px] font-medium text-fg shadow-xs transition-colors hover:bg-bg-muted"
                >
                  Sign in with plym Cloud
                  <ArrowSquareOut
                    size={16}
                    weight="bold"
                    className="text-fg-subtle"
                  />
                </a>
                <div className="mt-6 flex items-center gap-3 text-[12px] text-fg-subtle">
                  <span aria-hidden className="h-px flex-1 bg-border" />
                  or with a team account
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className={cn('space-y-4', isCloud ? 'mt-6' : 'mt-8')}
            >
              <Field id="email" label="Email" icon={<Envelope size={17} />}>
                <Input
                  id="email"
                  type="email"
                  autoFocus
                  autoComplete="username"
                  placeholder="you@example.com"
                  className={FIELD}
                  {...register('email', { required: true })}
                />
              </Field>

              <Field
                id="password"
                label="Password"
                icon={<LockKey size={17} />}
                hint={
                  capsLock && (
                    <p className="mt-1.5 text-[12px] text-warning">
                      Caps Lock is on.
                    </p>
                  )
                }
              >
                <Input
                  id="password"
                  type={reveal ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(FIELD, 'pr-11')}
                  {...password}
                  onKeyUp={readCapsLock}
                  onKeyDown={readCapsLock}
                  onBlur={(e) => {
                    void password.onBlur(e);
                    setCapsLock(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  {reveal ? <EyeSlash size={17} /> : <Eye size={17} />}
                </button>
              </Field>

              {error && (
                <motion.p
                  role="alert"
                  {...rise(-4)}
                  className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2.5 text-[13px] text-danger"
                >
                  <WarningCircle
                    size={16}
                    weight="fill"
                    className="mt-px shrink-0"
                  />
                  {error}
                </motion.p>
              )}

              {/* Anyone's wrong password lands here, so the line names who it
                  is for and stays out of everyone else's way. */}
              {error && consoleHint && (
                <p className="text-[13px] text-fg-muted">
                  If you are the Root user,{' '}
                  <a
                    href={CONSOLE_URL}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    sign in here
                  </a>
                  .
                </p>
              )}

              <Button
                type="submit"
                variant="accent"
                size="lg"
                disabled={submitting}
                aria-busy={submitting}
                className="w-full rounded-lg"
              >
                {submitting ? (
                  <>
                    <CircleNotch size={16} weight="bold" className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={16} weight="bold" />
                  </>
                )}
              </Button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
