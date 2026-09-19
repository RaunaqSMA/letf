import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  displayName: string;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  displayName: "",
});

/** Keeps a public.profiles row in sync with the signed-in auth user. */
async function ensureProfile(user: User) {
  try {
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name:
          (user.user_metadata?.["display_name"] as string | undefined) ?? null,
      },
      { onConflict: "id" },
    );
  } catch {
    /* profile is convenience data; never block sign-in on it */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      if (next?.user) void ensureProfile(next.user);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) void ensureProfile(data.session.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const user = session?.user ?? null;
    const meta = user?.user_metadata?.["display_name"] as string | undefined;
    return {
      session,
      user,
      loading,
      displayName: meta || user?.email || "",
    };
  }, [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/records`,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}
