import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setTokens: (access: string, refresh: string) => void;
  beginSession: (access: string, refresh: string) => void;
  setUser: (user: User | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),
      // A session this panel did not sign in for — the cloud handoff. Unlike a
      // renewal, the tokens belong to whoever the console handed over, so the
      // identity goes with the ones they replace: the panel asks who it is
      // rather than inheriting whoever was signed in here before.
      beginSession: (access, refresh) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          user: null,
          isAuthenticated: true,
        }),
      setUser: (user) => set({ user }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'plym.auth',
      // Persist only tokens — the user object is refetched on mount.
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);
