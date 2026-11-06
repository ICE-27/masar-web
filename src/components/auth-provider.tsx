"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBackend, type AuthUser, type Backend, type Profile } from "@/lib/data";

type Status = "loading" | "signed-out" | "signed-in";

interface AuthState {
  status: Status;
  user: AuthUser | null;
  profile: Profile | null;
  backend: Backend;
  refresh: () => Promise<void>;
  setProfile: (p: Profile) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(async () => {
    try {
      const u = await backend.getUser();
      if (!u) {
        setUser(null);
        setProfile(null);
        setStatus("signed-out");
        return;
      }
      const p = await backend.getProfile();
      setUser(u);
      setProfile(p);
      setStatus("signed-in");
    } catch {
      setUser(null);
      setProfile(null);
      setStatus("signed-out");
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
    return backend.onAuthChange(() => void refresh());
  }, [backend, refresh]);

  const value = useMemo(
    () => ({ status, user, profile, backend, refresh, setProfile }),
    [status, user, profile, backend, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Next hydrates a page in pieces. The session check can finish before an
 * inner piece has hydrated, and that piece would then render "signed in"
 * against server HTML that says "loading". So each component reports
 * "loading" until it has mounted itself; its first render always matches
 * the server, and the real state follows one frame later.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return useMemo(
    () => (mounted ? ctx : { ...ctx, status: "loading" as const, user: null, profile: null }),
    [mounted, ctx],
  );
}
