import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/endpoints';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state.
 *
 * The browser holds no token: `/auth/me` is the source of truth and the cookies
 * do the rest. That keeps the SPA free of any credential handling.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me(),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const setUser = useCallback(
    (user: User) => queryClient.setQueryData(['auth', 'me'], { user }),
    [queryClient],
  );

  const unlockMutation = useMutation({
    mutationFn: (password: string) => authApi.unlock({ password }),
    onSuccess: (result) => setUser(result.user),
  });

  const lockMutation = useMutation({
    mutationFn: authApi.lock,
    onSettled: () => queryClient.clear(),
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data?.user ?? null,
      isLoading,
      isAuthenticated: Boolean(data?.user),
      unlock: async (password) => {
        await unlockMutation.mutateAsync(password);
      },
      lock: async () => {
        await lockMutation.mutateAsync();
      },
      refreshUser: async () => {
        await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      },
    }),
    [data, isLoading, unlockMutation, lockMutation, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
