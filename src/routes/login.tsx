import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation, Navigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight } from '@phosphor-icons/react';
import { api, call } from '@/api/client';
import { useAuthStore } from '@/store/auth';
import { isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/classnames';

interface Form {
  email: string;
  password: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, setTokens, setUser } = useAuthStore();
  const { register, handleSubmit } = useForm<Form>();
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (values: Form) => {
    setSubmitting(true);
    setError(null);
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
      setShake((s) => s + 1);
      setSubmitting(false);
    }
  };

  return (
    <div className="grid h-screen grid-cols-1 bg-bg lg:grid-cols-[1.1fr_1fr]">
      {/* Left — slow gradient field with the logo. */}
      <div className="relative hidden overflow-hidden lg:block">
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 120% at 20% 20%, var(--color-accent-soft), var(--color-bg-subtle) 60%)',
          }}
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
          }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute left-8 top-8 flex items-center gap-2">
          <img
            src="/logo.webp"
            alt="plym"
            className="h-9 w-auto"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = 'none';
              el.insertAdjacentHTML(
                'afterend',
                '<span class="font-serif text-2xl font-bold tracking-tight">plym</span>',
              );
            }}
          />
        </div>
        <div className="absolute bottom-10 left-8 max-w-sm">
          <p className="font-serif text-2xl leading-snug text-fg">
            plym helps you get your story the reach it deserves.
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            Modern CMS for the AI-native web.
          </p>
        </div>
      </div>

      {/* Right — the card. */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          key={shake}
          className={cn('w-full max-w-sm', shake > 0 && 'animate-shake')}
        >
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Welcome back. Let's get you to your drafts.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm text-fg-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoFocus
                autoComplete="username"
                {...register('email', { required: true })}
                className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-fg-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password', { required: true })}
                className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm transition-colors hover:border-border-strong focus:border-accent focus:outline-none"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-danger"
              >
                {error}
              </motion.p>
            )}

            <Button
              type="submit"
              variant="accent"
              size="lg"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? (
                'Authenticating…'
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
  );
}
