import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '@/store/auth';
import { call, api } from '@/api/client';

/**
 * Gate for everything except /admin/login. Hydrates the current user from
 * the token on mount; bounces to login if there's no session.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const [checking, setChecking] = useState(!user);

  useEffect(() => {
    if (!isAuth) {
      setChecking(false);
      return;
    }
    if (user) {
      setChecking(false);
      return;
    }
    call(api.GET('/api/users/me'))
      .then((u) => setUser(u))
      .catch(() => clear())
      .finally(() => setChecking(false));
  }, [isAuth, user, setUser, clear]);

  if (!isAuth) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  return <>{children}</>;
}
